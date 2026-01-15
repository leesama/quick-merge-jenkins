# Quick Merge Jenkins

一个“配置驱动”的 VSCode 合并助手：从项目根目录读取 `.quick-merge.json`，用按钮一键执行合并流程，并在合并成功后可选触发 Jenkins 构建。

## 功能

- 一键合并：按配置执行 `checkout target` → `merge source` → 回到原分支
- 冲突处理：列出冲突文件、打开合并编辑器、回到原分支
- 结果展示：合并摘要（commit、变更文件、耗时）、推送与 Jenkins 触发结果
- 多套合并配置：一个项目可配置多个合并按钮
- Jenkins 触发：合并成功后可触发 Jenkins 构建（无需在 UI 配置）

## 使用方式

1. 打开项目文件夹，侧边栏点击 **Quick Merge Jenkins** 图标
2. 点击“打开配置文件”生成 `.quick-merge.json`
3. 编辑配置后，点击刷新图标更新按钮列表
4. 点击对应按钮执行合并

> 注意：配置只在点击刷新图标时读取，保存配置后需手动刷新。

## 配置文件格式

项目根目录：`.quick-merge.json`

示例：

```json
{
  "ui": {
    "refreshLabel": "⟳",
    "openConfigLabel": "打开配置文件"
  },
  "profiles": [
    {
      "id": "merge-main",
      "label": "合并到 main",
      "sourceBranch": "",
      "targetBranch": "main",
      "strategy": "default",
      "pushAfterMerge": true,
      "pushRemote": "origin",
      "jenkins": {
        "enabled": true,
        "url": "https://jenkins.example.com",
        "job": "team/release/build",
        "user": "jenkins-user",
        "apiToken": "jenkins-api-token",
        "crumb": true,
        "parameters": {
          "SOURCE_BRANCH": "${sourceBranch}",
          "TARGET_BRANCH": "${targetBranch}",
          "MERGE_COMMIT": "${mergeCommit}"
        }
      }
    },
    {
      "id": "merge-release",
      "label": "合并到 release",
      "sourceBranch": "",
      "targetBranch": "release",
      "strategy": "no-ff",
      "pushAfterMerge": false
    }
  ]
}
```

### 字段说明

- `ui.refreshLabel` / `ui.openConfigLabel`：按钮文案（可选）
- `profiles`：合并配置列表（必须）
  - `id`：配置唯一标识（按钮点击时使用）
  - `label`：按钮文案
  - `sourceBranch`：源分支，留空默认当前分支
  - `targetBranch`：目标分支（必填）
  - `strategy`：`default` / `no-ff` / `ff-only`
  - `pushAfterMerge`：是否推送远端（默认 `true`）
  - `pushRemote`：远端名（默认 `origin`，没有则取第一个远端）
  - `jenkins`：Jenkins 触发配置（可选）

### Jenkins 配置

- `url`：Jenkins 根地址（不要包含 `/job/...`）
- `job`：Job 路径，使用 `folder/jobName` 形式
- 认证方式（两选一）
  - `user` + `apiToken`（推荐）
  - `token`（Job 里开启 “Trigger builds remotely”）
- `crumb`：Jenkins 开启 CSRF 时设为 `true`
- `parameters`：触发参数，支持变量：
  - `${sourceBranch}` `${targetBranch}` `${currentBranch}` `${mergeCommit}` `${strategy}` `${pushRemote}`

## 故障排查

- Jenkins Crumb 403：请确认 `user` + `apiToken` 正确，或将 `crumb` 设为 `false`
- 推送失败：检查 `pushRemote` 是否存在，以及仓库权限
