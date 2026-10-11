# Contributing to Sentry Miniapp SDK

Thank you for your interest in contributing to `sentry-miniapp`!

## Getting Started

For module responsibilities, Core boundaries, and lifecycle constraints, read **[ARCHITECTURE.md](./ARCHITECTURE.md)** (Chinese).

For development setup, commands, project structure, and debugging workflow, see **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

Quick start:

For repository development, use Node.js 20.19+ on the 20.x line, 22.13+ on the 22.x line, or 24+. This satisfies the current Core, Vite, Vitest and ESLint requirements; CI uses 20.x, 22.x and 24.x. The published package's `engines.node` describes the SDK/Core dependency range, which is broader than the development tools' range. Yarn is pinned by `packageManager`.

```bash
git clone https://github.com/<your-username>/sentry-miniapp.git
cd sentry-miniapp
corepack enable   # 启用后 yarn 自动对齐到 package.json 固定的 Yarn 4 版本
yarn install
yarn run dev
```

## How to Contribute

### Reporting Bugs

- Use [GitHub Issues](https://github.com/lizhiyao/sentry-miniapp/issues) to report bugs.
- Include steps to reproduce, expected behavior, and actual behavior.
- Mention the mini program platform (WeChat, Alipay, etc.) and SDK version.

### Submitting Changes

1. Create a short-lived branch from the latest `master`. Do not commit directly to `master`:

```bash
git fetch origin master
git switch -c feature/my-change origin/master
```

2. Make your changes and update the relevant documentation. For behavior changes, follow the testing guidance below; documentation-only changes do not require new unit tests.

3. Ensure all checks pass:

```bash
yarn run lint
yarn run typecheck
yarn run test
# SDK builds or cross-platform behavior: yarn run build
# Website content or navigation: yarn run docs:build
```

4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) with a Chinese subject, as required by [AGENTS.md](./AGENTS.md):

```bash
git commit -m "feat(integrations): 新增请求过滤选项"
git commit -m "docs: 完善小程序接入说明"
```

5. Push and open a Pull Request against `master`. Describe the user-visible result, relevant validation and any compatibility limits. Release PRs must preserve the release commit with a merge commit; see [DEVELOPMENT.md](./DEVELOPMENT.md#发布流程-maintainers-only).

### Cross-Platform Compatibility

This is critical: when modifying functionality, **always consider the impact on all supported platforms** (WeChat, Alipay, ByteDance, DingTalk, QQ, Baidu, Kuaishou). If you use a platform-specific API, provide a fallback or conditional check.

## Code Style

- TypeScript is preferred for all new code.
- Follow the existing ESLint configuration.
- lint-staged runs ESLint and Prettier for staged source/scripts, and ESLint for tests. Markdown is not automatically formatted by this hook; check code fences, links and rendered pages when editing documentation.

## Testing

- Write unit tests for all new features and bug fixes.
- Test files should be placed in the `test/` directory, mirroring the `src/` structure.
- Tests must execute production code from `src/` or repository scripts. Do not add tests which
  only assert calls to mocks or helper logic defined inside the test itself.
- Reuse `test/support/` for real `@sentry/core` transports and envelope assertions. Prefer fake
  timers over real delays for time-dependent behavior.
- `yarn run typecheck` checks both production code and tests. Keep mocks compatible with the real
  function signatures instead of bypassing test type errors with broad casts.
- Coverage must stay above the global thresholds enforced by `vitest.config.mts`.
  New changes should improve coverage without excluding production code from measurement.
- Prefer strengthening an existing test to adding another test for the same behavior. Use
  parameterized cases for distinct inputs, and avoid assertions that merely check a fixture,
  reproduce implementation logic or count private state. Tests at multiple layers should
  protect distinct boundaries, such as parser output, the final Core envelope and installed
  package entry points. Test count is not an acceptance criterion.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
