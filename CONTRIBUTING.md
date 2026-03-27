# Contributing to Sentry Miniapp SDK

Thank you for your interest in contributing to `sentry-miniapp`!

## Getting Started

For development setup, commands, project structure, and debugging workflow, see **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

Quick start:

```bash
git clone https://github.com/<your-username>/sentry-miniapp.git
cd sentry-miniapp
yarn install
yarn dev
```

## How to Contribute

### Reporting Bugs

- Use [GitHub Issues](https://github.com/lizhiyao/sentry-miniapp/issues) to report bugs.
- Include steps to reproduce, expected behavior, and actual behavior.
- Mention the mini program platform (WeChat, Alipay, etc.) and SDK version.

### Submitting Changes

1. Create a feature or fix branch from `master`:

```bash
git checkout -b feature/my-feature
# or
git checkout -b fix/my-fix
```

2. Make your changes. Write tests for new functionality.

3. Ensure all checks pass:

```bash
yarn lint && yarn test:all
```

4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat: add new feature description"
git commit -m "fix: fix bug description"
```

5. Push and open a Pull Request against `master`.

### Cross-Platform Compatibility

This is critical: when modifying functionality, **always consider the impact on all supported platforms** (WeChat, Alipay, ByteDance, DingTalk, QQ, Baidu, Kuaishou). If you use a platform-specific API, provide a fallback or conditional check.

## Code Style

- TypeScript is preferred for all new code.
- Follow the existing ESLint configuration.
- Code is auto-formatted by Prettier on commit (via lint-staged).

## Testing

- Write unit tests for all new features and bug fixes.
- Test files should be placed in the `test/` directory, mirroring the `src/` structure.
- The project targets 100% test coverage.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
