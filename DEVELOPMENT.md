# Sentry Miniapp SDK 开发指南

本文档介绍如何在开发过程中使用和调试 sentry-miniapp SDK。

## 开发环境设置

### 1. 安装依赖

```bash
npm install
```

### 2. 开发命令

```bash
# 构建标准版本（用于发布）
npm run build

# 构建小程序开发版本
npm run build:miniapp

# 构建类型定义文件
npm run build:types

# 开发模式构建（监听模式）
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint
```

## 小程序开发调试

### 构建流程

1. **源码编译**：TypeScript 源码被编译为 ES5 兼容的 JavaScript
2. **输出目录**：编译后的文件输出到 `examples/wxapp/lib/`
3. **入口文件**：自动生成 `sentry-miniapp.js` 作为统一入口

### 开发工作流

1. 修改 `src/` 目录下的源码
2. 运行 `npm run build:miniapp` 重新构建
3. 在微信开发者工具中刷新或重新编译
4. 查看控制台输出和错误信息

**推荐使用监听模式：**
```bash
npm run dev  # 自动监听文件变化并重新构建
```

### 调试技巧

- 使用 `console.log` 在关键位置添加调试信息
- 在微信开发者工具的控制台查看输出
- 利用小程序的调试面板检查网络请求
- 使用真实的错误场景测试异常捕获

## 示例项目结构

```
examples/wxapp/
├── lib/                    # 构建输出目录
│   ├── sentry-miniapp.js  # SDK 入口文件
│   ├── index.js           # 主模块
│   ├── client.js          # 客户端实现
│   ├── integrations/      # 集成模块
│   └── ...
├── app.js                 # 小程序入口
├── app.json              # 应用配置
├── pages/                # 页面文件
└── README.md             # 使用说明
```

## 构建配置

项目使用 Vite 作为构建工具，配置如下：

- **构建工具**：Vite（替代 Webpack）
- **目标版本**：ES2015
- **模块系统**：支持 CommonJS 和 ESM
- **源码映射**：开启（便于调试）
- **代码压缩**：关闭（保持可读性）
- **TypeScript**：完整支持

## 常见问题

### 1. 编译错误

如果遇到 TypeScript 编译错误：

- 检查是否使用了小程序不支持的 API
- 确认类型定义是否正确
- 查看是否需要添加 polyfill

### 2. 运行时错误

如果在小程序中运行出错：

- 检查模块引用路径是否正确
- 确认是否使用了浏览器特有的 API
- 验证小程序环境的限制

### 3. 功能验证

验证 SDK 功能是否正常：

- 检查初始化是否成功
- 测试错误捕获和上报
- 验证集成模块是否工作
- 确认配置选项是否生效

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 修改代码并添加测试
4. 运行 `npm run build:miniapp` 验证构建
5. 运行 `npm test` 确保测试通过
5. 在示例项目中测试功能
6. 提交 Pull Request

## 发布流程

1. 更新版本号
2. 运行完整测试套件
3. 构建生产版本
4. 更新文档
5. 发布到 npm