import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instrumentWechatProject } from '../../dist/sentry-miniapp-replay-tools.mjs';
const parent = await mkdtemp(join(tmpdir(), 'sentry-miniapp-replay-demo-'));
const report = await instrumentWechatProject({
  input: 'examples/wxapp',
  output: join(parent, 'project'),
  pages: ['pages/replay-components/index'],
});
console.log('微信开发者工具打开以下目录，进入「页面回放」tab：\n' + report.output);
