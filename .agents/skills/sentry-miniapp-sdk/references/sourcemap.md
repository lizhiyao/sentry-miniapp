# Source Map — Mini Program SDK

Map minified stack traces back to original source code in Sentry.

## Why Source Maps Matter

Mini program code is minified before deployment. Without source maps, error stack traces show compressed variable names and wrong line numbers, making debugging nearly impossible.

## How It Works

The SDK includes a `RewriteFrames` integration (enabled by default via `enableSourceMap: true`) that normalizes platform-specific virtual paths to a standard `app:///` prefix:

```
WeChat:     appservice/pages/index.js    →  app:///pages/index.js
Alipay:     https://appx/pages/index.js  →  app:///pages/index.js
ByteDance:  tt://pages/index.js          →  app:///pages/index.js
Baidu:      swan://pages/index.js        →  app:///pages/index.js
```

Normalize final event filenames and compare actual uploaded artifact names; a prefix alone does not prove symbolication, especially with a second host compilation layer.

## Setup

### Step 1: Install sentry-cli

```bash
npm install @sentry/cli@3.6.2 --save-dev --save-exact
```

### Step 2: Configure Authentication

**Option A: `.sentryclirc` file** (for local development)

```ini
[auth]
token=your-auth-token

[defaults]
org=your-org
project=your-project
```

> Add `.sentryclirc` to `.gitignore` to protect your token.

**Option B: Environment variables** (for CI/CD)

```bash
export SENTRY_AUTH_TOKEN=your-auth-token
export SENTRY_ORG=your-org
export SENTRY_PROJECT=your-project
```

### Step 3: Generate Source Maps

#### Webpack (Taro)

```javascript
// config/index.js
const config = {
  mini: {
    webpackChain(chain) {
      chain.devtool('hidden-source-map');
    },
  },
};
```

#### Vite

```javascript
// vite.config.js
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
});
```

#### uni-app (Vue CLI)

```javascript
// vue.config.js
module.exports = {
  productionSourceMap: true,
  configureWebpack: {
    devtool: 'hidden-source-map',
  },
};
```

> Use `hidden-source-map` / `sourcemap: 'hidden'` to generate `.map` files without adding `sourceMappingURL` comments to production code.

### Step 4: Upload Source Maps

```bash
VERSION="my-miniapp@1.0.0"

npx sentry-cli releases new "$VERSION"
npx sentry-cli sourcemaps upload --release "$VERSION" ./dist \
  --url-prefix "app:///" \
  --ext js --ext map
npx sentry-cli releases finalize "$VERSION"
```

> The `release` value here **must exactly match** the `release` option in `Sentry.init()`.

### Step 5: Clean Up

Build-tool plugins should use `filesToDeleteAfterUpload` so cleanup only runs
after a successful upload. For a manual CLI flow, preview the exact files first:

```bash
find ./dist -type f -name "*.map" -print
```

After the upload and release finalization succeed, confirm that list and remove
only those files from the deployment artifact:

```bash
find ./dist -type f -name "*.map" -delete
```

## CI/CD Example (GitHub Actions)

```yaml
- name: Upload Source Maps
  run: |
    npx sentry-cli releases new "$SENTRY_RELEASE"
    npx sentry-cli sourcemaps upload --release "$SENTRY_RELEASE" ./dist \
      --url-prefix "app:///" \
      --ext js --ext map
    npx sentry-cli releases finalize "$SENTRY_RELEASE"
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: your-org
    SENTRY_PROJECT: your-project
    SENTRY_RELEASE: my-miniapp@${{ github.ref_name }}
```

## Build Tool Plugins (Alternative)

Instead of manual sentry-cli commands, use build plugins. Modern plugins inject Debug IDs and upload the matching JS/map artifacts; `urlPrefix` is not a top-level plugin option. Keep release-based path uploads on the CLI flow above.

**Webpack (`@sentry/webpack-plugin`):**

```javascript
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

chain.plugin('sentry').use(sentryWebpackPlugin, [{
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: 'your-org',
  project: 'your-project',
  release: { name: process.env.SENTRY_RELEASE },
  sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
}]);
```

**Vite (`@sentry/vite-plugin`):**

```javascript
import { defineConfig } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'your-org',
      project: 'your-project',
      release: { name: process.env.SENTRY_RELEASE },
      sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
    }),
  ],
});
```

Build and deploy the same injected JS that produced the uploaded maps. Check a new event's `debug_meta` against the uploaded Debug IDs on the target mini program or game engine; plugin injection alone does not prove that the host preserves those IDs through its own compilation.

## Platform Notes

### WeChat Mini Program

Prefer doing JavaScript transpilation and minification in Webpack/Vite, then disable DevTools' ES6-to-ES5 and JavaScript minification to avoid another transform. If DevTools still transforms or merges JavaScript, retain its final JS/map from the same uploaded version and compose that outer map with the build maps when needed. Uploading only pre-transform maps cannot certify the final stack positions. CSS style auto-completion does not affect JavaScript source map alignment.

## Verification

Check the project's Source Maps/artifact bundle UI for the upload record, names and Debug IDs.

Should show entries like:
```
app:///pages/index.js          12.5 KB
app:///pages/index.js.map      45.2 KB
```

Then trigger a test error — Sentry should display the original source code in the stack trace.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Minified code still shown | Check `release` matches exactly between `Sentry.init()` and `sentry-cli` |
| File paths don't match | Verify `--url-prefix "app:///"` and `enableSourceMap: true` (default) |
| Upload timeout | Increase timeout in `.sentryclirc`: `[http]` → `timeout = 120` |
| WeChat DevTools line numbers off | Disable extra JavaScript transforms, or obtain and compose the same-version final JS/map |

CLI examples pin @sentry/cli 3.6.2. CLI 3 removed releases files and sourcemaps explain; use sourcemaps upload and the event Unminify Code flow ([official migration](https://github.com/getsentry/sentry-cli/releases/tag/3.0.0)). If using Debug IDs, inject before both upload and deployment, and deploy the same injected JS/map pair. Do not inject only an upload copy and assume runtime debug_meta matches. Local mappings do not certify platform recompilation or backend symbolication.
