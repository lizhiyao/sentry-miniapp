import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkPackageReplay(tempRoot, runNode) {
  for (const mode of ['mjs', 'cjs']) {
    const load =
      mode === 'mjs'
        ? "import assert from 'node:assert/strict'; import * as sdk from 'sentry-miniapp'; import * as optional from 'sentry-miniapp/replay';"
        : "const assert=require('node:assert/strict'), sdk=require('sentry-miniapp'), optional=require('sentry-miniapp/replay');";
    const source =
      load +
      `
async function run() {
  const page={route:'pages/checkout/index'}, envelopes=[];
  globalThis.getCurrentPages=()=>[page];
  globalThis.wx={request(){},onAppShow(){},onAppHide(){},createSelectorQuery(){
    const q={in(scope){assert.equal(scope,page);return q;},
      selectViewport(){return {fields(){return q;}};},selectAll(){return {fields(){return q;}};},
      exec(cb){cb([{width:375,height:700},[{left:20,top:40,width:100,height:40,
        dataset:{sentryReplayText:'private input'}}]]);}};
    return q;
  }};
  const client=sdk.init({dsn:'https://key@example.com/1',defaultIntegrations:false,enableOfflineCache:false,
    integrations:[optional.wechatPageReplayIntegration({sessionSampleRate:1})],transport:()=>({
      send(envelope){envelopes.push(envelope);return Promise.resolve({statusCode:200});},
      flush:()=>Promise.resolve(true)})});
  const replay=optional.getWechatPageReplay();
  assert.ok(replay,'Replay must share the root Client and Core scope');
  assert.equal(await replay.capture(),true);
  assert.equal(await replay.flush(),true);
  assert.equal(envelopes[0][1][0][0].type,'replay_event');
  assert.equal(envelopes[0][1][1][0].type,'replay_recording');
  assert.ok(!JSON.stringify(envelopes).includes('private input'));
  const recording=envelopes[0][1][1];
  assert.equal(Buffer.byteLength(recording[1],'utf8'),recording[0].length);
  sdk.init({dsn:'https://key@example.com/1',defaultIntegrations:false,enableOfflineCache:false,
    transport:()=>({send:()=>Promise.resolve({statusCode:200}),flush:()=>Promise.resolve(true)})});
  assert.equal(replay.start(),false,'Replaced recorder cannot restart');
  assert.equal(optional.getWechatPageReplay(),undefined);
  sdk.getClient().dispose();
}
run().catch(error=>{console.error(error);process.exitCode=1;});
`;
    const file = join(tempRoot, 'replay-consumer.' + mode);
    await writeFile(file, source);
    const result = await runNode(file, tempRoot);
    assert.equal(result.stderr, '');
  }
  console.log(
    'Installed replay ESM/CJS entrypoints share root state and emit bounded, masked recordings.',
  );
  const file = join(tempRoot, 'replay-tool-consumer.mjs');
  await writeFile(
    file,
    `import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {instrumentWechatProject} from 'sentry-miniapp/replay-tools';
await mkdir('tool-source');
await writeFile('tool-source/app.json',JSON.stringify({pages:['index'],usingComponents:{widget:'@ui/widget'}}));
await mkdir('tool-source/miniprogram_npm/@ui/widget',{recursive:true});
await writeFile('tool-source/miniprogram_npm/@ui/widget/index.json','{"component":true}');
await writeFile('tool-source/miniprogram_npm/@ui/widget/index.wxml','<text>package component</text>');
await writeFile('tool-source/index.wxml','<view class="root"><text>{{a < b ? "yes" : "no"}}</text><widget/></view>');
await writeFile('tool-source/index.js','Page({});');
await instrumentWechatProject({input:'tool-source',output:'tool-output',pages:['index']});
assert.match(await readFile('tool-output/index.wxml','utf8'),/sentry-replay-root/);
assert.equal(await readFile('tool-output/index.js','utf8'),'Page({});');
assert.match(await readFile('tool-output/index.wxml','utf8'),/data-sentry-replay-target=/);
assert.match(await readFile('tool-output/miniprogram_npm/@ui/widget/index.wxml','utf8'),/sentry-miniapp replay metadata/);
`,
  );
  const tool = await runNode(file, tempRoot);
  assert.equal(tool.stderr, '');
}
