# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript 源码入口，`src/extension.ts` 注册命令与视图；`src/webview.ts` 生成侧边栏 UI；`src/merge.ts`/`src/git.ts` 负责合并与 Git 交互；`src/jenkins.ts`/`src/deepseek.ts` 负责外部服务调用。
- `dist/`: `tsc` 编译输出，VS Code 扩展入口为 `dist/extension.js`。
- `media/`: 扩展图标与静态资源；`docs/`: 说明文档；`package.nls*.json`: 本地化文案。
- 配置文件示例与读取路径见 `README.md`，实际运行读取仓库根目录的 `.quick-merge.jsonc`。

## Build, Test, and Development Commands
- `npm run compile`: 使用 `tsc` 将 `src/` 编译到 `dist/`，用于本地构建与发布前检查。
- `npm run watch`: 监听模式编译，适合本地调试。
- `npm run vscode:prepublish`: 发布前编译（`vsce` 调用）。
- `npm run publish:all`/`npm run publish:ovsx`: 发布到 VS Code Marketplace 与 Open VSX。
- `npm run release:patch|minor|major`: 版本号升级并发布（会执行 publish）。

## Coding Style & Naming Conventions
- 语言为 TypeScript，`tsconfig.json` 启用 `strict`，目标 `es2020`，模块为 `commonjs`。
- 缩进使用 2 空格，字符串使用双引号（与现有文件保持一致）。
- 文件命名采用 `kebab-case.ts`；类名 `PascalCase`，函数/变量 `camelCase`，常量 `UPPER_SNAKE_CASE`。
- 当前未配置格式化或 lint 工具，提交前请保持与现有风格一致。

## Testing Guidelines
- 仓库目前未包含自动化测试脚本或测试目录。
- 变更后请至少通过本地编译，并在 VS Code 扩展调试环境中验证：侧边栏视图渲染、`.quick-merge.jsonc` 读取、合并流程与 Jenkins 触发是否正常。
- 若新增测试，请明确测试入口与运行方式，并更新本文件的测试说明。

## Commit & Pull Request Guidelines
- 现有提交信息以 `feat:`、`chore:`、`docs:` 为主，也可见版本号提交如 `1.0.3`；新增提交请沿用该前缀风格，示例：`feat: add merge summary details`。
- PR 请描述背景与变更点，若涉及 UI/webview 或文案，请附截图并同步更新 `README.md` 与 `README.zh-CN.md`。
- 若涉及配置字段或外部服务（Jenkins/DeepSeek），请在 PR 中说明默认值与兼容性影响。

## Security & Configuration Tips
- `.quick-merge.jsonc` 可能包含 API key/Token，请避免提交到版本库；建议使用本地配置或忽略文件。
- 外部服务地址与凭据变更需谨慎，确保对现有用户配置无破坏性影响。
