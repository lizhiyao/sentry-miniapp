export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const idPattern = /^[a-f0-9]{32}$/i;

function validateEvents(events) {
  if (!Array.isArray(events) || events.length < 2 || events.length > 10000)
    throw new Error('录制必须包含 2 至 10000 个事件。');
  let previous = -Infinity,
    hasMeta = false,
    hasSnapshot = false;
  for (const event of events) {
    if (
      !event ||
      !Number.isInteger(event.type) ||
      event.type < 0 ||
      event.type > 6 ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data) ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < previous
    )
      throw new Error('事件类型或时间顺序无效，请重新导出同一次录制。');
    previous = event.timestamp;
    if (event.type === 4) {
      const { width, height } = event.data || {};
      if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 8192))
        throw new Error('录制视口尺寸无效。');
      hasMeta = true;
    }
    if (event.type === 2) {
      const root = event.data?.node;
      if (!root || root.type !== 0) throw new Error('页面快照缺少文档节点。');
      const pending = [[root, 0]];
      let count = 0;
      while (pending.length) {
        const [node, depth] = pending.pop();
        if (
          !node ||
          !Number.isInteger(node.type) ||
          !Number.isInteger(node.id) ||
          depth > 300 ||
          ++count > 20000
        )
          throw new Error('页面快照结构或节点预算无效。');
        if (node.childNodes !== undefined && !Array.isArray(node.childNodes))
          throw new Error('页面快照的子节点不是数组。');
        for (const child of node.childNodes || []) pending.push([child, depth + 1]);
      }
      hasSnapshot = true;
    }
  }
  if (!hasMeta || !hasSnapshot) throw new Error('录制缺少视口或首帧快照，请先完成页面采集再导出。');
  return events;
}

export function parseRecording(text) {
  if (
    typeof text !== 'string' ||
    text.length > MAX_FILE_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES
  )
    throw new Error('文件超过 8 MiB，请导出较短录制。');
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new Error('不是有效 JSON，请粘贴完整导出内容或重新选择文件。');
  }
  if (Array.isArray(report) || Array.isArray(report?.events)) {
    const events = validateEvents(Array.isArray(report) ? report : report.events);
    return {
      replays: [
        {
          id: report.replayId || '事件文件',
          events,
          segmentIds: [],
          segmentStarts: [],
          errorIds: [],
          urls: [],
        },
      ],
      droppedSegments: 0,
    };
  }
  if (
    report?.schema !== 'sentry-miniapp-local-replay' ||
    report.version !== 1 ||
    report.mode !== 'local' ||
    !Array.isArray(report.segments) ||
    report.segments.length > 100
  )
    throw new Error('请选择本地验证导出的 JSON，或包含 events 数组的 rrweb 录制。');
  if (!report.segments.length) throw new Error('导出文件没有录制段，请先采集并保存。');
  const groups = new Map();
  for (const segment of report.segments) {
    if (
      !idPattern.test(segment?.replayId) ||
      !Number.isInteger(segment.segmentId) ||
      segment.segmentId < 0 ||
      typeof segment.recording !== 'string'
    )
      throw new Error('录制 ID、分段编号或内容无效。');
    const split = segment.recording.indexOf('\n');
    let header, events;
    try {
      header = JSON.parse(segment.recording.slice(0, split));
      events = JSON.parse(segment.recording.slice(split + 1));
    } catch {
      throw new Error('录制分段内容不完整，请重新导出。');
    }
    if (header.segment_id !== segment.segmentId) throw new Error('分段编号与录制头不一致。');
    validateEvents(events);
    let group = groups.get(segment.replayId);
    if (!group) {
      group = { id: segment.replayId, parts: new Map(), errorIds: new Set(), urls: new Set() };
      groups.set(segment.replayId, group);
    }
    if (group.parts.has(segment.segmentId)) throw new Error('同一录制含重复分段，请重新导出。');
    group.parts.set(segment.segmentId, events);
    for (const id of segment.metadata?.errorIds || [])
      if (idPattern.test(id)) group.errorIds.add(id);
    for (const url of segment.metadata?.urls || [])
      if (typeof url === 'string') group.urls.add(url);
  }
  for (const error of Array.isArray(report.errors) ? report.errors.slice(0, 50) : []) {
    if (idPattern.test(error?.eventId)) groups.get(error.replayId)?.errorIds.add(error.eventId);
  }
  return {
    replays: [...groups.values()].map((group) => {
      const parts = [...group.parts].sort(([a], [b]) => a - b);
      const events = parts
        .flatMap(([, events]) => events)
        .sort((a, b) => a.timestamp - b.timestamp);
      validateEvents(events);
      return {
        id: group.id,
        events,
        segmentIds: parts.map(([id]) => id),
        segmentStarts: parts.map(([id, eventsInPart]) => ({
          id,
          time: eventsInPart[0].timestamp - events[0].timestamp,
        })),
        errorIds: [...group.errorIds],
        urls: [...group.urls],
      };
    }),
    droppedSegments: Number.isInteger(report.summary?.droppedSegments)
      ? report.summary.droppedSegments
      : 0,
  };
}
