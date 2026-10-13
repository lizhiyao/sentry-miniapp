import type { eventWithTime } from '@rrweb/types';
import {
  createEnvelope,
  dsnToString,
  getClient,
  getDiagnostics,
  MiniappClient,
  utf8ByteLength,
  uuid4,
} from '../index';
import type { Breadcrumb, Event, EventHint, Integration, ReplayEvent } from '../index';
import { clickEvent, frameEvents, projectFrame, REPLAY_STYLES } from './frame';
import type {
  ReplayFrame,
  WechatPageReplay,
  WechatPageReplayDiagnostics,
  WechatPageReplayOptions,
} from './types';
export type {
  WechatPageReplay,
  WechatPageReplayDiagnostics,
  WechatPageReplayOptions,
} from './types';

interface Query {
  in(page: object): Query;
  selectViewport(): { fields(fields: object): Query };
  selectAll(selector: string): { fields(fields: object): Query };
  exec(callback: (results: unknown) => void): unknown;
}
interface Host {
  createSelectorQuery(): Query;
}
interface Page {
  route?: string;
  renderer?: string;
}

const recorders = new WeakMap<MiniappClient, { recorder: Recorder; stop: () => void }>();
const DEFAULTS = {
  selector: '.sentry-replay',
  intervalMs: 500,
  flushIntervalMs: 10000,
  maxNodes: 200,
  maxSegmentBytes: 128 * 1024,
  maxDurationMs: 300000,
};

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
    ? Math.min(Math.floor(value), max)
    : fallback;
}

/** 微信标记节点的布局回放；不访问 WebView 私有 DOM，也不包装业务 setData。 */
export function wechatPageReplayIntegration(
  options: WechatPageReplayOptions = {},
): ReplayIntegration {
  const config = {
    selector:
      typeof options.selector === 'string' &&
      options.selector.length > 0 &&
      options.selector.length <= 256
        ? options.selector
        : DEFAULTS.selector,
    intervalMs: bounded(options.intervalMs, DEFAULTS.intervalMs, 100, 10000),
    flushIntervalMs: bounded(options.flushIntervalMs, DEFAULTS.flushIntervalMs, 1000, 60000),
    maxNodes: bounded(options.maxNodes, DEFAULTS.maxNodes, 1, 500),
    maxSegmentBytes: bounded(options.maxSegmentBytes, DEFAULTS.maxSegmentBytes, 8192, 512 * 1024),
    maxDurationMs: bounded(options.maxDurationMs, DEFAULTS.maxDurationMs, 1000, 900000),
  };
  let installedClient: MiniappClient | undefined;
  return {
    getReplay: () => installedClient && recorders.get(installedClient)?.recorder,
    name: 'WechatPageReplay',
    setup(client) {
      if (!(client instanceof MiniappClient) || !client.isActiveRuntime()) return;
      recorders.get(client)?.stop();
      installedClient = client;
      const recorder = new Recorder(client, config);
      let stopped = false;
      const releases: (() => void)[] = [];
      const entry = {
        recorder,
        stop: () => {
          if (stopped) return;
          stopped = true;
          recorder.destroy();
          if (installedClient === client) installedClient = undefined;
          releases.splice(0).forEach((release) => release());
          if (recorders.get(client) === entry) recorders.delete(client);
        },
      };
      const adopt = (release: () => void): void => {
        if (stopped) release();
        else releases.push(release);
      };
      recorders.set(client, entry);
      const observe = (callback: () => void): void => {
        try {
          callback();
        } catch (_error) {
          /* Replay does not block business telemetry. */
        }
      };
      adopt(
        client.on('preprocessEvent', (event, hint) =>
          observe(() => recorder.rememberError(event, hint)),
        ),
      );
      adopt(
        client.on('postprocessEvent', (event, hint) =>
          observe(() => recorder.linkError(event, hint)),
        ),
      );
      adopt(
        client.on('afterSendEvent', (event, response) => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300)
            observe(() => recorder.acceptError(event));
        }),
      );
      adopt(
        client.on('beforeAddBreadcrumb', (breadcrumb) =>
          observe(() => recorder.recordInteraction(breadcrumb)),
        ),
      );
      adopt(
        client.registerAutomaticProducer({
          onShow: () => recorder.resume(),
          onHide: () => {
            void recorder.flush();
            recorder.pause();
          },
          onConsentChange: (granted) => recorder.consentChanged(granted),
          flush: () => {
            void recorder.flush();
          },
          stop: entry.stop,
        }),
      );
    },
  };
}

export function getWechatPageReplay(): WechatPageReplay | undefined {
  return getClient()?.getIntegrationByName<ReplayIntegration>('WechatPageReplay')?.getReplay();
}

interface ReplayIntegration extends Integration {
  getReplay(): WechatPageReplay | undefined;
}

type Config = typeof DEFAULTS;

class Recorder implements WechatPageReplay {
  private state: WechatPageReplayDiagnostics['state'] = 'waiting';
  private reason: string | undefined;
  private replayId: string | undefined;
  private frame: ReplayFrame | undefined;
  private frameKey = '';
  private events: eventWithTime[] = [];
  private bytes = 0;
  private segmentId = 0;
  private startedAt = 0;
  private lastSent = 0;
  private generation = 0;
  private foreground = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cancelQuery: (() => void) | undefined;
  private errors = new Set<string>();
  private dirty = false;
  private recordedPage: Page | undefined;
  private destroyed = false;
  private manuallyStopped = false;
  private readonly capturedErrors = new WeakMap<EventHint, string>();

  constructor(
    private client: MiniappClient | undefined,
    private readonly config: Config,
  ) {}

  getReplayId(): string | undefined {
    return this.replayId;
  }

  getDiagnostics(): WechatPageReplayDiagnostics {
    return {
      state: this.state,
      reason: this.reason,
      replayId: this.replayId,
      nodes: this.frame?.nodes.length ?? 0,
      segments: this.segmentId,
      bufferedBytes: this.bytes,
    };
  }

  private available(): Host | undefined {
    const diagnostics = getDiagnostics().platform;
    const host = (globalThis as { wx?: Host }).wx;
    return diagnostics.name === 'wechat' &&
      !diagnostics.isMinigame &&
      typeof host?.createSelectorQuery === 'function'
      ? host
      : undefined;
  }

  private eligible(): boolean {
    return (
      !this.destroyed &&
      this.client === getClient() &&
      (this.client?.isActiveRuntime() ?? false) &&
      this.client!.getConsent() &&
      this.state === 'recording'
    );
  }

  start(): boolean {
    const client = this.client;
    if (this.destroyed || !client?.isActiveRuntime()) return false;
    this.manuallyStopped = false;
    this.foreground = true;
    if (!client.getConsent()) {
      this.reason = 'consent_required';
      return false;
    }
    try {
      if (!this.available()) {
        this.state = 'unsupported';
        this.reason = 'unsupported_host';
        return false;
      }
    } catch (_error) {
      this.state = 'unsupported';
      this.reason = 'unreadable_host';
      return false;
    }
    if (this.state === 'recording') return true;
    this.state = 'recording';
    this.reason = undefined;
    this.replayId = uuid4();
    this.startedAt = this.lastSent = Date.now();
    this.segmentId = 0;
    this.frame = undefined;
    this.frameKey = '';
    this.events = [];
    this.dirty = false;
    this.recordedPage = undefined;
    this.bytes = 0;
    this.errors.clear();
    this.generation++;
    this.schedule();
    return true;
  }

  resume(): void {
    this.foreground = true;
    if (!this.manuallyStopped) this.start();
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.client = undefined;
  }

  pause(): void {
    this.foreground = false;
    this.generation++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.cancelQuery?.();
    this.cancelQuery = undefined;
    this.state = 'waiting';
  }

  stop(): void {
    this.manuallyStopped = true;
    this.pause();
    this.state = 'stopped';
    this.replayId = undefined;
    this.events = [];
    this.dirty = false;
    this.recordedPage = undefined;
    this.bytes = 0;
    this.frame = undefined;
    this.frameKey = '';
    this.errors.clear();
  }

  consentChanged(granted: boolean): void {
    const foreground = this.foreground;
    const manuallyStopped = this.manuallyStopped;
    this.stop();
    this.manuallyStopped = manuallyStopped;
    this.foreground = foreground;
    this.reason = granted ? undefined : 'consent_required';
    if (granted && foreground && !manuallyStopped) this.start();
  }

  private currentPage(): Page | undefined {
    try {
      const getPages = (globalThis as { getCurrentPages?: () => Page[] }).getCurrentPages;
      return getPages?.().slice(-1)[0];
    } catch (_error) {
      return undefined;
    }
  }

  private schedule(): void {
    if (!this.eligible() || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.capture().then(() => this.schedule());
    }, this.config.intervalMs);
  }

  async capture(): Promise<boolean> {
    if (!this.eligible() || this.cancelQuery) return false;
    if (Date.now() - this.startedAt >= this.config.maxDurationMs) {
      void this.flush();
      this.stop();
      this.reason = 'duration_limit';
      return false;
    }
    const token = this.generation;
    try {
      const page = this.currentPage();
      if (!page) {
        this.reason = 'no_page';
        return false;
      }
      if (page.renderer === 'skyline') {
        this.reason = 'skyline_unverified';
        return false;
      }
      const host = this.available();
      if (!host) {
        this.reason = 'unsupported_host';
        return false;
      }
      const results = await new Promise<unknown>((resolve) => {
        const owner: { recorder: Recorder | undefined } = { recorder: this };
        let complete: ((value: unknown) => void) | undefined = resolve;
        const finish = (value: unknown): void => {
          if (!complete) return;
          clearTimeout(timeout);
          if (owner.recorder) owner.recorder.cancelQuery = undefined;
          owner.recorder = undefined;
          const done = complete;
          complete = undefined;
          done(value);
        };
        const timeout = setTimeout(() => {
          if (owner.recorder) {
            owner.recorder.reason = 'query_timeout';
          }
          finish(undefined);
        }, 2000);
        this.cancelQuery = () => finish(undefined);
        try {
          const query = host.createSelectorQuery().in(page);
          query.selectViewport().fields({ size: true, scrollOffset: true });
          query.selectAll(this.config.selector).fields({
            dataset: true,
            rect: true,
            size: true,
            computedStyle: [...REPLAY_STYLES],
          });
          query.exec(finish);
        } catch (_error) {
          this.reason = 'query_failed';
          finish(undefined);
        }
      });
      if (results === undefined) return false;
      if (!this.eligible() || token !== this.generation || this.currentPage() !== page)
        return false;
      const frame = projectFrame(
        results,
        typeof page.route === 'string' ? page.route : 'unknown',
        this.config.maxNodes,
      );
      if (!this.eligible() || token !== this.generation) return false;
      if (!frame) {
        this.reason = 'invalid_or_oversized_frame';
        return false;
      }
      if (!frame.nodes.length && !this.frame) {
        this.reason = 'no_marked_nodes';
        return false;
      }
      const key = JSON.stringify(frame);
      if (key === this.frameKey) {
        if (Date.now() - this.lastSent >= this.config.flushIntervalMs) void this.flush();
        return true;
      }
      const events = frameEvents(frame, Date.now());
      if (!this.append(events, true)) return false;
      this.frame = frame;
      this.recordedPage = page;
      this.frameKey = key;
      this.reason = frame.nodes.length ? undefined : 'no_marked_nodes';
      if (Date.now() - this.lastSent >= this.config.flushIntervalMs) void this.flush();
      return true;
    } catch (_error) {
      this.reason = 'query_failed';
      return false;
    }
  }

  private append(events: eventWithTime[], keyframe = false): boolean {
    const limit = this.config.maxSegmentBytes - 128;
    if (utf8ByteLength(JSON.stringify(events)) > limit) {
      this.reason = 'frame_too_large';
      return false;
    }
    // 新布局快照可替换尚未变动的分段基线，点击则必须保留基线。
    if (keyframe && !this.dirty) this.events = [];
    let merged = [...this.events, ...events];
    let bytes = utf8ByteLength(JSON.stringify(merged));
    if (bytes > limit) {
      void this.flush();
      if (keyframe && !this.dirty) this.events = [];
      merged = [...this.events, ...events];
      bytes = utf8ByteLength(JSON.stringify(merged));
    }
    if (!this.eligible()) return false;
    if (bytes > limit) {
      this.reason = 'segment_full';
      return false;
    }
    this.events = merged;
    this.dirty = true;
    this.bytes = bytes;
    return true;
  }

  recordInteraction(breadcrumb: Breadcrumb): void {
    if (
      !this.eligible() ||
      !this.frame ||
      this.currentPage() !== this.recordedPage ||
      breadcrumb.category !== 'user.interaction'
    )
      return;
    const data = breadcrumb.data;
    if (!data || !['tap', 'click'].includes(String(data['eventType']))) return;
    // 微信 tap detail 与 touches 的 page 坐标均相对文档，转换到快照视口。
    const pageX = data['x'] ?? data['touchX'];
    const pageY = data['y'] ?? data['touchY'];
    if (typeof pageX !== 'number' || typeof pageY !== 'number') return;
    const x = pageX - this.frame.scrollLeft;
    const y = pageY - this.frame.scrollTop;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const event = clickEvent(this.frame, x, y, Date.now());
    if (event) this.append([event]);
  }

  rememberError(event: Event, hint: EventHint | undefined): void {
    if (
      hint &&
      this.eligible() &&
      this.frame &&
      this.currentPage() === this.recordedPage &&
      !event.type
    )
      this.capturedErrors.set(hint, this.replayId!);
  }

  linkError(event: Event, hint: EventHint | undefined): void {
    const replayId = hint && this.capturedErrors.get(hint);
    if (replayId && !event.type && !event.tags?.['replayId'])
      event.tags = { ...event.tags, replayId };
  }

  acceptError(event: Event): void {
    if (
      !this.eligible() ||
      event.tags?.['replayId'] !== this.replayId ||
      !event.event_id ||
      this.errors.size >= 100
    )
      return;
    this.errors.add(event.event_id);
    this.dirty = true;
    void this.flush();
  }

  flush(): Promise<boolean> {
    const client = this.client;
    if (
      !client ||
      !this.dirty ||
      !this.replayId ||
      !this.events.length ||
      !client.getConsent() ||
      client.getOptions().enabled === false
    )
      return Promise.resolve(false);
    try {
      const replayId = this.replayId;
      const recording =
        JSON.stringify({ segment_id: this.segmentId }) + '\n' + JSON.stringify(this.events);
      const options = client.getOptions();
      const sdk = client.getSdkMetadata()?.sdk;
      const replayEvent: ReplayEvent = {
        type: 'replay_event',
        event_id: replayId,
        replay_id: replayId,
        segment_id: this.segmentId,
        replay_type: 'session',
        replay_start_timestamp: this.startedAt / 1000,
        timestamp: Date.now() / 1000,
        urls: this.frame ? [this.frame.href] : [],
        error_ids: [...this.errors],
        trace_ids: [],
        segment_names: [],
        platform: 'javascript',
        ...(sdk ? { sdk } : {}),
        tags: {
          'miniapp.replay.coverage': 'marked-nodes',
          'miniapp.replay.source': 'selector-query',
        },
        ...(options.release ? { release: options.release } : {}),
        ...(options.environment ? { environment: options.environment } : {}),
      };
      const dsn = client.getDsn();
      if (!dsn) return Promise.resolve(false);
      const envelope = createEnvelope(
        {
          event_id: replayId,
          sent_at: new Date().toISOString(),
          ...(options.tunnel ? { dsn: dsnToString(dsn) } : {}),
        },
        [
          [{ type: 'replay_event' }, replayEvent],
          [{ type: 'replay_recording', length: utf8ByteLength(recording) }, recording],
        ],
      );
      this.segmentId++;
      this.lastSent = Date.now();
      this.events = this.frame ? frameEvents(this.frame, this.lastSent) : [];
      this.bytes = utf8ByteLength(JSON.stringify(this.events));
      this.errors.clear();
      this.dirty = false;
      const pending = Promise.resolve(client.sendEnvelope(envelope)).then(
        (response) =>
          !!response.statusCode && response.statusCode >= 200 && response.statusCode < 300,
        () => false,
      );
      return pending;
    } catch (_error) {
      this.reason = 'send_failed';
      return Promise.resolve(false);
    }
  }
}
