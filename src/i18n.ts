type Locale = "zh" | "en";

const MESSAGES = {
  confirm: { zh: "确认", en: "Confirm" },
  cancel: { zh: "取消", en: "Cancel" },
  deployTestConfirm: {
    zh: "确认发布到测试环境？",
    en: "Confirm deploy to test?",
  },
  deployProdEnvConfirm: {
    zh: "确认发布到生产环境？",
    en: "Confirm deploy to production?",
  },
  deployProdEnvBranchConfirm: {
    zh: "确认部署生产分支：{branch}？",
    en: "Confirm deploy production branch: {branch}?",
  },
  deployProdEnvDateConfirm: {
    zh: "检测到最新生产分支 {branch}，日期为 {date}（今天：{today}）。是否继续部署？",
    en: "Latest prod branch {branch} is dated {date} (today: {today}). Continue deploy?",
  },
  deployTestConfirmWithLabel: {
    zh: "确认发布到测试环境：{label}？",
    en: "Confirm deploy to test: {label}?",
  },
  branchNamePrompt: {
    zh: "确认或修改分支名",
    en: "Confirm or edit branch name",
  },
  branchNamePlaceholder: {
    zh: "例如：fix_change_api_20260115",
    en: "e.g. fix_change_api_20260115",
  },
  branchNameRequired: {
    zh: "分支名不能为空。",
    en: "Branch name is required.",
  },
  branchConfirm: {
    zh: "确认创建分支：{branchName}",
    en: "Confirm create branch: {branchName}",
  },
  baseBranchDetail: {
    zh: "基于分支：{baseBranch}",
    en: "Base branch: {baseBranch}",
  },
  commitConfirm: {
    zh: "确认提交代码？提交信息：{demandMessage}",
    en: "Confirm commit? Message: {demandMessage}",
  },
  commitFilesPlaceholder: {
    zh: "选择要提交的文件（默认全选）",
    en: "Select files to commit (all selected by default)",
  },
  commitMessagePrompt: {
    zh: "确认或修改提交信息",
    en: "Confirm or edit commit message",
  },
  commitMessagePlaceholder: {
    zh: "例如：用户信息1",
    en: "e.g. message1",
  },
  commitMessageRequired: {
    zh: "提交信息不能为空。",
    en: "Commit message is required.",
  },
  unknownError: { zh: "未知错误。", en: "Unknown error." },
  gitCommandFailed: { zh: "Git 命令执行失败。", en: "Git command failed." },
  openConfigLabel: { zh: "打开配置文件", en: "Open Config File" },
  configFileNotFound: {
    zh: "未找到配置文件 {configFile} 或 {legacyFile}。",
    en: "Config file not found: {configFile} or {legacyFile}.",
  },
  configMustBeObject: {
    zh: "配置内容必须是 JSON 对象。",
    en: "Config must be a JSON object.",
  },
  configParseFailed: {
    zh: "配置文件 {configLabel} 解析失败。",
    en: "Failed to parse config file {configLabel}.",
  },
  currentBranchMissing: {
    zh: "无法获取当前分支。",
    en: "Unable to get current branch.",
  },
  remoteMissing: {
    zh: "未找到可用的远端。",
    en: "No remote found.",
  },
  jenkinsMissingConfig: {
    zh: "Jenkins 配置缺少 url 或 job。",
    en: "Jenkins config missing url or job.",
  },
  jenkinsUrlMissing: {
    zh: "未配置 Jenkins 地址，已跳过打开页面。",
    en: "Jenkins URL is not configured; skipped opening page.",
  },
  jenkinsOpenFailed: {
    zh: "打开 Jenkins 页面失败：{error}",
    en: "Failed to open Jenkins page: {error}",
  },
  gitRepoNotFound: {
    zh: "未找到 Git 仓库。",
    en: "No Git repository found.",
  },
  configErrorMessage: {
    zh: "配置错误: {error}",
    en: "Config error: {error}",
  },
  jenkinsTriggerFailed: {
    zh: "Jenkins 触发失败 ({statusCode}) {body}",
    en: "Jenkins trigger failed ({statusCode}) {body}",
  },
  jenkinsCrumbFailed: {
    zh: "获取 Jenkins Crumb 失败 ({statusCode})",
    en: "Failed to fetch Jenkins crumb ({statusCode})",
  },
  jenkinsCrumbInvalid: {
    zh: "Jenkins Crumb 返回数据无效。",
    en: "Invalid Jenkins crumb response.",
  },
  jenkinsJobEmpty: {
    zh: "Jenkins job 不能为空。",
    en: "Jenkins job is required.",
  },
  deepseekRequestFailed: {
    zh: "DeepSeek 请求失败：{error}",
    en: "DeepSeek request failed: {error}",
  },
  deepseekEmpty: {
    zh: "DeepSeek 返回内容为空。",
    en: "DeepSeek returned empty content.",
  },
  openConflictWorkspaceMissing: {
    zh: "未找到工作区，无法打开冲突文件列表。",
    en: "No workspace found; cannot open conflict files.",
  },
  noConflictFiles: {
    zh: "当前没有检测到冲突文件。",
    en: "No conflict files detected.",
  },
  pickConflictFile: {
    zh: "选择要打开的冲突文件",
    en: "Select a conflict file to open",
  },
  openMergeEditorWorkspaceMissing: {
    zh: "未找到工作区，无法打开合并编辑器。",
    en: "No workspace found; cannot open merge editor.",
  },
  pickMergeEditorFile: {
    zh: "选择要在合并编辑器中打开的文件",
    en: "Select a file to open in merge editor",
  },
  openConfigWorkspaceMissing: {
    zh: "未找到工作区，无法打开配置文件。",
    en: "No workspace found; cannot open config file.",
  },
  noGitRepoCreateConfig: {
    zh: "未找到 Git 仓库，无法创建配置文件。",
    en: "No Git repository found; cannot create config.",
  },
  repoNotFound: {
    zh: "未找到对应的 Git 仓库。",
    en: "Target Git repository not found.",
  },
  readTemplateFailed: {
    zh: "读取默认配置模板失败：{error}",
    en: "Failed to read default config template: {error}",
  },
  noOriginalBranch: {
    zh: "没有需要返回的原分支。",
    en: "No original branch to return to.",
  },
  checkoutOriginalSuccess: {
    zh: "已返回原分支。",
    en: "Returned to original branch.",
  },
  checkoutOriginalFailed: {
    zh: "返回原分支失败：{error}",
    en: "Failed to return to original branch: {error}",
  },
  workspaceMissingForMerge: {
    zh: "未找到工作区，请先打开一个包含 Git 仓库的文件夹。",
    en: "No workspace found; open a folder with a Git repository.",
  },
  mergeSuccess: {
    zh: "合并成功：{target}",
    en: "Merge succeeded: {target}",
  },
  mergeCompletedWithFailures: {
    zh: "合并完成但存在失败项：{target}",
    en: "Merge completed with failures: {target}",
  },
  mergeFailed: { zh: "合并失败：{error}", en: "Merge failed: {error}" },
  mergeToTestLabel: { zh: "合并到测试", en: "Merge to Test" },
  mergeTestStarted: {
    zh: "正在合并到测试分支...",
    en: "Merging into test branch...",
  },
  deployTestStarted: {
    zh: "正在发布到测试环境...",
    en: "Deploying to test...",
  },
  deployProdStarted: {
    zh: "正在创建生产分支并合并...",
    en: "Creating production branch and merging...",
  },
  deployProdEnvStarted: {
    zh: "正在发布到生产环境...",
    en: "Deploying to production...",
  },
  deployTestSuccess: {
    zh: "已触发测试环境发布：{job}",
    en: "Triggered test deploy: {job}",
  },
  deployProdSuccess: {
    zh: "已创建生产分支并完成合并：{branch}",
    en: "Created production branch and merged: {branch}",
  },
  deployProdEnvSuccess: {
    zh: "已触发生产环境发布：{job}（{branch}）",
    en: "Triggered production deploy: {job} ({branch})",
  },
  deployTestFailed: {
    zh: "发布到测试环境失败：{error}",
    en: "Test deploy failed: {error}",
  },
  deployProdFailed: {
    zh: "创建生产分支并合并失败：{error}",
    en: "Create production branch and merge failed: {error}",
  },
  deployProdEnvFailed: {
    zh: "发布到生产环境失败：{error}",
    en: "Production deploy failed: {error}",
  },
  deployProdPrefixEmpty: {
    zh: "生产分支前缀为空，请在配置文件 deployToProd.prodPrefix 中设置。",
    en: "Production branch prefixes are empty; set deployToProd.prodPrefix in config.",
  },
  deployProdBaseBranchMissing: {
    zh: "未找到 {prefix}_YYYYMMDD 分支。",
    en: "No {prefix}_YYYYMMDD branch found.",
  },
  deployProdPickBranchesPlaceholder: {
    zh: "选择作为生产基准的发布分支",
    en: "Select base release branches for production",
  },
  deployProdPickFeatBranchesPlaceholder: {
    zh: "选择需要合并到生产分支的 feat 分支（默认当前分支）",
    en: "Select feat branches to merge into production (current branch selected)",
  },
  deployProdFeatBranchEmpty: {
    zh: "未找到可合并的 feat 分支。",
    en: "No feat branches available to merge.",
  },
  deployTestMissingConfig: {
    zh: "测试环境发布配置缺少 Jenkins 信息。",
    en: "Test deploy config missing Jenkins info.",
  },
  deployProdMissingConfig: {
    zh: "生产环境发布配置缺少 Jenkins 信息。",
    en: "Production deploy config missing Jenkins info.",
  },
  deployProdJobMissing: {
    zh: "生产部署缺少 Jenkins Job，请在 deployToProd.prodPrefix 中配置（前缀：{prefix}）。",
    en: "Missing Jenkins job for prod deploy; configure deployToProd.prodPrefix (prefix: {prefix}).",
  },
  workspaceNotFound: { zh: "未找到工作区。", en: "Workspace not found." },
  workspaceOpenProject: {
    zh: "未找到工作区，请先打开项目。",
    en: "No workspace found; open a project.",
  },
  demandPrefixEmpty: {
    zh: "需求类型配置为空，请在配置文件中设置。",
    en: "Demand types are empty; configure them in the config file.",
  },
  demandTypeFeature: { zh: "新增功能", en: "New feature" },
  demandTypeFix: { zh: "修复问题", en: "Bug fix" },
  demandTypePlaceholder: { zh: "选择需求类型", en: "Select demand type" },
  demandDescPrompt: {
    zh: "请输入需求描述（中文）",
    en: "Enter demand description",
  },
  demandDescPlaceholder: {
    zh: "例如：修改接口返回字段",
    en: "e.g. update API response fields",
  },
  demandDescRequired: {
    zh: "需求描述不能为空。",
    en: "Description is required.",
  },
  deepseekKeyMissing: {
    zh: "请先在配置文件或设置中配置 DeepSeek API Key。",
    en: "Set the DeepSeek API key in config or settings first.",
  },
  noBranchFound: { zh: "未找到可用分支。", en: "No branches available." },
  pickBaseBranchPlaceholder: {
    zh: "未找到 {prefix}_YYYYMMDD 分支，请选择一个分支作为基准",
    en: "No {prefix}_YYYYMMDD branch found; select a base branch",
  },
  generatingBranchName: {
    zh: "正在生成需求分支名...",
    en: "Generating branch name...",
  },
  translationEmpty: {
    zh: "翻译结果为空，请换个描述再试。",
    en: "Translation is empty; try another description.",
  },
  branchExists: {
    zh: "分支已存在：{branchName}",
    en: "Branch already exists: {branchName}",
  },
  demandBranchCreated: {
    zh: "已从 {baseBranch} 创建需求分支：{branchName}",
    en: "Created demand branch from {baseBranch}: {branchName}",
  },
  demandMessageMissing: {
    zh: "未找到需求描述，请先创建需求分支。",
    en: "No demand description found; create a demand branch first.",
  },
  pullSkippedNoUpstream: {
    zh: "当前分支未设置上游，已跳过拉取：{branch}",
    en: "No upstream set; skipped pull for {branch}.",
  },
  pullFailed: {
    zh: "拉取失败：{error}",
    en: "Pull failed: {error}",
  },
  commitNoChanges: {
    zh: "没有可提交的变更。",
    en: "No changes to commit.",
  },
  emptyCommitCreated: {
    zh: "已创建空提交：{message}",
    en: "Empty commit created: {message}",
  },
  commitSuccess: { zh: "已提交：{message}", en: "Committed: {message}" },
  createConfigLabel: { zh: "创建基础配置", en: "Create Base Config" },
  mergeResultTitle: { zh: "合并结果", en: "Merge Result" },
  conflictTitle: { zh: "⚠️ 发现冲突", en: "⚠️ Conflicts detected" },
  openConflictFiles: { zh: "查看冲突文件", en: "Open Conflict Files" },
  openMergeEditor: { zh: "打开合并编辑器", en: "Open Merge Editor" },
  checkoutOriginal: {
    zh: "放弃合并 (回到原分支)",
    en: "Abort Merge (Back to Original Branch)",
  },
  stayOnTarget: {
    zh: "保留当前状态 (解决冲突)",
    en: "Stay on Target (Resolve Conflicts)",
  },
  deployTestLabel: { zh: "发布到测试环境", en: "Deploy to Test" },
  deployProdLabel: { zh: "合并到生产", en: "Merge into Prod" },
  deployProdEnvLabel: { zh: "部署到生产环境", en: "Deploy to Prod" },
  demandCreate: { zh: "创建需求分支", en: "Create Demand Branch" },
  demandCommit: { zh: "提交代码", en: "Commit Changes" },
  commitAndDeploy: {
    zh: "提交合并并发布测试",
    en: "Commit, Merge & Deploy to Test",
  },
  refreshHint: {
    zh: "正在读取配置...",
    en: "Loading config...",
  },
  gitProjectLabel: { zh: "Git 项目", en: "Git project" },
  missingConfigHint: {
    zh: "缺少配置文件的仓库: {labels}（可点击“创建基础配置”）",
    en: "Missing config in: {labels} (use Create Base Config)",
  },
  openConfigHint: {
    zh: "双击打开配置",
    en: "Double-click to open config",
  },
  mergeSuccessTitle: { zh: "✅ 合并成功", en: "✅ Merge succeeded" },
  mergeCommitSuffix: { zh: " (合并提交)", en: " (Merge Commit)" },
  targetBranchLabel: {
    zh: "目标分支: {branch}",
    en: "Target branch: {branch}",
  },
  headCommitLabel: {
    zh: "HEAD 提交: {commit}",
    en: "Head Commit: {commit}",
  },
  durationLabel: {
    zh: "耗时: {duration} ms",
    en: "Duration: {duration} ms",
  },
  checkoutBackFailed: {
    zh: "⚠️ 回到原分支失败: {error}",
    en: "⚠️ Failed to checkout back: {error}",
  },
  checkoutBackOk: {
    zh: "↩️ 已切回原分支: {branch}",
    en: "↩️ Checked out back to: {branch}",
  },
  pushOk: {
    zh: "🚀 已推送到远端: {remote}",
    en: "🚀 Pushed to remote: {remote}",
  },
  pushFailed: { zh: "推送失败: {error}", en: "Push failed: {error}" },
  jenkinsOk: {
    zh: "🔔 Jenkins 已触发: {job}",
    en: "🔔 Jenkins triggered: {job}",
  },
  jenkinsFailed: {
    zh: "Jenkins 触发失败: {error}",
    en: "Jenkins trigger failed: {error}",
  },
  changedFilesLabel: { zh: "变更文件:", en: "Changed files:" },
  statusSuccess: { zh: "成功", en: "Success" },
  statusFailed: { zh: "失败", en: "Failed" },
  statusSkipped: { zh: "跳过", en: "Skipped" },
  statusSummary: {
    zh: "合并: {merge} | 推送: {push} | Jenkins: {jenkins} | 切回: {checkout}",
    en: "Merge: {merge} | Push: {push} | Jenkins: {jenkins} | Checkout: {checkout}",
  },
  mergeFailedSummary: {
    zh: "合并: 失败 | 推送: 未执行 | Jenkins: 未执行 | 切回: 未执行",
    en: "Merge: Failed | Push: Not run | Jenkins: Not run | Checkout: Not run",
  },
  remoteBranchDiverged: {
    zh: "分支 {branch} 与远端 {remote} 已分叉，请先同步。",
    en: "Branch {branch} has diverged from remote {remote}. Please sync first.",
  },
  mergeErrorLabel: { zh: "错误: {error}", en: "Error: {error}" },
  conflictFilesLabel: { zh: "冲突文件:", en: "Conflict files:" },
  stayOnTargetStatus: {
    zh: "已留在目标分支处理冲突。",
    en: "Staying on target branch to resolve conflicts.",
  },
  genericError: { zh: "发生错误。", en: "An error occurred." },
  listSeparator: { zh: "、", en: ", " },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function getLocale(): Locale {
  const lang = getVscodeLanguage();
  return lang.startsWith("zh") ? "zh" : "en";
}

export function t(key: MessageKey, params?: Record<string, string>): string {
  const locale = getLocale();
  const template = MESSAGES[key]?.[locale] ?? MESSAGES[key]?.en ?? "";
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

export interface WebviewStrings {
  createConfigLabel: string;
  mergeResultTitle: string;
  conflictTitle: string;
  openConflictFiles: string;
  openMergeEditor: string;
  checkoutOriginal: string;
  stayOnTarget: string;
  demandCreate: string;
  demandCommit: string;
  commitAndDeploy: string;
  refreshHint: string;
  gitProjectLabel: string;
  missingConfigHint: string;
  openConfigHint: string;
  mergeSuccessTitle: string;
  mergeCommitSuffix: string;
  targetBranchLabel: string;
  headCommitLabel: string;
  durationLabel: string;
  checkoutBackFailed: string;
  checkoutBackOk: string;
  pushOk: string;
  pushFailed: string;
  jenkinsOk: string;
  jenkinsFailed: string;
  changedFilesLabel: string;
  statusSuccess: string;
  statusFailed: string;
  statusSkipped: string;
  statusSummary: string;
  mergeFailedSummary: string;
  mergeErrorLabel: string;
  conflictFilesLabel: string;
  stayOnTargetStatus: string;
  mergeToTestLabel: string;
  mergeTestInProgress: string;
  deployTestLabel: string;
  deployTestInProgress: string;
  deployTestMissingConfig: string;
  deployProdLabel: string;
  deployProdInProgress: string;
  deployProdEnvLabel: string;
  deployProdEnvInProgress: string;
  genericError: string;
  configErrorMessage: string;
  listSeparator: string;
}

export function getWebviewStrings(): WebviewStrings {
  return {
    createConfigLabel: t("createConfigLabel"),
    mergeResultTitle: t("mergeResultTitle"),
    conflictTitle: t("conflictTitle"),
    openConflictFiles: t("openConflictFiles"),
    openMergeEditor: t("openMergeEditor"),
    checkoutOriginal: t("checkoutOriginal"),
    stayOnTarget: t("stayOnTarget"),
    deployTestLabel: t("deployTestLabel"),
    deployProdLabel: t("deployProdLabel"),
    deployProdEnvLabel: t("deployProdEnvLabel"),
    demandCreate: t("demandCreate"),
    demandCommit: t("demandCommit"),
    commitAndDeploy: t("commitAndDeploy"),
    refreshHint: t("refreshHint"),
    gitProjectLabel: t("gitProjectLabel"),
    missingConfigHint: t("missingConfigHint"),
    openConfigHint: t("openConfigHint"),
    mergeSuccessTitle: t("mergeSuccessTitle"),
    mergeCommitSuffix: t("mergeCommitSuffix"),
    targetBranchLabel: t("targetBranchLabel"),
    headCommitLabel: t("headCommitLabel"),
    durationLabel: t("durationLabel"),
    checkoutBackFailed: t("checkoutBackFailed"),
    checkoutBackOk: t("checkoutBackOk"),
    pushOk: t("pushOk"),
    pushFailed: t("pushFailed"),
    jenkinsOk: t("jenkinsOk"),
    jenkinsFailed: t("jenkinsFailed"),
    changedFilesLabel: t("changedFilesLabel"),
    statusSuccess: t("statusSuccess"),
    statusFailed: t("statusFailed"),
    statusSkipped: t("statusSkipped"),
    statusSummary: t("statusSummary"),
    mergeFailedSummary: t("mergeFailedSummary"),
    mergeErrorLabel: t("mergeErrorLabel"),
    conflictFilesLabel: t("conflictFilesLabel"),
    stayOnTargetStatus: t("stayOnTargetStatus"),
    mergeToTestLabel: t("mergeToTestLabel"),
    mergeTestInProgress: t("mergeTestStarted"),
    deployTestInProgress: t("deployTestStarted"),
    deployTestMissingConfig: t("deployTestMissingConfig"),
    deployProdInProgress: t("deployProdStarted"),
    deployProdEnvInProgress: t("deployProdEnvStarted"),
    genericError: t("genericError"),
    configErrorMessage: t("configErrorMessage"),
    listSeparator: t("listSeparator"),
  };
}

function getVscodeLanguage(): string {
  try {
    const vscode = require("vscode") as typeof import("vscode");
    const lang =
      typeof vscode?.env?.language === "string" ? vscode.env.language : "";
    return lang.toLowerCase();
  } catch {
    return "en";
  }
}
