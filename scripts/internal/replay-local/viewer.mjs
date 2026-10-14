import { MAX_FILE_BYTES, parseRecording } from './recording.mjs';
const element = (id) => document.getElementById(id);
let report,
  player,
  active,
  dimensions,
  duration = 0,
  playing = false,
  offset = 0,
  reading = false,
  disposed = false;
const formatTime = (time) => {
  const seconds = Math.floor(Math.max(0, time) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
function setPlaying(value) {
  playing = value;
  element('play-label').textContent = value ? '暂停' : '播放';
  element('play').setAttribute('aria-pressed', String(value));
  element('play-icon').firstElementChild.setAttribute('href', value ? '#i-pause' : '#i-play');
}
const notice = (text, error = false) => {
  element('status').textContent = text;
  element('status').toggleAttribute('data-error', error);
};
function fit() {
  if (!player) return;
  const stage = element('stage');
  const padding = getComputedStyle(stage);
  const width =
    stage.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 2;
  const height =
    stage.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - 2;
  if (!(width > 0) || !(height > 0)) return;
  const original = element('zoom').value === '1';
  stage.style.overflow = original ? 'auto' : 'hidden';
  const scale = original ? 1 : Math.min(1, width / dimensions.width, height / dimensions.height);
  element('player').style.transform = `scale(${scale})`;
  element('viewport').style.width = `${dimensions.width * scale}px`;
  element('viewport').style.height = `${dimensions.height * scale}px`;
}
function updateTime(time) {
  offset = Math.max(0, Math.min(duration, time));
  element('seek').value = offset;
  const text = `${formatTime(offset)} / ${formatTime(duration)}`;
  element('time').textContent = text;
  element('seek').setAttribute('aria-valuetext', text);
  let selected;
  for (const segment of active?.segmentStarts || []) {
    if (segment.time <= offset && (!selected || segment.time >= selected.time)) selected = segment;
  }
  for (const button of element('segments').children) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.segment) === selected?.id));
  }
}
function pauseAt(time) {
  // rrweb 只同步应用早于目标时间的事件；跨过 1ms 才包含该时刻的快照。
  player.pause(time + 1);
  setPlaying(false);
  updateTime(time);
}
function openReplay(index, nextReport = report) {
  const nextActive = nextReport.replays[index];
  const mount = document.createElement('div');
  element('player').append(mount);
  let nextPlayer;
  try {
    nextPlayer = new window.rrwebReplay.Replayer(nextActive.events, {
      root: mount,
      speed: Number(element('speed').value),
    });
  } catch (error) {
    mount.remove();
    throw error;
  }
  player?.destroy();
  // 不移动新 iframe；重新插入同一个 DOM 节点也会重置其浏览上下文。
  for (const child of [...element('player').children]) if (child !== mount) child.remove();
  player = nextPlayer;
  report = nextReport;
  setPlaying(false);
  active = nextActive;
  dimensions = active.events.find((e) => e.type === 4).data;
  duration = active.events.at(-1).timestamp - active.events[0].timestamp;
  element('seek').max = Math.max(1, duration);
  element('details').textContent =
    `${active.events.filter((e) => e.type === 2).length} 帧 · ${active.events.length} 个事件 · ${formatTime(duration)}`;
  element('replay-id').textContent = active.id;
  element('route').textContent = active.urls.length
    ? active.urls.join('\n')
    : '此文件未提供页面地址';
  element('segment-count').textContent = active.segmentIds.length
    ? `${active.segmentIds.length} 段`
    : '未提供';
  element('viewport-size').textContent = `${dimensions.width} × ${dimensions.height} px`;
  player.on('finish', () => {
    if (player !== nextPlayer || !playing) return;
    const time = nextPlayer.getCurrentTime();
    // 延迟的结束通知可能已停止新一轮播放；用公开 API 恢复当前播放位置。
    if (time < duration) {
      nextPlayer.play(time);
      return;
    }
    setPlaying(false);
    updateTime(duration);
  });
  player.on('resize', (size) => {
    dimensions = size;
    element('viewport-size').textContent = `${size.width} × ${size.height} px`;
    fit();
  });
  element('segments').replaceChildren();
  for (const { id, time } of active.segmentStarts) {
    const button = document.createElement('button');
    const label = document.createElement('span'),
      timeLabel = document.createElement('span');
    label.textContent = `分段 ${id}`;
    timeLabel.textContent = formatTime(time);
    button.append(label, timeLabel);
    button.dataset.segment = String(id);
    // 每个分段从 Meta 开始，直接使用实际事件时间，不补造帧或点击。
    button.onclick = () => pauseAt(time);
    element('segments').append(button);
  }
  if (!active.segmentStarts.length) element('segments').textContent = '事件文件未提供分段信息';
  element('errors').textContent = active.errorIds.length
    ? active.errorIds.join('\n')
    : '此文件未提供关联错误 ID';
  element('copy-errors').hidden = !active.errorIds.length;
  pauseAt(0);
  fit();
}
function load(text, focus = true) {
  const wasHidden = element('workspace').hidden;
  try {
    const parsed = parseRecording(text);
    const latest = parsed.replays.length - 1;
    element('workspace').hidden = false;
    openReplay(latest, parsed);
    element('sessions').replaceChildren(
      ...report.replays.map((replay, index) => {
        const option = document.createElement('option');
        option.value = index;
        const time = replay.events.at(-1).timestamp - replay.events[0].timestamp;
        option.textContent = `录制 ${index + 1} · ${formatTime(time)}`;
        return option;
      }),
    );
    element('sessions').value = String(latest);
    element('import-panel').open = false;
    element('page-heading').hidden = true;
    notice(
      `已导入 ${report.replays.length} 次录制，只在本机播放。${report.droppedSegments ? '预算已移除 ' + report.droppedSegments + ' 段，仅展示保留部分。' : ''}`,
    );
    fit();
    if (focus) element('play').focus();
  } catch (error) {
    element('workspace').hidden = wasHidden;
    notice(error.message, true);
  }
}
element('import').onclick = () => load(element('input').value);
async function loadFile(file) {
  if (reading) return;
  if (file.size > MAX_FILE_BYTES) {
    notice('文件超过 8 MiB，请导出较短录制。', true);
    return;
  }
  reading = true;
  element('file').disabled = true;
  element('import').disabled = true;
  notice('正在读取 ' + file.name);
  try {
    const text = await file.text();
    if (!disposed) load(text);
  } catch {
    notice('文件读取失败，请重新选择。', true);
  } finally {
    reading = false;
    element('file').disabled = false;
    element('file').value = '';
    element('import').disabled = false;
  }
}
element('file').onchange = () => {
  const file = element('file').files[0];
  if (file) void loadFile(file);
};
const dragOver = (event) => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  element('drop-hint').hidden = false;
};
const dropFile = (event) => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  element('drop-hint').hidden = true;
  const files = event.dataTransfer?.files;
  if (files?.length === 1) void loadFile(files[0]);
  else notice('请一次导入一个 JSON 文件。', true);
};
const dragLeave = (event) => {
  if (!event.relatedTarget) element('drop-hint').hidden = true;
};
document.addEventListener('dragover', dragOver);
document.addEventListener('drop', dropFile);
document.addEventListener('dragleave', dragLeave);
element('sessions').onchange = () => openReplay(Number(element('sessions').value));
element('start').onclick = () => pauseAt(0);
element('play').onclick = () => {
  if (playing) pauseAt(player.getCurrentTime());
  else {
    if (offset >= duration) offset = 0;
    player.play(offset);
    setPlaying(true);
  }
};
element('seek').oninput = () => pauseAt(Number(element('seek').value));
element('speed').onchange = () => player?.setConfig({ speed: Number(element('speed').value) });
element('zoom').onchange = fit;
element('copy-errors').onclick = async () => {
  try {
    await navigator.clipboard.writeText(active.errorIds.join('\n'));
    notice('错误 ID 已复制，只用于本地关联核对。');
  } catch {
    notice('复制失败；可选中右侧错误 ID 手动复制。', true);
  }
};
const keyboard = (event) => {
  if (
    !player ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.target.closest?.('input, textarea, select, button, summary, [contenteditable="true"]')
  )
    return;
  if (event.code === 'Space') {
    event.preventDefault();
    element('play').click();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    pauseAt(Math.max(0, Math.min(duration, offset + (event.key === 'ArrowLeft' ? -5000 : 5000))));
  }
};
document.addEventListener('keydown', keyboard);
const clock = setInterval(() => {
  if (playing) updateTime(player.getCurrentTime());
}, 100);
window.addEventListener('resize', fit);
const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined;
resizeObserver?.observe(element('stage'));
window.addEventListener(
  'pagehide',
  () => {
    disposed = true;
    clearInterval(clock);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', fit);
    document.removeEventListener('keydown', keyboard);
    document.removeEventListener('dragover', dragOver);
    document.removeEventListener('drop', dropFile);
    document.removeEventListener('dragleave', dragLeave);
    player?.destroy();
  },
  { once: true },
);
fetch('/recording.json')
  .then(async (response) => {
    if (response.status === 200) {
      const text = await response.text();
      if (!disposed) load(text, false);
    }
  })
  .catch(() => notice('自动加载失败；仍可选择文件或粘贴 JSON。', true));
