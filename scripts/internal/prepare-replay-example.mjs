import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instrumentWechatProject } from '../../dist/sentry-miniapp-replay-tools.mjs';
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--local')) throw new Error('只支持 --local 参数');
const parent = await mkdtemp(join(tmpdir(), 'sentry-miniapp-replay-demo-'));
const report = await instrumentWechatProject({
  input: 'examples/wxapp',
  output: join(parent, 'project'),
  pages: ['pages/replay-components/index'],
});
if (args.includes('--local')) {
  await writeFile(
    join(report.output, 'replay-validation.config.js'),
    "module.exports = { mode: 'local' };\n",
  );
  console.log('本地验证模式：SDK transport 仅在内存保存录制，不请求 Sentry。');
}
console.log('微信开发者工具打开以下目录，进入「页面回放」tab：\n' + report.output);
