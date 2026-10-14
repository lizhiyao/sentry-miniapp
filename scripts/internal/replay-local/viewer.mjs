import { MAX_FILE_BYTES, parseRecording } from './recording.mjs';
const element = (id) => document.getElementById(id);
let report,
  player,
  active,
  dimensions,
  duration = 0,
  playing = false,
  offset = 0;
const notice = (text, error = false) => {
  element('status').textContent = text;
  element('status').toggleAttribute('data-error', error);
};
function fit() {
  if (!player) return;
  const width = element('viewport').clientWidth;
  const scale = Math.min(1, width / dimensions.width);
  element('player').style.transform = `scale(${scale})`;
  element('viewport').style.height = `${dimensions.height * scale}px`;
}
function updateTime(time) {
  offset = Math.max(0, Math.min(duration, time));
  element('seek').value = offset;
  element('time').textContent =
    `${(offset / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} 秒`;
}
function pauseAt(time) {
  // rrweb 只同步应用早于目标时间的事件；跨过 1ms 才包含该时刻的快照。
  player.pause(time + 1);
  playing = false;
  element('play').textContent = '播放';
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
  playing = false;
  active = nextActive;
  dimensions = active.events.find((e) => e.type === 4).data;
  duration = active.events.at(-1).timestamp - active.events[0].timestamp;
  element('seek').max = Math.max(1, duration);
  element('details').textContent =
    `${active.events.filter((e) => e.type === 2).length} 帧 · ${active.events.length} 个事件 · ${active.segmentIds.length || '未提供'} 段${active.urls.length ? ' · ' + active.urls.join('，') : ''}`;
  player.on('finish', () => {
    playing = false;
    element('play').textContent = '播放';
    updateTime(duration);
  });
  player.on('resize', (size) => {
    dimensions = size;
    fit();
  });
  element('segments').replaceChildren();
  for (const { id, time } of active.segmentStarts) {
    const button = document.createElement('button');
    button.textContent = '段 ' + id;
    // 每个分段从 Meta 开始，直接使用实际事件时间，不补造帧或点击。
    button.onclick = () => pauseAt(time);
    element('segments').append(button);
  }
  element('errors').textContent = active.errorIds.length
    ? active.errorIds.join('\n')
    : '此文件未提供关联错误 ID';
  pauseAt(0);
  fit();
}
function load(text) {
  try {
    const parsed = parseRecording(text);
    const latest = parsed.replays.length - 1;
    openReplay(latest, parsed);
    element('workspace').hidden = false;
    element('sessions').replaceChildren(
      ...report.replays.map((replay, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = replay.id;
        return option;
      }),
    );
    element('sessions').value = String(latest);
    notice(
      `已导入 ${report.replays.length} 次录制，只在本机播放。${report.droppedSegments ? '预算已移除 ' + report.droppedSegments + ' 段，仅展示保留部分。' : ''}`,
    );
  } catch (error) {
    notice(error.message, true);
  }
}
element('import').onclick = () => load(element('input').value);
element('file').onchange = async () => {
  const file = element('file').files[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    notice('文件超过 8 MiB，请导出较短录制。', true);
    return;
  }
  notice('正在读取 ' + file.name);
  try {
    load(await file.text());
  } catch {
    notice('文件读取失败，请重新选择。', true);
  }
};
element('sessions').onchange = () => openReplay(Number(element('sessions').value));
element('start').onclick = () => pauseAt(0);
element('play').onclick = () => {
  if (playing) pauseAt(player.getCurrentTime());
  else {
    if (offset >= duration) offset = 0;
    player.play(offset);
    playing = true;
    element('play').textContent = '暂停';
  }
};
element('seek').oninput = () => pauseAt(Number(element('seek').value));
element('speed').onchange = () => player?.setConfig({ speed: Number(element('speed').value) });
const clock = setInterval(() => {
  if (playing) updateTime(player.getCurrentTime());
}, 100);
window.addEventListener('resize', fit);
window.addEventListener(
  'pagehide',
  () => {
    clearInterval(clock);
    player?.destroy();
  },
  { once: true },
);
fetch('/recording.json')
  .then(async (response) => {
    if (response.status === 200) load(await response.text());
  })
  .catch(() => notice('自动加载失败；仍可选择文件或粘贴 JSON。', true));
