# Quick Merge Jenkins

一个“配置驱动”的 VSCode 小工具：用于测试环境发布与需求分支相关流程，可选读取项目根目录的 `.quick-merge.jsonc` 作为配置来源。

## 功能

- 发布到测试环境：合并当前分支到目标分支，并触发 Jenkins
- 冲突处理：列出冲突文件、打开合并编辑器、回到原分支
- 结果展示：合并摘要（commit、变更文件、耗时）、推送与 Jenkins 触发结果
- 需求分支创建：选择 feature/fix + 中文描述，自动翻译成英文并创建分支
- 提交代码：复用需求描述作为提交信息
- 合并提交：将最近一组相同前缀的提交合并为一条

## 使用方式

1. 打开项目文件夹，侧边栏点击 **Quick Merge Jenkins** 图标
2. 如需生成配置，点击“创建基础配置”
3. 点击“发布到测试环境”或“创建需求分支”（以及其他按钮）
4. 如需调整设置，可打开配置文件并更新

> 注意：配置会在执行发布/需求相关动作时动态读取，暂不支持自动监听配置文件变化。
> 也可在命令面板执行 `Quick Merge Jenkins: Open Config File`。

## 配置文件格式

项目根目录：`.quick-merge.jsonc`（支持注释，兼容旧版 `.quick-merge.json`）

示例：

```jsonc
{
  // 需求分支创建设置（基于最新 release_YYYYMMDD 分支创建）
  "demandBranch": {
    "types": [
      { "prefix": "feature", "commitPrefix": "feat" },
      { "prefix": "fix", "commitPrefix": "fix" }
    ],
    "releasePrefix": "release",
    "deepseekApiKey": "",
    "deepseekBaseUrl": "https://api.deepseek.com/v1",
    "deepseekModel": "deepseek-chat"
  },
  // 发布到测试环境配置
  "deployToTest": {
    "targetBranch": "pre-test",
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
  }
}
```

### 字段说明

- `demandBranch`：需求分支创建配置（可选）
- 需求分支基于最新 `releasePrefix_YYYYMMDD` 分支创建（优先远端分支）；若未找到会提示选择当前仓库的分支作为基准
  - `types`：需求类型列表（可选，默认 feature/fix）
    - `prefix`：需求分支前缀
    - `commitPrefix`：提交信息前缀（默认等同于 `prefix`）
  - `releasePrefix`：用于匹配基准分支的前缀（默认 `release`）
  - `deepseekApiKey`：DeepSeek API Key（可放在配置文件中）
  - `deepseekBaseUrl`：DeepSeek API 地址（默认 `https://api.deepseek.com/v1`）
  - `deepseekModel`：DeepSeek 模型名（默认 `deepseek-chat`）
- `deployToTest`：发布到测试环境配置（可选）
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
  - `${currentBranch}` `${sourceBranch}` `${targetBranch}` `${mergeCommit}` `${headCommit}` `${deployEnv}`

## 故障排查

- Jenkins Crumb 403：请确认 `user` + `apiToken` 正确，或将 `crumb` 设为 `false`
- 推送失败：检查仓库权限与远端设置

## 需求分支创建设置

优先使用配置文件中的 `demandBranch`，也支持在设置中配置以下参数作为兜底：

- `quick-merge.deepseekApiKey`：DeepSeek API Key
- `quick-merge.deepseekBaseUrl`：接口地址，默认 `https://api.deepseek.com/v1`
- `quick-merge.deepseekModel`：模型名，默认 `deepseek-chat`
