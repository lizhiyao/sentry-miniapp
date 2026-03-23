# 项目规范

## 开发工作流
1. **跨端兼容性**: 每次进行功能改造时，**必须**考虑对所有已支持平台的影响（包括微信、支付宝、字节跳动、钉钉、QQ、百度、快手）。如果使用了某个平台的特有 API，必须提供回退机制或条件判断。
2. **分支管理**: 在开始任何新功能或修复之前，**必须**基于最新代码创建一个新的 Git 分支（如 `feature/xxx` 或 `fix/xxx`）。禁止直接在主分支开发。
3. **文档同步**: 每次代码改造完成后，**必须**检查并更新相关文档（如 `README.md` 等），确保文档与代码逻辑保持一致。

## Git Commit 规范
- **必须**使用 Conventional Commits 格式（如 `feat:`, `fix:`, `chore:`）。
- **必须**使用**中文**编写 commit message 描述（如 `feat: 新增网络请求体抓取功能`）。

## 代码风格
- 遵循现有的 ESLint 规范。
- 优先使用 TypeScript 进行开发。

## 常用命令
- `yarn install` - 安装依赖
- `yarn run lint` - 代码检查
- `yarn run test` - 运行单元测试
- `yarn run test:all` - 运行全部测试（单元 + 集成）
- `yarn run build` - 构建项目
