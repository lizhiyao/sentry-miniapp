# 开发调试指南

本指南介绍如何在 wxapp 示例项目中直接调试验证 `src` 目录下的源码。

## 开发模式构建

### 快速开始

1. **一次性构建开发版本**
   ```bash
   npm run build:miniapp
   ```
   
2. **启动监听模式（推荐）**
   ```bash
   npm run dev
   ```
   
   监听模式会：
   - 执行初始构建
   - 监听 `src/` 目录下的文件变化
   - 自动重新构建到 `examples/wxapp/lib/`
   - 按 `Ctrl+C` 停止监听

### 开发版本特性

开发版本与生产版本的区别：

- ✅ **启用 Source Map** - 便于调试和错误定位
- ✅ **保留注释** - 保持代码可读性
- ✅ **开发版本标记** - 版本号后缀 `-dev`
- ✅ **实时同步** - 直接使用最新源码
- ✅ **完整依赖** - 包含 `@sentry/core` 等依赖

## 调试工作流

### 1. 启动开发模式

```bash
# 启动监听模式
npm run dev
```

### 2. 修改源码

在 `src/` 目录下修改任何 TypeScript 文件，保存后会自动触发重新构建：

```
📝 文件变化: index.ts
🔄 检测到文件变化，重新构建...
✅ 重新构建完成
```

### 3. 测试验证

在示例项目中测试修改后的代码：

```bash
# 运行单元测试
npm test

# 或者运行集成测试
npm run test:integration
```

### 4. 微信开发者工具调试

1. 打开微信开发者工具
2. 导入 `examples/wxapp` 项目
3. 在开发者工具中查看 `lib/` 目录下的构建文件
4. 利用 Source Map 进行断点调试

## 目录结构

```
sentry-miniapp/
├── src/                          # 源码目录
│   ├── index.ts                  # 主入口
│   ├── integrations/             # 集成模块
│   └── transports/               # 传输模块
├── examples/wxapp/               # 示例项目
│   ├── lib/                      # 开发构建输出（自动生成）
│   │   ├── sentry-miniapp.js     # 主入口文件
│   │   └── sentry-miniapp.js.map # Source Map 文件
│   ├── app.js                    # 小程序入口
│   ├── pages/                    # 小程序页面
│   └── project.config.json       # 项目配置
├── integration-tests/            # 集成测试脚本，用于验证特定问题修复和端到端功能
│   ├── test-multiple-exceptions.js
│   └── ...                       # 其他测试脚本
└── test/                         # 单元测试文件
    ├── client.test.ts
    └── ...                       # 其他测试文件
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动监听模式（推荐） |
| `npm run build` | 构建生产版本（npm 发布用） |
| `npm run build:miniapp` | 构建小程序版本 |
| `npm run build:types` | 构建类型定义文件 |
| `npm test` | 运行测试套件 |
| `npm run lint` | 代码检查 |

## 调试技巧

### 1. 使用 Console 调试

在源码中添加 `console.log` 语句：

```typescript
// src/index.ts
export function init(options: ClientOptions): void {
  console.log('🐛 [DEBUG] Sentry init called with:', options);
  // ... 其他代码
}
```

### 2. 利用 Source Map

开发版本包含 Source Map，可以在微信开发者工具中：
- 直接在 TypeScript 源码上设置断点
- 查看原始变量名和代码结构
- 获得准确的错误堆栈信息

### 3. 版本识别

开发版本的 SDK 版本号会包含 `-dev` 后缀，便于区分：

```javascript
console.log(Sentry.SDK_VERSION); // 输出: "1.0.0-beta.1-dev"
```

### 4. 错误排查

如果遇到构建错误：

1. 检查 TypeScript 语法错误
2. 确保所有导入路径正确
3. 查看构建日志中的详细错误信息
4. 重新运行 `npm run dev` 进行完整重建

## 注意事项

- 🚨 **开发版本仅用于调试** - 不要用于生产环境
- 📁 **lib/ 目录会被覆盖** - 不要手动修改 `examples/wxapp/lib/` 下的文件
- 🔄 **自动重建** - 监听模式下修改源码会自动触发重建
- 💾 **保存触发** - 只有保存文件才会触发重建，临时修改不会

## 故障排除

### 构建失败

```bash
# 清理并重新构建
rm -rf examples/wxapp/lib
npm run dev
```

### 监听不工作

```bash
# 停止当前监听（Ctrl+C）
# 重新启动
npm run dev
```

### 依赖问题

```bash
# 重新安装依赖
npm install
npm run dev
```

---

通过这个开发模式，你可以高效地在 wxapp 示例项目中调试和验证 `src` 目录下的源码修改！