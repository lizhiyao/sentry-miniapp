# Sentry Miniapp 示例应用设计规范

本文档定义了 `examples/wxapp` 的视觉与交互设计规范，旨在保持代码库风格的一致性。

## 1. 核心原则 (Core Principles)

- **现代化 (Modern)**：使用浅色背景、圆角卡片、柔和阴影和清晰的排版。
- **Sentry 品牌 (Sentry Branded)**：主色调采用 Sentry 紫 (`#6C5FC7`)。
- **直观 (Intuitive)**：优先展示状态信息，将操作按功能分组。
- **可访问性 (Accessible)**：确保足够的色彩对比度和点击区域。

## 2. 色彩系统 (Color System)

| 用途 | 变量名 | 色值 | 说明 |
| :--- | :--- | :--- | :--- |
| **主色** | `--primary-color` | `#6C5FC7` | Sentry 品牌色，用于按钮、高亮文本 |
| **主色 (浅)** | `--primary-light` | `#E0DBF9` | 辅助背景、选中状态 |
| **背景色** | `--bg-color` | `#F5F7FA` | 全局页面背景 (Light Grey) |
| **卡片背景** | `--card-bg` | `#FFFFFF` | 内容容器背景 |
| **文本 (主要)** | `--text-primary` | `#1E293B` | 标题、正文 |
| **文本 (次要)** | `--text-secondary` | `#64748B` | 副标题、描述 |
| **文本 (弱化)** | `--text-tertiary` | `#94A3B8` | 占位符、次要信息 |
| **成功** | `--success-color` | `#10B981` | 状态指示 |
| **警告** | `--warning-color` | `#F59E0B` | 状态指示 |
| **错误** | `--danger-color` | `#EF4444` | 状态指示 |

## 3. 排版与布局 (Typography & Layout)

### 字体

- 使用系统默认字体栈：`-apple-system, BlinkMacSystemFont, ...`
- 基础字号：`28rpx` (正文)
- 标题字号：`34rpx` (一级标题), `30rpx` (卡片标题)

### 间距与圆角

- **页面内边距**：`32rpx`
- **卡片内边距**：`32rpx`
- **卡片圆角**：`24rpx`
- **按钮圆角**：`16rpx`
- **元素间距**：`24rpx` (标准间距)

### 阴影 (Shadows)

- **Small**: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
- **Medium**: `0 4px 6px -1px rgba(0, 0, 0, 0.1)` (用于按钮)
- **Large**: `0 10px 15px -3px rgba(0, 0, 0, 0.1)` (用于弹窗)

## 4. 组件规范 (Component Specs)

### 卡片 (Card)

所有主要内容应包裹在 `.card` 类中：

```css
.card {
  background: var(--card-bg);
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: var(--shadow-sm);
}
```

### 按钮 (Button)

主要操作按钮使用 `.btn-primary`：

- 背景色：`--primary-color`
- 文字色：`#FFFFFF`
- 高度：`88rpx` (标准触摸目标)
- 交互：点击时有 `0.9` 透明度和 `translateY(2rpx)` 位移。

### 状态徽章 (Status Badge)

用于展示 SDK 连接状态：

- 结构：`.status-badge` > `.dot` + `text`
- 激活态：`.active` 类改变颜色为 `--success-color`。

## 5. 交互模式 (Interaction Patterns)

- **点击反馈**：所有可点击元素应有 `:active` 态样式变化。
- **加载状态**：异步操作应展示 Loading Toast 或 Skeleton。
- **操作结果**：操作完成后必须使用 `wx.showToast` 给予明确反馈。
- **错误处理**：对于非预期的错误，使用 `wx.showModal` 或 Toast 提示，并自动上报 Sentry。
