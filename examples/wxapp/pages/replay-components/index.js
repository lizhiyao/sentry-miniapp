const Sentry = require('../../lib/sentry-miniapp.js');
const Replay = require('../../lib/sentry-miniapp-replay.js');

Page({
  data: { probes: '', diagnostics: '', items: ['订单概览', '支付进度'], changed: false, modal: false, masked: false, privateInput: '', recording: false, busy: false, notice: '', failed: false, lastEventId: '' },
  onLoad() {
    this._recordings = [];
    this._metadata = [];
    this._receipts = [];
    const client = Sentry.getClient();
    this._releases = [
      client.on('beforeEnvelope', (envelope) => {
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'replay_recording') this._recordings.push(payload);
          if (header.type === 'replay_event') this._metadata.push(payload);
        }
        if (this._recordings.length > 20) this._recordings.shift();
        if (this._metadata.length > 20) this._metadata.shift();
      }),
      client.on('afterSendEvent', (event, response) => {
        if (event.tags?.replayId) this._receipts.push({ eventId: event.event_id, replayId: event.tags.replayId, status: response.statusCode });
        if (this._receipts.length > 20) this._receipts.shift();
      }),
    ];
  },
  onReady() {
    const replay = Replay.getWechatPageReplay();
    if (replay) { replay.stop(); replay.start(); }
    this.probe();
    this.captureFrame();
  },
  onUnload() { this._releases?.forEach((release) => release()); },
  async captureFrame() {
    const replay = Replay.getWechatPageReplay();
    if (replay) {
      await replay.capture();
      const diagnostics = replay.getDiagnostics();
      this.setData({ diagnostics: JSON.stringify(diagnostics), recording: diagnostics.state === 'recording' && diagnostics.nodes > 0 });
      if (diagnostics.reason === 'no_marked_nodes') this.setData({ notice: '请运行 yarn build:replay-example，再打开输出项目以启用回放。', failed: false });
    }
  },
  probe() {
    const results = {};
    const selectors = ['.sentry-replay', '.sentry-replay, .sentry-replay-root >>> .sentry-replay'];
    const run = (index) => {
      if (index >= selectors.length) { this.setData({ probes: JSON.stringify(results) }); return; }
      wx.createSelectorQuery().in(this).selectAll(selectors[index]).fields({
        dataset: true, mark: true, rect: true, size: true,
        computedStyle: ['overflow', 'visibility', 'zIndex', 'opacity'],
      }).exec((rows) => { results[selectors[index]] = rows[0]; run(index + 1); });
    };
    run(0);
  },
  onToggle() { this.setData({ modal: !this.data.modal }, () => { this.probe(); this.captureFrame(); }); },
  onChange() { this.setData({ changed: !this.data.changed }, () => this.captureFrame()); },
  onCloseModal() { this.setData({ modal: false }, () => this.captureFrame()); },
  onDialogTap() {},
  onConfirmModal() { this.setData({ changed: true, modal: false }, () => this.captureFrame()); },
  onStop() { Replay.getWechatPageReplay()?.stop(); this.setData({ recording: false, notice: '录制已停止，未发送的内容已清空。', failed: false }); },
  async onRestart() {
    if (this.data.busy) return;
    this.setData({ busy: true, recording: false, notice: '', failed: false });
    try { const replay = Replay.getWechatPageReplay(); if (replay) { replay.stop(); replay.start(); } await this.captureFrame(); }
    finally { this.setData({ busy: false }); }
  },
  onMask() { this.setData({ masked: !this.data.masked }, () => this.captureFrame()); },
  onInput(event) { this.setData({ privateInput: event.detail.value }); },
  async onCaptureError() {
    if (this.data.busy) return;
    this.setData({ busy: true, notice: '', failed: false });
    try {
      const replay = Replay.getWechatPageReplay();
      if (!replay) throw new Error('录制器不可用，请检查 SDK 初始化。');
      await replay.capture();
      const diagnostics = replay.getDiagnostics();
      if (diagnostics.state !== 'recording' || diagnostics.nodes === 0) throw new Error('页面采集尚未就绪，请重新录制后重试。' + (diagnostics.reason ? '（' + diagnostics.reason + '）' : ''));

      const eventId = Sentry.captureException(new Error('复杂组件自动回放验收'));
      const flushed = await Sentry.flush(3000);
      await replay.flush();
      const receipt = this._receipts.find((item) => item.eventId === eventId);
      const accepted = receipt && receipt.status >= 200 && receipt.status < 300;
      this.setData({
        notice: accepted ? '错误请求返回成功。请到 Sentry 核对回放和错误关联。' : '尚未确认错误发送成功，请检查域名与网络后重试。',
        failed: !accepted,
        lastEventId: eventId,
        evidence: JSON.stringify({ recordings: this._recordings, metadata: this._metadata, receipts: this._receipts, flushed }),
      });
    } catch (error) {
      this.setData({ notice: error.message || '发送失败，请检查网络后重试。', failed: true });
    } finally { this.setData({ busy: false }); }
  },
});
