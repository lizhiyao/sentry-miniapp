---
name: Bug Report
about: Report a bug to help us improve
title: ''
labels: bug
assignees: ''
---

## Description

A clear and concise description of the bug.

## Environment

- **Installed SDK version**: (exact version; include whether installed from npm or built from this repository)
- **Platform**: (e.g., WeChat / Alipay / ByteDance / Baidu / QQ / DingTalk / Kuaishou)
- **Framework**: (e.g., Native / Taro / uni-app)
- **Runtime**: (mini program / mini game; DevTools / physical device)
- **Mini program base library version**: (e.g., 3.2.0)
- **Device**: (e.g., iPhone 15, Xiaomi 14)
- **Sentry deployment**: (Sentry SaaS / self-hosted version, when delivery or display is affected)

## Steps to Reproduce

1.
2.
3.

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include error messages or screenshots if applicable.

## SDK Init Configuration

```javascript
Sentry.init({
  dsn: '...',
  // your configuration
});
```

## Additional Context

Attach `Sentry.getDiagnostics()` output when available. For delivery or Source Map problems, include a new event ID, release and relevant stack filename. Remove auth tokens and personal data before sharing configuration or logs.
