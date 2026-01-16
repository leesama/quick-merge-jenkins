# Quick Merge Jenkins

一个“配置驱动”的 VSCode 合并助手：从项目根目录读取 `.quick-merge.jsonc`，用按钮一键执行合并流程，并在合并成功后可选触发 Jenkins 构建。

## 功能

- 一键合并：按配置执行 `checkout target` → `merge source` → 回到原分支
- 冲突处理：列出冲突文件、打开合并编辑器、回到原分支
- 结果展示：合并摘要（commit、变更文件、耗时）、推送与 Jenkins 触发结果
- 多套合并配置：一个项目可配置多个合并按钮
- Jenkins 触发：合并成功后可触发 Jenkins 构建（无需在 UI 配置）
- 发布到测试环境：可选 Jenkins 触发的测试环境发布按钮
- 需求分支创建：选择 feature/fix + 中文描述，自动翻译成英文并创建分支

## 使用方式

1. 打开项目文件夹，侧边栏点击 **Quick Merge Jenkins** 图标
2. 点击刷新图标读取配置；若不存在配置，会自动创建并打开
3. 编辑配置后，再次点击刷新图标更新按钮列表
4. 点击对应按钮执行合并
5. 点击“创建需求分支”，选择类型并输入中文描述，即可自动创建分支

> 注意：配置在执行合并时会自动读取。刷新按钮是可选的，仅用于更直观地查看侧边栏按钮列表，不影响实际的配置读取。出于性能考虑，暂不支持自动监听配置文件变化。
> 也可在命令面板执行 `Quick Merge Jenkins: Open Config File`。

## 配置文件格式

项目根目录：`.quick-merge.jsonc`（支持注释，兼容旧版 `.quick-merge.json`）

示例：

```jsonc
{
  // 需求分支创建设置（基于最新 release_YYYYMMDD 分支创建）
  "demandBranch": {
    "prefixes": ["feature", "fix"],
    "releasePrefix": "release",
    "deepseekApiKey": "",
    "deepseekBaseUrl": "https://api.deepseek.com/v1",
    "deepseekModel": "deepseek-chat"
  },
  // 发布到测试环境按钮配置
  "deployToTest": {
    "enabled": true,
    "jenkins": {
      "url": "https://jenkins.example.com",
      "job": "team/release/deploy-test",
      "user": "jenkins-user",
      "apiToken": "jenkins-api-token",
      "crumb": true,
      "parameters": {
        "BRANCH": "${currentBranch}",
        "COMMIT": "${headCommit}",
        "ENV": "${deployEnv}"
      }
    }
  },
  "profiles": [
    {
      "id": "merge-main",
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
      "sourceBranch": "",
      "targetBranch": "release",
      "strategy": "no-ff",
      "pushAfterMerge": false
    }
  ]
}
```

### 字段说明

- `demandBranch`：需求分支创建配置（可选）
- 需求分支基于最新 `releasePrefix_YYYYMMDD` 分支创建（优先远端分支）；若未找到会提示选择当前仓库的分支作为基准
  - `prefixes`：需求分支前缀列表（默认 `["feature", "fix"]`）
  - `releasePrefix`：用于匹配基准分支的前缀（默认 `release`）
  - `deepseekApiKey`：DeepSeek API Key（可放在配置文件中）
  - `deepseekBaseUrl`：DeepSeek API 地址（默认 `https://api.deepseek.com/v1`）
  - `deepseekModel`：DeepSeek 模型名（默认 `deepseek-chat`）
- `profiles`：合并配置列表（必须）
  - `id`：配置唯一标识（按钮点击时使用，同时作为按钮文案显示）
  - `sourceBranch`：源分支，留空默认当前分支
  - `targetBranch`：目标分支（必填）
  - `strategy`：`default` / `no-ff` / `ff-only`
  - `pushAfterMerge`：是否推送远端（默认 `true`）
  - `pushRemote`：远端名（默认 `origin`，没有则取第一个远端）
  - `jenkins`：Jenkins 触发配置（可选）
- `deployToTest`：发布到测试环境按钮配置（可选，先合并再触发 Jenkins）
  - `targetBranch`：合并目标分支（默认 `pre-test`）
  - `jenkins`：Jenkins 触发配置

### Jenkins 配置

- `url`：Jenkins 根地址（不要包含 `/job/...`）
- `job`：Job 路径，使用 `folder/jobName` 形式
- 认证方式（两选一）
  - `user` + `apiToken`（推荐）
  - `token`（Job 里开启 “Trigger builds remotely”）
- `crumb`：Jenkins 开启 CSRF 时设为 `true`
- `parameters`：触发参数，支持变量：
  - `${sourceBranch}` `${targetBranch}` `${currentBranch}` `${mergeCommit}` `${strategy}` `${pushRemote}`
- 发布到测试环境的参数也支持：
  - `${currentBranch}` `${headCommit}` `${deployEnv}`（默认 `test`）

## 故障排查

- Jenkins Crumb 403：请确认 `user` + `apiToken` 正确，或将 `crumb` 设为 `false`
- 推送失败：检查 `pushRemote` 是否存在，以及仓库权限

## 需求分支创建设置

优先使用配置文件中的 `demandBranch`，也支持在设置中配置以下参数作为兜底：

- `quick-merge.deepseekApiKey`：DeepSeek API Key
- `quick-merge.deepseekBaseUrl`：接口地址，默认 `https://api.deepseek.com/v1`
- `quick-merge.deepseekModel`：模型名，默认 `deepseek-chat`
