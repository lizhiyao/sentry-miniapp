import type { eventWithTime } from '@rrweb/types';
import {
  createEnvelope,
  createEventEnvelopeHeaders,
  getClient,
  getDiagnostics,
  getSdkMetadataForEnvelopeHeader,
  MiniappClient,
  utf8ByteLength,
  uuid4,
  _addFunctionInstrumentationObserver,
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
  bufferDurationMs: 60000,
  selector: '.sentry-replay, .sentry-replay-root >>> .sentry-replay',
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
    sessionSampleRate: rate(options.sessionSampleRate, 0),
    errorSampleRate: rate(options.errorSampleRate, 1),
    bufferDurationMs: bounded(options.bufferDurationMs, DEFAULTS.bufferDurationMs, 1000, 60000),
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
      // 构造期只安装中性方法；调用时读取当前 client，不把组件绑定到退休 recorder。
      for (const name of getDiagnostics().platform.name === 'wechat' &&
      !getDiagnostics().platform.isMinigame
        ? ['Page', 'Component']
        : []) {
        adopt(
          _addFunctionInstrumentationObserver(globalThis, name, client, (args) => {
            const definition = args[0] as Record<string, unknown> | undefined;
            if (!definition || typeof definition !== 'object') return;
            const methods =
              name === 'Component'
                ? ((definition['methods'] ??= {}) as Record<string, unknown>)
                : definition;
            if (!methods || typeof methods !== 'object' || '__sentryReplayTap' in methods) return;
            const handler = (event: Record<string, unknown>): void => {
              const current = getClient();
              if (current instanceof MiniappClient)
                recorders.get(current)?.recorder.recordTap(event);
            };
            // PageBreadcrumbs 不再把私有 capture 方法当作业务交互重复包装。
            Object.defineProperty(handler, '__sentryPageCallbackWrapper', { value: true });
            methods['__sentryReplayTap'] = handler;
          }),
        );
      }
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
        client.on('beforeSendEvent', (event, hint) =>
          observe(() => recorder.linkError(event, hint, true)),
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

type Config = typeof DEFAULTS & { sessionSampleRate: number; errorSampleRate: number };
interface ReplayIdentity {
  id: string;
  sampled: boolean;
}
function rate(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

class Recorder implements WechatPageReplay {
  private state: WechatPageReplayDiagnostics['state'] = 'waiting';
  private reason: string | undefined;
  private replay: ReplayIdentity = { id: '', sampled: false };
  private frame: ReplayFrame | undefined;
  private frameKey = '';
  private events: eventWithTime[] = [];
  private bytes = 0;
  private segmentId = 0;
  private startedAt = 0;
  private bufferAt = 0;
  private sentAt = 0;
  private generation = 0;
  private foreground = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cancel: (() => void) | undefined;
  private errors = new Set<string>();
  private dirty = false;
  private page: Page | undefined;
  private destroyed = false;
  private manualStop = false;
  private lastTap = '';
  private mode: 'session' | 'buffer' = 'session';
  private readonly errorLinks = new WeakMap<EventHint, ReplayIdentity>();

  constructor(
    private client: MiniappClient | undefined,
    private readonly config: Config,
  ) {}

  getReplayId(): string | undefined {
    return this.replay.id || undefined;
  }

  getDiagnostics(): WechatPageReplayDiagnostics {
    return {
      state: this.state,
      reason: this.reason,
      replayId: this.replay.id || undefined,
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

  private active(): boolean {
    const client = this.client;
    return (
      !this.destroyed &&
      !!client &&
      client === getClient() &&
      client.isActiveRuntime() &&
      client.getConsent()
    );
  }

  private eligible(): boolean {
    return this.active() && this.state === 'recording';
  }

  start(): boolean {
    return this.begin(true);
  }

  private begin(explicit: boolean): boolean {
    const client = this.client;
    if (this.destroyed || !client?.isActiveRuntime()) return false;
    this.manualStop = false;
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
    if (this.state === 'recording') {
      if (explicit) this.replay.sampled = true;
      return true;
    }
    const sampled = explicit || Math.random() < this.config.sessionSampleRate;
    this.mode = sampled ? 'session' : 'buffer';
    if (!sampled && this.config.errorSampleRate === 0) {
      this.reason = 'sampled_out';
      return false;
    }
    this.state = 'recording';
    this.reason = undefined;
    this.replay = { id: uuid4(), sampled };
    this.startedAt = this.sentAt = Date.now();
    this.bufferAt = this.startedAt;
    this.segmentId = 0;
    this.frame = undefined;
    this.frameKey = '';
    this.lastTap = '';
    this.events = [];
    this.dirty = false;
    this.page = undefined;
    this.bytes = 0;
    this.errors.clear();
    this.generation++;
    this.schedule();
    return true;
  }

  resume(): void {
    this.foreground = true;
    if (!this.manualStop) this.begin(false);
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
    this.cancel?.();
    this.cancel = undefined;
    this.state = 'waiting';
  }

  stop(): void {
    this.manualStop = true;
    this.pause();
    this.state = 'stopped';
    this.replay = { id: '', sampled: false };
    this.events = [];
    this.dirty = false;
    this.page = undefined;
    this.bytes = 0;
    this.frame = undefined;
    this.frameKey = '';
    this.errors.clear();
  }

  consentChanged(granted: boolean): void {
    const foreground = this.foreground;
    const manualStop = this.manualStop;
    this.stop();
    this.manualStop = manualStop;
    this.foreground = foreground;
    this.reason = granted ? undefined : 'consent_required';
    if (granted && foreground && !manualStop) this.begin(false);
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
    if (!this.eligible() || this.cancel) return false;
    if (Date.now() - this.startedAt >= this.config.maxDurationMs) {
      void this.flush();
      this.stop();
      this.manualStop = false;
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
          if (owner.recorder) owner.recorder.cancel = undefined;
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
        this.cancel = () => finish(undefined);
        try {
          const query = host.createSelectorQuery().in(page);
          query.selectViewport().fields({ size: true, scrollOffset: true });
          query.selectAll(this.config.selector).fields({
            dataset: true,
            mark: true,
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
        if (!this.replay.sampled && Date.now() - this.bufferAt > this.config.bufferDurationMs) {
          this.events = frameEvents(frame, Date.now());
          this.bufferAt = Date.now();
          this.bytes = utf8ByteLength(JSON.stringify(this.events));
        }
        if (Date.now() - this.sentAt >= this.config.flushIntervalMs) void this.flush();
        return true;
      }
      const events = frameEvents(frame, Date.now());
      if (!this.append(events, true)) return false;
      this.frame = frame;
      this.page = page;
      this.frameKey = key;
      this.reason = frame.nodes.length ? undefined : 'no_marked_nodes';
      if (Date.now() - this.sentAt >= this.config.flushIntervalMs) void this.flush();
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
    if (
      !this.replay.sampled &&
      (Date.now() - (merged[0]?.timestamp ?? Date.now()) > this.config.bufferDurationMs ||
        utf8ByteLength(JSON.stringify(merged)) > limit)
    )
      merged = keyframe
        ? events
        : [...(this.frame ? frameEvents(this.frame, Date.now()) : []), ...events];
    let bytes = utf8ByteLength(JSON.stringify(merged));
    if (!this.replay.sampled) this.bufferAt = merged[0]?.timestamp ?? Date.now();
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
      !this.frame?.nodes.length ||
      this.currentPage() !== this.page ||
      breadcrumb.category !== 'user.interaction'
    )
      return;
    const data = breadcrumb.data;
    if (!data || !['tap', 'click'].includes(String(data['eventType']))) return;
    if (this.frame.instrumented) return;
    // 微信 tap detail 与 touches 的 page 坐标均相对文档，转换到快照视口。
    const pageX = data['x'] ?? data['touchX'];
    const pageY = data['y'] ?? data['touchY'];
    if (typeof pageX !== 'number' || typeof pageY !== 'number') return;
    const x = pageX - this.frame.scrollLeft;
    const y = pageY - this.frame.scrollTop;
    const event = clickEvent(this.frame, x, y, Date.now());
    if (event) this.append([event]);
  }

  recordTap(event: Record<string, unknown>): void {
    if (
      !this.eligible() ||
      !this.frame?.nodes.length ||
      this.currentPage() !== this.page ||
      this.client!.getOptions().enableUserInteractionBreadcrumbs === false
    )
      return;
    try {
      const detail = event['detail'] as Record<string, unknown> | undefined;
      const touches = event['touches'] as Record<string, unknown>[] | undefined;
      const x = detail?.['x'] ?? touches?.[0]?.['pageX'];
      const y = detail?.['y'] ?? touches?.[0]?.['pageY'];
      if (typeof x !== 'number' || typeof y !== 'number') return;
      const stamp = event['timeStamp'];
      const key = JSON.stringify([stamp, x, y]);
      if (typeof stamp === 'number' && key === this.lastTap) return;
      this.lastTap = typeof stamp === 'number' ? key : '';
      const click = clickEvent(
        this.frame,
        x - this.frame.scrollLeft,
        y - this.frame.scrollTop,
        Date.now(),
      );
      if (click) this.append([click]);
    } catch {
      /* 不读取输入值或修改业务事件。 */
    }
  }

  rememberError(event: Event, hint: EventHint | undefined): void {
    if (
      hint &&
      this.eligible() &&
      this.frame?.nodes.length &&
      this.currentPage() === this.page &&
      !event.type
    )
      if (this.replay.sampled || Math.random() < this.config.errorSampleRate)
        this.errorLinks.set(hint, this.replay);
  }

  linkError(event: Event, hint: EventHint | undefined, filtered = false): void {
    const identity = hint && this.errorLinks.get(hint);
    if (!identity || event.type) return;
    const replayId = event.tags?.['replayId'];
    if (!filtered) {
      if ((identity.sampled || identity === this.replay) && !replayId)
        event.tags = { ...event.tags, replayId: identity.id };
      return;
    }
    if (replayId !== identity.id) return;
    // 过滤完成才赋予发送资格；捕获时的身份不随前后台或重新初始化串到新录制。
    if (identity === this.replay && this.active()) {
      identity.sampled = true;
      if (this.state === 'waiting') void this.flush();
    } else if (!identity.sampled) {
      // 已丢弃的未授权缓冲没有可关联的录制，删除仅由本控制器赋予的身份。
      const tags = { ...event.tags };
      delete tags['replayId'];
      event.tags = tags;
    }
  }

  acceptError(event: Event): void {
    if (
      !this.eligible() ||
      event.tags?.['replayId'] !== this.replay.id ||
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
      !this.replay.sampled ||
      !this.dirty ||
      !this.replay.id ||
      !this.events.length ||
      !client.getConsent() ||
      client.getOptions().enabled === false
    )
      return Promise.resolve(false);
    try {
      const replayId = this.replay.id;
      const recording =
        JSON.stringify({ segment_id: this.segmentId }) + '\n' + JSON.stringify(this.events);
      const options = client.getOptions();
      const sdk = client.getSdkMetadata()?.sdk;
      const replayEvent: ReplayEvent = {
        type: 'replay_event',
        event_id: replayId,
        replay_id: replayId,
        segment_id: this.segmentId,
        replay_type: this.mode,
        replay_start_timestamp: (this.mode === 'buffer' ? this.bufferAt : this.startedAt) / 1000,
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
        createEventEnvelopeHeaders(
          replayEvent,
          getSdkMetadataForEnvelopeHeader(replayEvent),
          options.tunnel,
          dsn,
        ),
        [
          [{ type: 'replay_event' }, replayEvent],
          [{ type: 'replay_recording', length: utf8ByteLength(recording) }, recording],
        ],
      );
      this.segmentId++;
      this.sentAt = Date.now();
      this.events = this.frame ? frameEvents(this.frame, this.sentAt) : [];
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
