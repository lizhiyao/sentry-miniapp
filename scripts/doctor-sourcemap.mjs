#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  collectBuildMaps,
  collectFiles,
  isWechatAppserviceName,
  isWechatRuntimeBundleName,
  normalizeName,
  pickBuildMapCandidate,
  readJsonFile,
} from './sourcemap-utils.mjs';

const DEFAULT_URL_PREFIX = 'app:///';

const USAGE = `用法：
  npm run sourcemap:doctor -- --dist <构建产物目录> --release <release> [--url-prefix app:///] [--strict] [--json]

  # 微信体验版 / 线上版两层 Source Map 诊断（小程序或小游戏）
  npm run sourcemap:doctor -- --wechat <微信线上.map> --build-maps <构建 map 目录> --release <release> [--strip <前缀>]... [--json]

选项：
  --dist        普通构建产物目录，递归检查 .js 与 .map
  --wechat      微信上线 Source Map（外层 Map B：appservice.app.js / game.js -> 上传前 JS）
  --build-maps  框架 / 游戏引擎构建 Source Map 目录（内层 Map A：上传前 JS -> 源码）
  --release     SDK init({ release }) 与 sentry-cli 上传 release，必须完全一致
  --url-prefix  上传 sourcemap 时使用的前缀，默认 app:///
  --strip       诊断两层 map 匹配时，从 B.sources 中剥掉的前缀，可重复
  --strict      有 warning 时也返回非 0
  --json        输出 JSON，便于复制到 issue 或 CI 留档
  --verbose     打印更多样例
`;

function parseArgs(argv) {
  const out = { strip: [], urlPrefix: DEFAULT_URL_PREFIX };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist') out.dist = argv[++i];
    else if (a === '--wechat') out.wechat = argv[++i];
    else if (a === '--build-maps') out.buildMaps = argv[++i];
    else if (a === '--release') out.release = argv[++i];
    else if (a === '--url-prefix') out.urlPrefix = argv[++i];
    else if (a === '--strip') {
      const v = argv[++i];
      if (v !== undefined) out.strip.push(v);
    } else if (a === '--strict') out.strict = true;
    else if (a === '--json') out.json = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function createReport(args) {
  return {
    status: 'pass',
    options: {
      dist: args.dist ? resolve(args.dist) : null,
      wechat: args.wechat ? resolve(args.wechat) : null,
      buildMaps: args.buildMaps ? resolve(args.buildMaps) : null,
      release: args.release ?? null,
      urlPrefix: args.urlPrefix,
      strip: args.strip,
      strict: args.strict === true,
    },
    summary: {},
    errors: [],
    warnings: [],
    notices: [],
    suggestions: [],
  };
}

function push(report, kind, code, message, details = {}) {
  report[kind].push({ code, message, details });
}

function finalize(report) {
  report.status = report.errors.length > 0 ? 'fail' : report.warnings.length > 0 ? 'warn' : 'pass';
  return report;
}

function printReport(report) {
  console.log('sentry-miniapp sourcemap doctor');
  console.log(`状态：${report.status}`);

  if (report.summary.dist) {
    console.log(
      `\n产物目录：${report.summary.dist.root}\n· JS 文件：${report.summary.dist.jsFiles}\n· Source Map：${report.summary.dist.mapFiles}`,
    );
  }

  if (report.summary.wechat) {
    const merge = report.summary.wechat.merge;
    console.log(
      `\n微信线上外层 Map：${report.summary.wechat.file}\n· sources：${report.summary.wechat.sources}`,
    );
    if (merge) {
      console.log(
        `· 两层匹配：${merge.matched} / ${merge.total}，未匹配 ${merge.unmatched}，歧义 ${merge.ambiguous}`,
      );
    }
  }

  printItems('错误', report.errors, '✗');
  printItems('警告', report.warnings, '⚠');
  printItems('提示', report.notices, '·');

  if (report.suggestions.length > 0) {
    console.log('\n建议：');
    for (const item of report.suggestions) {
      console.log(`- ${item}`);
    }
  }
}

function printItems(title, items, prefix) {
  if (items.length === 0) return;
  console.log(`\n${title}：`);
  for (const item of items) {
    console.log(`${prefix} [${item.code}] ${item.message}`);
    if (item.details?.sample) {
      console.log(`  示例：${item.details.sample}`);
    }
  }
}

function ensureExistingFile(report, file, code, label) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    push(report, 'errors', code, `${label}不存在或不是文件。`, { file });
    return false;
  }
  return true;
}

function ensureExistingDir(report, dir, code, label) {
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    push(report, 'errors', code, `${label}不存在或不是目录。`, { dir });
    return false;
  }
  return true;
}

function normalizeUrlPrefix(urlPrefix) {
  return urlPrefix.endsWith('/') ? urlPrefix : `${urlPrefix}/`;
}

function toArtifactName(name, mapFile, root, urlPrefix) {
  const rawName = name || relative(root, mapFile).replace(/\.map$/, '');
  const normalized = normalizeName(rawName, []);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return normalized;
  }
  return `${normalizeUrlPrefix(urlPrefix)}${normalized}`;
}

function findSourceMappingUrl(jsFile) {
  const content = readFileSync(jsFile, 'utf8');
  const match = content.match(/[#@]\s*sourceMappingURL=([^\s*]+)/);
  return match ? match[1] : null;
}

function inspectDist(report, args) {
  const root = resolve(args.dist);
  if (!ensureExistingDir(report, root, 'dist_not_found', '--dist')) return;

  const jsFiles = collectFiles(root, (file) => file.endsWith('.js'));
  const allMapFiles = collectFiles(root, (file) => file.endsWith('.map'));
  const mapFiles = allMapFiles.filter((file) => !file.endsWith('.d.ts.map'));
  report.summary.dist = {
    root,
    jsFiles: jsFiles.length,
    mapFiles: mapFiles.length,
    ignoredDeclarationMaps: allMapFiles.length - mapFiles.length,
  };

  if (jsFiles.length === 0) {
    push(report, 'errors', 'missing_js', '产物目录中没有找到 .js 文件。', { root });
  }
  if (mapFiles.length === 0) {
    push(report, 'errors', 'missing_map', '产物目录中没有找到 .map 文件。', { root });
  }

  const mapFilesByRelativeJs = new Map();
  for (const mapFile of mapFiles) {
    mapFilesByRelativeJs.set(
      normalizeName(relative(root, mapFile).replace(/\.map$/, ''), []),
      mapFile,
    );
  }

  for (const jsFile of jsFiles) {
    inspectJavaScriptFile(report, jsFile, root, mapFilesByRelativeJs);
  }

  const artifactSamples = [];
  for (const mapFile of mapFiles) {
    inspectMapFile(report, mapFile, root, args, artifactSamples);
  }
  report.summary.dist.artifactSamples = artifactSamples.slice(0, 5);
}

function inspectJavaScriptFile(report, jsFile, root, mapFilesByRelativeJs) {
  const relJs = normalizeName(relative(root, jsFile), []);
  const sourceMappingUrl = findSourceMappingUrl(jsFile);
  const siblingMap = mapFilesByRelativeJs.get(relJs);

  if (!sourceMappingUrl) {
    if (siblingMap) {
      push(
        report,
        'notices',
        'hidden_source_map',
        'JS 未包含 sourceMappingURL，但找到了同名 .map；作为仅上传到 Sentry 的 hidden source map 是合理的。',
        { jsFile, mapFile: siblingMap },
      );
    } else {
      push(
        report,
        'warnings',
        'js_without_map',
        'JS 未包含 sourceMappingURL，也没有找到同名 .map。',
        {
          jsFile,
        },
      );
    }
    return;
  }

  if (sourceMappingUrl.startsWith('data:')) {
    push(
      report,
      'warnings',
      'inline_source_map',
      '检测到内联 source map；生产上传建议输出独立 .map。',
      {
        jsFile,
      },
    );
    return;
  }

  const mapPath = resolve(dirname(jsFile), sourceMappingUrl);
  if (!existsSync(mapPath)) {
    push(report, 'errors', 'broken_source_mapping_url', 'sourceMappingURL 指向的 .map 不存在。', {
      jsFile,
      sourceMappingUrl,
    });
  }
}

function inspectMapFile(report, mapFile, root, args, artifactSamples) {
  let raw;
  try {
    raw = readJsonFile(mapFile);
  } catch (error) {
    push(report, 'errors', 'invalid_map_json', 'Source Map 不是合法 JSON。', {
      mapFile,
      error: error.message,
    });
    return;
  }

  inspectRawMap(report, raw, mapFile);

  const artifactName = toArtifactName(raw.file, mapFile, root, args.urlPrefix);
  artifactSamples.push(artifactName);
  if (!artifactName.startsWith('app:///')) {
    push(
      report,
      'warnings',
      'unexpected_url_prefix',
      'sentry-miniapp 默认把堆栈归一化为 app:///，上传 sourcemap 时建议使用 --url-prefix "app:///"。',
      { mapFile, artifactName },
    );
  }

  // 普通 dist 中的 game.js.map 也可能只是 Cocos 的内层构建 map，不能仅凭文件名
  // 把它判定为微信线上外层 map。小游戏只在显式 --wechat 模式下检查两层映射。
  if (isWechatAppserviceName(raw.file || basename(mapFile).replace(/\.map$/, ''))) {
    push(
      report,
      'notices',
      'wechat_appservice_map',
      '检测到微信小程序运行时合并文件 map；如果还要解析到框架源码，需要两层 sourcemap 合成。',
      { mapFile },
    );
    addMergeSuggestion(report);
  }
}

function inspectRawMap(report, raw, mapFile) {
  if (!raw || typeof raw !== 'object') {
    push(report, 'errors', 'invalid_map_shape', 'Source Map 顶层结构不是对象。', { mapFile });
    return;
  }
  if (raw.version !== 3) {
    push(report, 'warnings', 'unexpected_map_version', 'Source Map version 不是 3。', {
      mapFile,
      version: raw.version,
    });
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    push(report, 'errors', 'missing_sources', 'Source Map 缺少 sources 或 sources 为空。', {
      mapFile,
    });
  }
  if (typeof raw.mappings !== 'string') {
    push(report, 'errors', 'missing_mappings', 'Source Map 缺少 mappings 字符串。', { mapFile });
  } else if (raw.mappings.length === 0) {
    push(
      report,
      'warnings',
      'empty_mappings',
      'Source Map 的 mappings 为空，上传后通常无法定位到源码行列。',
      {
        mapFile,
      },
    );
  }

  if (Array.isArray(raw.sources)) {
    const sourcesContent = Array.isArray(raw.sourcesContent) ? raw.sourcesContent : [];
    const missing = raw.sources.filter(
      (_, index) => typeof sourcesContent[index] !== 'string' || sourcesContent[index].length === 0,
    );
    if (missing.length > 0) {
      push(
        report,
        'warnings',
        'missing_sources_content',
        `有 ${missing.length} 个 source 缺少 sourcesContent，上传后可能只能定位文件路径，无法展示源码内容。`,
        { mapFile, sample: missing[0] },
      );
    }
  }
}

function inspectWechatMap(report, args) {
  const wechatFile = resolve(args.wechat);
  if (!ensureExistingFile(report, wechatFile, 'wechat_map_not_found', '--wechat')) return;

  let rawB;
  try {
    rawB = readJsonFile(wechatFile);
  } catch (error) {
    push(report, 'errors', 'invalid_wechat_map_json', '微信外层 Source Map 不是合法 JSON。', {
      wechatFile,
      error: error.message,
    });
    return;
  }

  inspectRawMap(report, rawB, wechatFile);
  const bSources = Array.isArray(rawB.sources) ? rawB.sources : [];
  report.summary.wechat = {
    file: wechatFile,
    sources: bSources.length,
    outputFile: rawB.file ?? null,
  };

  if (!isWechatRuntimeBundleName(rawB.file || basename(wechatFile).replace(/\.map$/, ''))) {
    push(
      report,
      'warnings',
      'wechat_map_file_unexpected',
      '传入的 --wechat map 看起来不像 appservice.app.js / app-service.js / game.js 对应的外层 map。',
      { wechatFile, file: rawB.file },
    );
  }

  addMergeSuggestion(report);

  if (!args.buildMaps) {
    push(
      report,
      'warnings',
      'missing_build_maps',
      '未提供 --build-maps，doctor 只能检查外层微信 map，无法判断两层 map 能否合成。',
      { wechatFile },
    );
    return;
  }

  const buildMapsDir = resolve(args.buildMaps);
  if (!ensureExistingDir(report, buildMapsDir, 'build_maps_not_found', '--build-maps')) return;

  const { index, fileCount, invalidMaps } = collectBuildMaps(buildMapsDir);
  if (invalidMaps.length > 0) {
    push(
      report,
      'warnings',
      'invalid_build_maps',
      `构建 map 目录中有 ${invalidMaps.length} 个 .map 不是合法 JSON。`,
      {
        sample: invalidMaps[0].file,
      },
    );
  }

  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  for (const src of bSources) {
    const key = normalizeName(src, args.strip);
    let { hit, ambiguous: ambiguousHits } = pickBuildMapCandidate(index, key);
    if (!hit && !ambiguousHits) {
      ({ hit, ambiguous: ambiguousHits } = pickBuildMapCandidate(
        index,
        normalizeName(basename(key), []),
      ));
    }
    if (ambiguousHits) {
      ambiguous.push({ src, key, hits: ambiguousHits.map((item) => item.file) });
    } else if (hit) {
      matched.push({ src, map: hit.file });
    } else {
      unmatched.push(src);
    }
  }

  report.summary.wechat.merge = {
    buildMapsDir,
    buildMapFiles: fileCount,
    indexedKeys: index.size,
    total: bSources.length,
    matched: matched.length,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
    matchedSamples: matched.slice(0, args.verbose ? 20 : 5),
    unmatchedSamples: unmatched.slice(0, args.verbose ? 20 : 5),
    ambiguousSamples: ambiguous.slice(0, args.verbose ? 20 : 5),
  };

  if (matched.length === 0 && bSources.length > 0) {
    push(
      report,
      'errors',
      'merge_no_match',
      '外层 map 的 sources 一个都没匹配到构建 map；通常需要调整 --strip 或对齐构建产物文件名。',
      { sample: bSources[0] },
    );
  } else if (unmatched.length > 0) {
    push(
      report,
      'warnings',
      'merge_unmatched_sources',
      `有 ${unmatched.length} 个外层 source 没匹配到构建 map，这些位置会停在编译产物 JS。`,
      { sample: unmatched[0] },
    );
  }

  if (ambiguous.length > 0) {
    push(
      report,
      'warnings',
      'merge_ambiguous_sources',
      `有 ${ambiguous.length} 个外层 source 匹配到多个构建 map，merge 脚本会跳过以避免误合成。`,
      { sample: ambiguous[0].src },
    );
  }
}

function addReleaseWarning(report, args) {
  if (!args.release) {
    push(
      report,
      'warnings',
      'missing_release',
      '未传入 --release；Source Map 上传使用的 release 必须与 SDK init({ release }) 完全一致。',
    );
  }
}

function addMergeSuggestion(report) {
  const suggestion =
    '需要把微信真机 appservice.app.js / game.js 解析到源码时，运行 scripts/merge-sourcemap.mjs 合成微信线上 map 与框架 / 引擎 map，再以 --url-prefix "app:///" 上传。';
  if (!report.suggestions.includes(suggestion)) {
    report.suggestions.push(suggestion);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

if (!args.dist && !args.wechat) {
  if (args.json) {
    const report = finalize(createReport(args));
    push(report, 'errors', 'missing_input', '请传入 --dist 或 --wechat。');
    console.log(JSON.stringify(finalize(report), null, 2));
  } else {
    console.log(USAGE);
  }
  process.exit(1);
}

const report = createReport(args);
addReleaseWarning(report, args);
if (args.dist) inspectDist(report, args);
if (args.wechat) inspectWechatMap(report, args);
finalize(report);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

process.exitCode = report.errors.length > 0 || (args.strict && report.warnings.length > 0) ? 1 : 0;
