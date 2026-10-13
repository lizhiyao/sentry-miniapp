const Sentry = require('../../lib/sentry-miniapp.js');
const Replay = require('../../lib/sentry-miniapp-replay.js');

Page({
  data: { count: 0, visible: true, status: '等待操作', diagnostics: '', recordingJson: '' },
  onLoad() {
    this._recordings = [];
    this._interactions = [];
    this._replayMetadata = [];
    this._errorReceipts = [];
    const client = Sentry.getClient();
    this._offReplay = [
      client.on('beforeEnvelope', (envelope) => {
        const metadata = envelope[1].find((item) => item[0].type === 'replay_event');
        if (metadata && this._replayMetadata.length < 100)
          this._replayMetadata.push({
            replayId: metadata[1].replay_id,
            segmentId: metadata[1].segment_id,
            errorIds: metadata[1].error_ids,
          });
        const recording = envelope[1].find((item) => item[0].type === 'replay_recording');
        if (recording) {
          this._recordings.push(recording[1]);
          if (this._recordings.length > 10) this._recordings.shift();
        }
      }),
      client.on('beforeAddBreadcrumb', (breadcrumb) => {
        if (breadcrumb.category === 'user.interaction' && this._interactions.length < 100)
          this._interactions.push(breadcrumb.data);
      }),
      client.on('afterSendEvent', (event, response) => {
        if (event.tags?.replayId && this._errorReceipts.length < 100)
          this._errorReceipts.push({
            eventId: event.event_id,
            replayId: event.tags.replayId,
            status: response.statusCode,
          });
      }),
    ];
  },
  onReady() {
    this.startReplay();
  },
  onUnload() {
    if (this._offReplay) this._offReplay.forEach((off) => off());
    this._recordings = [];
    this._interactions = [];
    this._replayMetadata = [];
    this._errorReceipts = [];
  },
  async captureFrame() {
    const replay = Replay.getWechatPageReplay();
    if (!replay) {
      const client = Sentry.getClient();
      this.setData({
        diagnostics: JSON.stringify({
          state: 'unavailable',
          client: !!client,
          active: client && client.isActiveRuntime(),
          integrations:
            client && client.getOptions().integrations.map((integration) => integration.name),
        }),
      });
      return;
    }
    await replay.capture();
    this.setData({ diagnostics: JSON.stringify(replay.getDiagnostics()) });
  },

  startReplay() {
    const replay = Replay.getWechatPageReplay();
    if (replay) {
      replay.stop();
      replay.start();
    }
    return this.captureFrame();
  },
  onChangeState() {
    this.setData({ count: this.data.count + 1, status: '状态已更新' }, () => this.captureFrame());
  },
  onToggleNode() {
    this.setData({ visible: !this.data.visible }, () => this.captureFrame());
  },
  onPageScroll() {
    this.captureFrame();
  },
  async onCaptureError() {
    const replay = Replay.getWechatPageReplay();
    if (replay) await replay.capture();
    const eventId = Sentry.captureException(new Error('页面回放验证 ' + Date.now()));
    await Sentry.flush(2000);
    this.setData({
      diagnostics: 'eventId=' + eventId + '\n' + JSON.stringify(replay && replay.getDiagnostics()),
    });
  },
  async onFlushReplay() {
    const replay = Replay.getWechatPageReplay();
    const accepted = replay ? await replay.flush() : false;
    this.setData({
      diagnostics:
        'transport2xx=' + accepted + '\n' + JSON.stringify(replay && replay.getDiagnostics()),
    });
  },
  exportRecording() {
    const recordings = this._recordings || [];
    const events = recordings.reduce(
      (events, recording) =>
        events.concat(JSON.parse(recording.slice(recording.indexOf('\n') + 1))),
      [],
    );
    return JSON.stringify({
      replayId: Replay.getWechatPageReplay()?.getReplayId(),
      events,
      interactions: this._interactions,
      metadata: this._replayMetadata,
      errors: this._errorReceipts,
    });
  },
  onExportRecording() {
    this.setData({ recordingJson: this.exportRecording() });
  },
  onCopyRecording() {
    wx.setClipboardData({ data: this.exportRecording() });
  },
});
