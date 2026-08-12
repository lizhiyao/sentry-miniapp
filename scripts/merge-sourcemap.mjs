#!/usr/bin/env node

/**
 * 两层 Source Map 离线合成脚本（best-effort）
 * ===========================================
 *
 * 解决的问题：小程序 / 小游戏代码上线前可能被**编译两次**——
 *   1. 框架或游戏引擎构建：`.vue` / `.tsx` / `.ts` → 上传前 JS（这层产出 Map A）
 *   2. 微信上传（开发者工具 / miniprogram-ci，es6→es5、压缩或代码保护）：上传前 JS →
 *      真机执行的 `appservice.app.js`（小程序）或 `game.js`（小游戏）（这层产出 Map B）
 *
 * 真机错误栈落在微信编译后的文件上。只传 A 时行列号属于另一份 JS，只传 B 又可能
 * 停在框架 / 引擎产物——必须把两份 map **串成一份**，再以实际运行时文件名
 * `app:///appservice.app.js` 或 `app:///game.js` 上传 Sentry。
 *
 * 本脚本用 mozilla `source-map` 的 `applySourceMap` 做这件事：
 *   gen = SourceMapGenerator.fromSourceMap(B)   // 起点是外层 map B
 *   gen.applySourceMap(A_i, <B.sources[i]>)      // 把每个内层 map A 折进去
 *   → 输出一份微信运行时 JS → 源码的合成 map
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
 * 2. 拿 Map B（外层，微信编译产物）：从微信 We 分析下载线上 Source Map，或用
 *    miniprogram-ci 的 get-dev-source-map 获取最近上传版本，版本必须与体验版 / 线上版一致。
 * 3. 拿 Map A（内层，框架 / 引擎构建）：Taro / uni-app 开启构建 sourcemap；Cocos
 *    Creator 保留本地生成的 `game.js.map`。把这些内层 map 放在同一个目录下。
 *
 * 用法
 * ----
 *   node scripts/merge-sourcemap.mjs \
 *     --wechat ./wechat-online/appservice.app.js.map \
 *     --build-maps ./dist/dev/mp-weixin \
 *     --out ./merged/appservice.app.js.map
 *
 *   # 微信小游戏 / Cocos Creator
 *   node scripts/merge-sourcemap.mjs \
 *     --wechat ./wechat-online/game.js.map \
 *     --build-maps ./cocos-build-maps \
 *     --out ./merged/game.js.map
 *
 * 可选：
 *   --strip <prefix>   从 B.sources 名字里剥掉的前缀（可多次），常见如 webpack:// app:///
 *   --verbose          打印每条 source 的匹配明细
 *
 * 产出的 `--out` 即可上传 Sentry（保持外层 map 的 `file` 对应关系，
 * `--url-prefix "app:///"` 不变）。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  collectBuildMaps,
  normalizeName,
  pickBuildMapCandidate,
  readJsonFile,
} from './sourcemap-utils.mjs';

// ---- 极简参数解析（不引第三方）----
function parseArgs(argv) {
  const out = { strip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wechat') out.wechat = argv[++i];
    else if (a === '--build-maps') out.buildMaps = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--strip') {
      const v = argv[++i];
      if (v !== undefined) out.strip.push(v); // 防止 --strip 作为末尾参数时 push 进 undefined
    } else if (a === '--verbose') out.verbose = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const USAGE = `用法：
  node scripts/merge-sourcemap.mjs --wechat <B.map> --build-maps <构建 map 目录> --out <合成.map> [--strip <前缀>]... [--verbose]

  --wechat       微信上线 Source Map（外层 Map B：appservice.app.js / game.js → 上传前 JS）
  --build-maps   框架 / 引擎构建 Source Map 目录（内层 Map A：上传前 JS → 源码），会递归查找 *.map
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
  console.error(
    '✗ 缺少依赖 source-map，请先安装：\n    npm i -D source-map\n  （它只在用本脚本合成时需要，不是 SDK 运行时依赖）',
  );
  process.exit(1);
}

// 0.6.x 的 consumer 没有 destroy()，0.7+ 才有；两个版本都兼容。
const destroyConsumer = (c) => {
  if (c && typeof c.destroy === 'function') c.destroy();
};

// ---- 主流程 ----
const rawB = readJsonFile(args.wechat);
const bSources = Array.isArray(rawB.sources) ? rawB.sources : [];
if (bSources.length === 0) {
  console.error(
    '✗ 外层 map 没有 sources 字段，无法合成。确认 --wechat 传的是微信线上 appservice.app.js / game.js 的 map。',
  );
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
  // sourceFile 必须严格等于 src 在 B.sources 里的原始字符串。不传 sourceMapPath：
  // 让 A 的源码路径原样透传（多为 src/... 或 webpack:// 这类工程相对路径），既不写入
  // 本机构建绝对路径，也不会被多套一层 map 目录前缀。源码内容靠 sourcesContent 透传，
  // 路径仅作展示。
  generator.applySourceMap(cA, src);
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
  if (ambiguous.length > 10)
    console.warn(`    …（共 ${ambiguous.length} 条，加 --verbose 看全部）`);
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
  console.warn(
    `\n⚠ 有 ${unmatched.length} 个 source 没匹配上，这些位置会停在「编译产物 JS」、解不到源码：`,
  );
  for (const s of unmatched.slice(0, 10)) console.warn(`    ${s}`);
  if (unmatched.length > 10)
    console.warn(`    …（共 ${unmatched.length} 条，加 --verbose 看全部）`);
}

const outFile = resolve(args.out);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, generator.toString(), 'utf8');
const runtimeFile = normalizeName(rawB.file || basename(args.wechat).replace(/\.map$/, ''), [
  'app:///',
]);
const artifactName = `app:///${runtimeFile}`;
console.log(`\n✓ 已写出合成 map：${outFile}`);
console.log(
  `  接着把它与同版本的微信编译 JS 成对上传到 Sentry；运行时 artifact 应为 \`${artifactName}\`。`,
);
console.log('  release 与 SDK init({ release }) 必须一致，--url-prefix 继续使用 "app:///"。');
console.log('  注意：合成后精度是「两份 map 的较小值」，定位到行没问题，个别列号可能略糙。');
console.log(
  '  ⚠ 合成 map 内嵌源码（sourcesContent），仅用于上传 Sentry，别打进小程序包或公开发布，用完即删。',
);
