#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseWxml } from './replay/wxml.mjs';

const [framework, directory] = process.argv.slice(2);
assert.ok(
  ['taro', 'uniapp'].includes(framework) && directory,
  'Usage: check-framework-replay.mjs <taro|uniapp> <output>',
);
const root = resolve(directory);
const app = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
for (const page of app.pages) {
  const source = await readFile(join(root, page + '.wxml'), 'utf8');
  assert.ok(parseWxml(source).length, 'valid WXML: ' + page);
  assert.ok(
    source.includes(framework === 'taro' ? 'sr_replay_root:true' : 'sentry-replay-root'),
    'ordinary build must annotate page: ' + page,
  );
}
if (framework === 'taro') {
  const base = await readFile(join(root, 'base.wxml'), 'utf8');
  assert.ok(base.includes('mark:sr_') && base.includes('i.srReplayText'));
  assert.ok(!base.includes('&quot;'), 'WeChat bindings must use compatible quotes');
  // 注入模块必须实际进入 app 入口，配置了插件并不代表渲染观测已打包。
  const scripts = await Promise.all(
    (await readdir(root))
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFile(join(root, name), 'utf8')),
  );
  assert.ok(
    scripts.some((script) => script.includes('srReplayText')),
    'Taro text observer bundled',
  );
} else {
  const component = await readFile(join(root, 'components/ReplayCard.wxml'), 'utf8');
  assert.ok(component.includes('data-sentry-replay-slots="d"'));
  assert.ok(component.includes('mark:sr_') && component.includes('wx:for'));
}
console.log('Verified actual framework replay assets: ' + framework);
