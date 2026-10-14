// 仅供示例本地验收使用，不作为 SDK integration 或网络 transport 发布。
function createLocalRecorder({ byteLength, maxBytes = 1024 * 1024, maxSegments = 20 }) {
  if (typeof byteLength !== 'function') throw new Error('需要 SDK 的 utf8ByteLength');
  if (!Number.isFinite(maxBytes) || !Number.isFinite(maxSegments)) throw new Error('本地预算必须是有限数字');
  maxBytes = Math.max(1024, Math.min(8 * 1024 * 1024, Math.floor(maxBytes)));
  maxSegments = Math.max(1, Math.min(100, Math.floor(maxSegments)));
  let records = [], errors = [], retainedBytes = 0, droppedSegments = 0;
  function send(envelope) {
    try {
      const items = envelope[1];
      const metadata = items.find(([header]) => header.type === 'replay_event');
      const recording = items.find(([header]) => header.type === 'replay_recording');
      if (metadata && recording && typeof recording[1] === 'string') {
        const value = metadata[1];
        const text = JSON.stringify({
          replayId: value.replay_id,
          segmentId: value.segment_id,
          recording: recording[1],
          metadata: { urls: value.urls, errorIds: value.error_ids },
        });
        const bytes = byteLength(text);
        if (bytes <= maxBytes) {
          records.push({ text, bytes });
          retainedBytes += bytes;
          while (records.length > maxSegments || retainedBytes > maxBytes) {
            retainedBytes -= records.shift().bytes;
            droppedSegments++;
          }
        } else droppedSegments++;
      }
      for (const [header, event] of items) {
        if (header.type === 'event' && event.tags && event.tags.replayId) {
          errors.push({ eventId: event.event_id, replayId: event.tags.replayId });
          if (errors.length > 50) errors.shift();
        }
      }
    } catch (_) { droppedSegments++; }
    // 本地留存没有服务器回执，不能将它标为 HTTP 2xx。
    return Promise.resolve({});
  }
  return {
    transport: { send, flush: () => Promise.resolve(true) },
    exportRecording() {
      return JSON.stringify({
        schema: 'sentry-miniapp-local-replay', version: 1, mode: 'local',
        segments: records.map(({ text }) => JSON.parse(text)), errors,
        summary: { retainedBytes, maxBytes, droppedSegments },
      });
    },
    clear() { records = []; errors = []; retainedBytes = 0; droppedSegments = 0; },
  };
}
module.exports = { createLocalRecorder };
