# Quick Merge Jenkins

一个"配置驱动"的 VSCode 小工具：用于测试环境发布与需求分支相关流程，可选读取项目根目录的 `.quick-merge.jsonc` 作为配置来源。

## 推荐使用流程

整个工具围绕日常开发流程设计，下面按典型工作流程介绍各按钮功能：

### Step 1: 初始化配置

首次使用时，点击侧边栏 **Quick Merge Jenkins** 图标，如果项目未配置过：

- **创建基础配置**：在项目根目录生成 `.quick-merge.jsonc` 配置文件模板，可根据实际需求修改 Jenkins 地址、分支配置等

### Step 2: 开始新需求

拿到新需求后，使用以下按钮创建需求分支：

- **创建需求分支**：选择类型（feature/fix），输入中文需求描述，自动翻译成英文并基于最新 release 分支创建新分支
  - 自动翻译基于 DeepSeek API，需在配置中填入 `deepseekApiKey`
  - 例：输入 "用户登录优化" → 创建分支 `feature_user_login_optimization_20260116`

### Step 3: 开发与提交

在开发过程中，使用以下按钮进行代码提交：

- **提交代码**：复用创建分支时的需求描述作为提交信息，快速完成规范的 commit

### Step 4: 部署测试

开发完成后，将代码部署到测试环境：

- **发布到测试环境**：自动合并当前分支到目标测试分支（可配置，默认 `pre-test`），并触发 Jenkins 构建
  - 展示合并结果（commit、变更文件、耗时）
  - 展示 Jenkins 触发结果

#### 冲突处理

如合并时遇到冲突：

- 工具会列出所有冲突文件
- 点击冲突文件可打开 VS Code 内置合并编辑器
- 解决完成后继续推送，或点击返回原分支

### Step 5: 整理提交记录

测试通过后，发布前可选择整理 commit 记录：

- **合并提交**：默认选中当前分支上最近一组相同前缀的 commit，可手动调整选择范围，确认后合并为一条，保持提交历史整洁

### Step 6: 发布到生产

准备上线时，使用以下按钮：

- **发布到生产环境**：基于最新的发布分支（前缀可配置，如 `release`、`hotfix`）创建当天发布分支，支持多选发布分支和需求分支进行合并

或者一步完成整理和发布：

- **合并提交并发布到生产环境**：先执行合并提交，再创建发布分支并合并当前分支

---

## 补充说明

> 可在命令面板执行 `Quick Merge Jenkins: Open Config File` 快速打开配置文件。

---

## 配置文件格式

项目根目录：`.quick-merge.jsonc`（支持注释）

示例：

```jsonc
{
  // Demand branch settings (created from latest release_YYYYMMDD branch)
  "demandBranch": {
    // Demand type list
    "types": [
      // prefix: branch prefix, commitPrefix: commit message prefix
      { "prefix": "feature", "commitPrefix": "feat" },
      { "prefix": "fix", "commitPrefix": "fix" }
    ],
    // Base branch prefix for matching (default: release)
    "releasePrefix": "release",
    // DeepSeek API key for auto-translation
    "deepseekApiKey": "",
    // DeepSeek API base URL
    "deepseekBaseUrl": "https://api.deepseek.com/v1",
    // DeepSeek model name
    "deepseekModel": "deepseek-chat"
  },
  // Deploy to test environment config
  "deployToTest": {
    // Target branch for merge (default: pre-test)
    "targetBranch": "pre-test",
    // Jenkins trigger config
    "jenkins": {
      // Jenkins base URL (without /job/...)
      "url": "https://jenkins.example.com",
      // Job path in folder/jobName format
      "job": "team/release/deploy-test",
      // Jenkins username
      "user": "jenkins-user",
      // Jenkins API token
      "apiToken": "jenkins-api-token",
      // Enable CSRF crumb (set true if Jenkins has CSRF enabled)
      "crumb": true,
      // Build parameters (supports variables)
      "parameters": {
        "BRANCH": "${currentBranch}",
        "COMMIT": "${headCommit}",
        "ENV": "${deployEnv}"
      }
    }
  },
  // Deploy to production config (create today's branch from latest prefix branch)
  "deployToProd": {
    // Branch prefix list for production releases
    "prodPrefix": ["release", "hotfix"]
  }
}
```

### 字段说明

- `demandBranch`：需求分支创建配置（可选）
- 需求分支基于最新 `releasePrefix_YYYYMMDD` 分支创建（优先远端分支）；若未找到会提示选择当前仓库的分支作为基准
  - `types`：需求类型列表（可选，默认 feature/fix）
    - `prefix`：需求分支前缀
    - `commitPrefix`：提交信息前缀（默认等同于 `prefix`）
  - `releasePrefix`：用于匹配基准分支的前缀（默认 `release`，同时用于生产分支创建）
  - `deepseekApiKey`：DeepSeek API Key（可放在配置文件中）
  - `deepseekBaseUrl`：DeepSeek API 地址（默认 `https://api.deepseek.com/v1`）
  - `deepseekModel`：DeepSeek 模型名（默认 `deepseek-chat`）
- `deployToTest`：发布到测试环境配置（可选）
  - `targetBranch`：合并目标分支（默认 `pre-test`）
  - `jenkins`：Jenkins 触发配置
- `deployToProd`：发布到生产环境配置（可选）
  - `prodPrefix`：发布分支前缀数组（例如 `release`、`hotfix`），点击发布时会列出各前缀最新分支供多选

### Jenkins 配置

- `url`：Jenkins 根地址（不要包含 `/job/...`）
- `job`：Job 路径，使用 `folder/jobName` 形式
- 认证方式（两选一）
  - `user` + `apiToken`（推荐）
  - `token`（Job 里开启 "Trigger builds remotely"）
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
