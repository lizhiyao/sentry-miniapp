/**
 * 两层 Source Map 离线合成脚本（best-effort）
 * ===========================================
 *
 * 解决的问题：uni-app / Taro 等框架的小程序，代码上线前会被**压缩两次**——
 *   1. 框架构建（webpack / vite）：你的 `.vue` / `.tsx` → 编译产物 JS（这层产出 Map A）
 *   2. 微信上传（开发者工具 / miniprogram-ci，es6→es5 + 压缩）：编译产物 JS →
 *      合并后的单文件 `appservice.app.js`（这层产出 Map B）
 *
 * 真机错误栈落在「压两次后」的 `app:///appservice.app.js` 上。只传 A 翻一半卡在
 * 编译产物 JS、只传 B 又到不了源码——必须把两份 map **串成一份**
 * `appservice.app.js → 源码`，再以 `app:///appservice.app.js` 名字传 Sentry。
 *
 * 本脚本用 mozilla `source-map` 的 `applySourceMap` 做这件事：
 *   gen = SourceMapGenerator.fromSourceMap(B)   // 起点是外层 map B
 *   gen.applySourceMap(A_i, <B.sources[i]>)      // 把每个内层 map A 折进去
 *   → 输出一份 appservice.app.js → 源码 的合成 map
 *
 * ⚠️ 这是「带刀的菜谱」，不是「带保修的厨电」：合并算法是稳的，难点全在**喂进来的
 * 两份 map 能否对齐**（B.sources 里的文件名 ↔ 构建 map 描述的文件名）。不同框架 /
 * 打包器 / 版本命名都可能不一样，匹配不上时本脚本会**逐条告诉你哪对不上**，你按提示
 * 调 --strip / 文件名即可。其它框架欢迎 PR 补匹配策略。
 *
 * 前置准备
 * --------
 * 1. 装依赖（只在用本脚本时装，不进 SDK 运行时）：
 *      npm i -D source-map
 * 2. 拿 Map B（外层，微信合并+压缩）：微信「We 分析 → 性能 / JS 报错 → 下载线上
 *    Source Map」，得到 `appservice.app.js` 对应的 `.map`。注意：只有体验版 / 线上版
 *    有，miniprogram-ci 预览的开发版拿不到；版本要与线上一致。
 * 3. 拿 Map A（内层，框架构建）：在框架构建里**开 sourcemap**（uni-app 对 mp-weixin
 *    默认常是关的；vite 设 `build.sourcemap: true`，webpack 设 `devtool: 'source-map'`），
 *    得到一批编译产物 JS 的 `.map`，放在同一个目录下。
 *
 * 用法
 * ----
 *   node scripts/merge-sourcemap.mjs \
 *     --wechat ./wechat/appservice.app.js.map \
 *     --build-maps ./dist/dev/mp-weixin \
 *     --out ./merged/appservice.app.js.map
 *
 * 可选：
 *   --strip <prefix>   从 B.sources 名字里剥掉的前缀（可多次），常见如 webpack:// app:///
 *   --verbose          打印每条 source 的匹配明细
 *
 * 产出的 `--out` 即可上传 Sentry（名字保持 `appservice.app.js` 对应关系，
 * `--url-prefix "app:///"` 不变）。
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

// ---- 极简参数解析（不引第三方）----
function parseArgs(argv) {
  const out = { strip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wechat') out.wechat = argv[++i];
    else if (a === '--build-maps') out.buildMaps = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--strip') out.strip.push(argv[++i]);
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const USAGE = `用法：
  node scripts/merge-sourcemap.mjs --wechat <B.map> --build-maps <构建 map 目录> --out <合成.map> [--strip <前缀>]... [--verbose]

  --wechat       微信线上 Source Map（外层 Map B：appservice.app.js → 编译产物 JS）
  --build-maps   框架构建 Source Map 所在目录（内层 Map A：编译产物 JS → 源码），会递归查找 *.map
  --out          合成后输出的 .map 路径
  --strip        从 B.sources 名字里剥掉的前缀，可重复（如 --strip webpack:// --strip app:///）
  --verbose      打印每条 source 的匹配明细
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.wechat || !args.buildMaps || !args.out) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 1);
}

// ---- 加载 source-map（缺了给清楚的安装提示，不把它塞进 SDK 依赖）----
let SourceMapConsumer, SourceMapGenerator;
try {
  const sm = await import('source-map');
  ({ SourceMapConsumer, SourceMapGenerator } = sm.default ?? sm);
} catch {
  console.error('✗ 缺少依赖 source-map，请先安装：\n    npm i -D source-map\n  （它只在用本脚本合成时需要，不是 SDK 运行时依赖）');
  process.exit(1);
}

// 0.6.x 的 consumer 没有 destroy()，0.7+ 才有；两个版本都兼容。
const destroyConsumer = (c) => {
  if (c && typeof c.destroy === 'function') c.destroy();
};

// ---- 工具：把一个 source 名字归一成「裸文件名」用于匹配 ----
function normalizeName(name, strip) {
  let n = String(name).split('?')[0].split('#')[0].replace(/\\/g, '/'); // 去 query / hash，统一路径分隔符
  for (const p of strip) {
    const prefix = String(p).replace(/\\/g, '/');
    if (n.startsWith(prefix)) n = n.slice(prefix.length);
  }
  while (n.startsWith('./') || n.startsWith('/')) {
    n = n.startsWith('./') ? n.slice(2) : n.slice(1);
  }
  return n;
}

function addBuildMapCandidate(index, key, hit) {
  if (!key) return;
  const existing = index.get(key);
  if (!existing) {
    index.set(key, [hit]);
    return;
  }
  if (!existing.some((item) => item.file === hit.file)) {
    existing.push(hit);
  }
}

function pickBuildMapCandidate(index, key) {
  const hits = index.get(key);
  if (!hits) return { hit: null, ambiguous: null };
  if (hits.length === 1) return { hit: hits[0], ambiguous: null };
  return { hit: null, ambiguous: hits };
}

// ---- 递归收集构建 map 目录下的所有 *.map，建索引 ----
function collectBuildMaps(dir) {
  const found = [];
  const root = resolve(dir);
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith('.map')) found.push(full);
    }
  };
  walk(root);

  // 建多键索引：用「map 内部 file 字段」「相对 build-maps 根目录的产物路径」
  // 和「文件名去掉 .map」三种 key 都指向它。前两者保证 pages/a/index.js 与
  // pages/b/index.js 这类同名文件能精确匹配；basename 只作为最后兜底。
  const index = new Map();
  for (const file of found) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue; // 不是合法 JSON map，跳过
    }
    const mapDir = dirname(relative(root, file));
    const hit = {
      file,
      raw,
      sourceMapPath: mapDir === '.' ? undefined : normalizeName(mapDir, []),
    };
    const keys = new Set();
    if (raw.file) keys.add(normalizeName(raw.file, []));
    keys.add(normalizeName(relative(root, file).replace(/\.map$/, ''), []));
    keys.add(normalizeName(basename(file).replace(/\.map$/, ''), []));
    for (const k of keys) {
      addBuildMapCandidate(index, k, hit);
    }
  }
  return { index, fileCount: found.length };
}

// ---- 主流程 ----
const rawB = JSON.parse(readFileSync(resolve(args.wechat), 'utf8'));
const bSources = Array.isArray(rawB.sources) ? rawB.sources : [];
if (bSources.length === 0) {
  console.error('✗ 外层 map 没有 sources 字段，无法合成。确认 --wechat 传的是微信线上 appservice.app.js 的 map。');
  process.exit(1);
}

const { index: buildIndex, fileCount: buildMapCount } = collectBuildMaps(args.buildMaps);
console.log(`· 外层 map B：${bSources.length} 个 source`);
console.log(`· 构建 map A：读取 ${buildMapCount} 个 map，索引到 ${buildIndex.size} 个匹配 key\n`);

const consumerB = await new SourceMapConsumer(rawB);
const generator = SourceMapGenerator.fromSourceMap(consumerB);

const matched = [];
const unmatched = [];
const ambiguous = [];

for (const src of bSources) {
  const key = normalizeName(src, args.strip);
  // 先精确 key，再退化为 basename 兜底
  let { hit, ambiguous: ambiguousHits } = pickBuildMapCandidate(buildIndex, key);
  if (!hit && !ambiguousHits) {
    ({ hit, ambiguous: ambiguousHits } = pickBuildMapCandidate(
      buildIndex,
      normalizeName(basename(key), []),
    ));
  }
  if (ambiguousHits) {
    ambiguous.push({ src, key, hits: ambiguousHits });
    if (args.verbose) {
      console.log(`  ✗ 歧义匹配  ${src}  (归一为 ${key})`);
      for (const h of ambiguousHits) console.log(`      候选: ${h.file}`);
    }
    continue;
  }
  if (!hit) {
    unmatched.push(src);
    if (args.verbose) console.log(`  ✗ 未匹配  ${src}  (归一为 ${key})`);
    continue;
  }
  const cA = await new SourceMapConsumer(hit.raw);
  // sourceFile 必须严格等于 src 在 B.sources 里的原始字符串；sourceMapPath 用相对
  // build-maps 根目录的路径，既能解析 A 里的相对源码路径，也避免把本机构建绝对路径写进 map。
  generator.applySourceMap(cA, src, hit.sourceMapPath);
  destroyConsumer(cA);
  matched.push(src);
  if (args.verbose) console.log(`  ✓ 匹配    ${src}  ←  ${hit.file}`);
}

destroyConsumer(consumerB);

// ---- 输出 + 诚实的总结 ----
console.log(`\n合成结果：匹配 ${matched.length} / ${bSources.length}，未匹配 ${unmatched.length}`);

if (ambiguous.length > 0) {
  console.warn(`\n⚠ 有 ${ambiguous.length} 个 source 匹配到多个同名 map，已跳过以避免误合成：`);
  for (const item of ambiguous.slice(0, 10)) {
    console.warn(`    ${item.src} (归一为 ${item.key})`);
    for (const h of item.hits.slice(0, 5)) console.warn(`      - ${h.file}`);
    if (item.hits.length > 5) console.warn(`      …（候选共 ${item.hits.length} 个）`);
  }
  if (ambiguous.length > 10) console.warn(`    …（共 ${ambiguous.length} 条，加 --verbose 看全部）`);
}

if (matched.length === 0) {
  console.error(
    '\n✗ 一个都没匹配上——通常是「B.sources 的名字」和「构建 map 的文件名」对不齐。\n' +
      '  下面是 B.sources 的前若干条，照着它们的命名调 --strip 前缀，或对齐构建产物文件名。\n' +
      '  如果提示“歧义匹配”，请优先让 B.sources 带上相对路径（如 pages/foo/index.js），避免只剩 index.js：',
  );
  for (const s of bSources.slice(0, 15)) console.error(`    ${s}`);
  if (bSources.length > 15) console.error(`    …（共 ${bSources.length} 条）`);
  process.exit(1);
}

if (unmatched.length > 0) {
  console.warn(`\n⚠ 有 ${unmatched.length} 个 source 没匹配上，这些位置会停在「编译产物 JS」、解不到源码：`);
  for (const s of unmatched.slice(0, 10)) console.warn(`    ${s}`);
  if (unmatched.length > 10) console.warn(`    …（共 ${unmatched.length} 条，加 --verbose 看全部）`);
}

const outFile = resolve(args.out);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, generator.toString(), 'utf8');
console.log(`\n✓ 已写出合成 map：${outFile}`);
console.log('  接着以 `app:///appservice.app.js` 的名字上传到 Sentry（--url-prefix "app:///" 不变）。');
console.log('  注意：合成后精度是「两份 map 的较小值」，定位到行没问题，个别列号可能略糙。');
