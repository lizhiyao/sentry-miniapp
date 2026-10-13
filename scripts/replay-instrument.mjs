#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { instrumentWechatProject } from '../dist/sentry-miniapp-replay-tools.mjs';
const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    page: { type: 'string', multiple: true },
    help: { type: 'boolean' },
  },
});
if (values.help || !values.input || !values.output || !values.page?.length) {
  console.log(
    'Usage: sentry-miniapp-replay-instrument --input <WeChat project> --output <fresh directory> --page pages/example/index [--page ...]',
  );
  if (!values.help) process.exitCode = 1;
} else {
  try {
    console.log(
      JSON.stringify(
        await instrumentWechatProject({
          input: values.input,
          output: values.output,
          pages: values.page,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
