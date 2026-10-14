# Source Maps

Source Maps translate deployed JavaScript positions into original source files. `enableSourceMap` defaults to true, but only normalizes event paths; it does not generate or upload maps.

Read the [upload guide](https://sentry-miniapp.pages.dev/guide/sourcemap) for build-specific configuration and the [advanced guide](https://sentry-miniapp.pages.dev/guide/sourcemap-advanced) for host compilation, two-layer maps and Debug IDs. Follow the consumer's actual pipeline instead of assuming Webpack or Vite configuration alone produced maps.

## Prepare the same build

1. For release-based matching, inject the same application `release` into SDK initialization and upload commands. With Debug IDs, additionally verify the event and uploaded bundle IDs; release equality alone does not establish that match.
2. Generate maps for the production target and retain the corresponding final JavaScript.
3. Match actual event filenames, usually normalized to `app:///`, to artifact relative paths.
4. Keep maps and `sourcesContent` out of the public deployment package.

uni-app may emit JS and maps in separate directories; combine matching relative paths into one upload directory. Taro's map format depends on its bundler. Compare actual artifacts, not only configuration flags.

## Use the SDK's local tools

After installing the selected SDK version in the consumer:

```bash
npx --no-install sentry-miniapp-sourcemap-doctor \
  --dist ./dist \
  --release "$SENTRY_RELEASE" \
  --strict
```

Doctor only reads local artifacts. It does not log in, upload, alter files or establish backend symbolication.

If a WeChat outer map still points to intermediate JS, install `source-map` as a development dependency and use the SDK's merge command:

```bash
npm install --save-dev source-map
npx --no-install sentry-miniapp-sourcemap-merge \
  --wechat ./wechat/appservice.app.js.map \
  --build-maps ./dist/build/mp-weixin \
  --out ./sentry-upload/appservice.app.js.map \
  --strip webpack://
```

Use the actual consumer paths. Downloaded outer maps must match the running upload version and robot. If they already map to original sources, verify event coordinates before composing again. Ambiguous or unmatched files must be resolved; do not rename arbitrary JS to manufacture a matching runtime filename.

## Upload and verify

Install the CLI version used by this guide:

```bash
npm install @sentry/cli@3.6.2 --save-dev --save-exact
```

Use approved consumer credentials in CI secrets or untracked local configuration. Do not put tokens into tracked files or tool output. Prepare and check artifacts before performing an authorized upload.

```bash
npx --no-install sentry-cli releases new "$SENTRY_RELEASE"
npx --no-install sentry-cli sourcemaps upload --release "$SENTRY_RELEASE" ./dist \
  --url-prefix "app:///" \
  --ext js --ext map \
  --validate
npx --no-install sentry-cli releases finalize "$SENTRY_RELEASE"
```

Upload JS and maps from the same final build. If a build plugin injects Debug IDs, deploy the same injected JS and upload its corresponding maps; verify the new event's `debug_meta` against the uploaded IDs. Additional host compilation may invalidate pre-upload coordinates or carriers.

After upload, trigger a new error and inspect its release, filename, line/column, original source and source context in Sentry. Previously ingested events are not reprocessed by uploading maps.

Retain one matching artifact pair until validation completes, then exclude maps from deployment. Use the consumer's existing cleanup pipeline rather than indiscriminately deleting project files. HTTP success or a local mapping result does not prove backend symbolication.
