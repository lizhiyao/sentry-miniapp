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

This means you only need to upload source maps with `--url-prefix "app:///"` regardless of platform.

## Setup

### Step 1: Install sentry-cli

```bash
npm install @sentry/cli --save-dev
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

sentry-cli releases new "$VERSION"
sentry-cli releases files "$VERSION" upload-sourcemaps ./dist \
  --url-prefix "app:///" \
  --ext js --ext map
sentry-cli releases finalize "$VERSION"
```

> The `release` value here **must exactly match** the `release` option in `Sentry.init()`.

### Step 5: Clean Up

Delete `.map` files from deployment artifacts — they contain source code:

```bash
find ./dist -name "*.map" -delete
```

## CI/CD Example (GitHub Actions)

```yaml
- name: Upload Source Maps
  run: |
    npx sentry-cli releases new "$SENTRY_RELEASE"
    npx sentry-cli releases files "$SENTRY_RELEASE" upload-sourcemaps ./dist \
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

Instead of manual sentry-cli commands, use build plugins:

**Webpack (`@sentry/webpack-plugin`):**

```javascript
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

chain.plugin('sentry').use(sentryWebpackPlugin, [{
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: 'your-org',
  project: 'your-project',
  release: { name: process.env.SENTRY_RELEASE },
  urlPrefix: 'app:///',
  sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
}]);
```

**Vite (`@sentry/vite-plugin`):**

```javascript
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'your-org',
      project: 'your-project',
      release: { name: process.env.SENTRY_RELEASE },
      urlPrefix: 'app:///',
      sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
    }),
  ],
});
```

## Platform Notes

### WeChat Mini Program

**Must disable** WeChat DevTools built-in compilation:
- ES6 to ES5 → OFF
- Code Minification → OFF
- Style Auto-Complete → OFF

Let your build tool (Webpack/Vite) handle these. DevTools' built-in transforms break source map line/column alignment.

## Verification

```bash
# List uploaded files
sentry-cli releases files "my-miniapp@1.0.0" list
```

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
| WeChat DevTools line numbers off | Disable DevTools' ES6/minification features |
