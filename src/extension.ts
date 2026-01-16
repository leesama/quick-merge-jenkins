import * as vscode from "vscode";
import * as path from "node:path";
import {
  getConfigPathInfo,
  getDefaultConfigTemplate,
  readMergeConfig,
} from "./config";
import { getConfigGroups } from "./config-groups";
import {
  getCurrentBranch,
  getHeadCommit,
  listBranches,
  listRemoteBranches,
  listRemotes,
  runGit,
} from "./git";
import { getLocale, t } from "./i18n";
import { triggerJenkinsBuild } from "./jenkins";
import { performMerge } from "./merge";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "./repo";
import { state } from "./state";
import { MergeConfigFile, ResolvedMergePlan } from "./types";
import { getErrorMessage } from "./utils";
import { getWebviewHtml } from "./webview";
import { translateToEnglish } from "./deepseek";

const DEMAND_MESSAGE_STORAGE_KEY = "quick-merge-jenkins.demandMessages";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new QuickMergeViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      QuickMergeViewProvider.viewType,
      provider
    ),
    vscode.commands.registerCommand(
      "quick-merge-jenkins.openConflictFiles",
      () => provider.openConflictFiles()
    ),
    vscode.commands.registerCommand("quick-merge-jenkins.openMergeEditor", () =>
      provider.openMergeEditor()
    ),
    vscode.commands.registerCommand("quick-merge-jenkins.openConfig", () =>
      provider.openConfig()
    )
  );
  setupDevAutoReload(context);
}

export function deactivate(): void {}

class QuickMergeViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "quickMergeView";
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getWebviewHtml(view.webview);
    view.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "requestState") {
        const loadConfig = Boolean(message?.loadConfig);
        await this.postState({ loadConfig });
        return;
      }
      if (message?.type === "deployTest") {
        await this.handleDeployTest(message);
        return;
      }
      if (message?.type === "confirmDeployTest") {
        await this.confirmDeployTest(message);
        return;
      }
      if (message?.type === "commitDemand") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.commitDemandCode(repoRoot);
        return;
      }
      if (message?.type === "checkoutOriginal") {
        await this.checkoutOriginal();
        return;
      }
      if (message?.type === "openConflictFiles") {
        await this.openConflictFiles();
        return;
      }
      if (message?.type === "openMergeEditor") {
        await this.openMergeEditor();
        return;
      }
      if (message?.type === "openConfig") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.openConfig(repoRoot);
        return;
      }
      if (message?.type === "confirmCommitAndDeploy") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.confirmCommitAndDeploy(repoRoot);
        return;
      }
      if (message?.type === "rebaseSquash") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.handleRebaseSquash(repoRoot);
        return;
      }
      if (message?.type === "createDemandBranch") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.createDemandBranch(repoRoot);
        return;
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.postState({ loadConfig: !state.lastConfigLoaded });
      }
    });
    void this.postState({ loadConfig: !state.lastConfigLoaded });
  }

  async openConflictFiles(): Promise<void> {
    const cwd = state.lastWorkspaceRoot ?? (await resolveRepoRoot());
    if (!cwd) {
      void vscode.window.showErrorMessage(t("openConflictWorkspaceMissing"));
      return;
    }
    if (state.lastConflictFiles.length === 0) {
      void vscode.window.showInformationMessage(t("noConflictFiles"));
      return;
    }
    const pick = await vscode.window.showQuickPick(state.lastConflictFiles, {
      placeHolder: t("pickConflictFile"),
    });
    if (!pick) {
      return;
    }
    const fileUri = vscode.Uri.file(path.join(cwd, pick));
    await vscode.window.showTextDocument(fileUri);
  }

  async openMergeEditor(): Promise<void> {
    const cwd = state.lastWorkspaceRoot ?? (await resolveRepoRoot());
    if (!cwd) {
      void vscode.window.showErrorMessage(t("openMergeEditorWorkspaceMissing"));
      return;
    }
    if (state.lastConflictFiles.length === 0) {
      void vscode.window.showInformationMessage(t("noConflictFiles"));
      return;
    }
    let target = state.lastConflictFiles[0];
    if (state.lastConflictFiles.length > 1) {
      const pick = await vscode.window.showQuickPick(state.lastConflictFiles, {
        placeHolder: t("pickMergeEditorFile"),
      });
      if (!pick) {
        return;
      }
      target = pick;
    }
    const fileUri = vscode.Uri.file(path.join(cwd, target));
    try {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        fileUri,
        "vscode.mergeEditor"
      );
      return;
    } catch {
      try {
        await vscode.commands.executeCommand("vscode.openMergeEditor", fileUri);
        return;
      } catch {
        await vscode.window.showTextDocument(fileUri);
      }
    }
  }

  async openConfig(repoRoot?: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage(t("openConfigWorkspaceMissing"));
      return;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      void vscode.window.showErrorMessage(t("noGitRepoCreateConfig"));
      return;
    }
    const requestedRepoRoot =
      repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
    if (repoRoot && !requestedRepoRoot) {
      void vscode.window.showErrorMessage(t("repoNotFound"));
      return;
    }
    const templatePath = path.join(
      this.context.extensionPath,
      "media",
      getLocale() === "zh" ? "default-config.jsonc" : "default-config.en.jsonc"
    );
    let template: string;
    try {
      template = await getDefaultConfigTemplate(templatePath);
    } catch (error) {
      void vscode.window.showErrorMessage(
        t("readTemplateFailed", { error: getErrorMessage(error) })
      );
      return;
    }
    const content = Buffer.from(template);
    const targetRoots = requestedRepoRoot ? [requestedRepoRoot] : repoRoots;
    await Promise.all(
      targetRoots.map(async (targetRoot) => {
        const configInfo = await getConfigPathInfo(targetRoot);
        const configUri = vscode.Uri.file(configInfo.path);
        if (!configInfo.exists) {
          await vscode.workspace.fs.writeFile(configUri, content);
        }
      })
    );
    const openRoot = requestedRepoRoot
      ? requestedRepoRoot
      : activeRepoRoot && repoRoots.includes(activeRepoRoot)
      ? activeRepoRoot
      : repoRoots[0];
    const openConfigInfo = await getConfigPathInfo(openRoot);
    const openUri = vscode.Uri.file(openConfigInfo.path);
    const doc = await vscode.workspace.openTextDocument(openUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await this.postState({ loadConfig: true });
  }

  private async checkoutOriginal(): Promise<void> {
    if (!state.lastFailureContext) {
      void vscode.window.showInformationMessage(t("noOriginalBranch"));
      return;
    }
    try {
      await runGit(
        ["checkout", state.lastFailureContext.originalBranch],
        state.lastFailureContext.cwd
      );
      state.lastFailureContext = null;
      state.lastConflictFiles = [];
      await this.postState({ loadConfig: false });
      this.postMessage({
        type: "info",
        message: t("checkoutOriginalSuccess"),
      });
    } catch (error) {
      this.postMessage({
        type: "error",
        message: t("checkoutOriginalFailed", { error: getErrorMessage(error) }),
      });
    }
  }

  private async confirmDeployTest(message: any): Promise<void> {
    const label =
      typeof message?.label === "string" ? message.label.trim() : "";
    const prompt = label
      ? t("deployTestConfirmWithLabel", { label })
      : t("deployTestConfirm");
    const choice = await vscode.window.showInformationMessage(
      prompt,
      { modal: true },
      t("confirm")
    );
    if (choice !== t("confirm")) {
      return;
    }
    await this.handleDeployTest(message);
  }

  private async handleDeployTest(message: any): Promise<void> {
    const requestedRoot =
      typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
    const cwd = requestedRoot ?? (await resolveRepoRoot());
    if (!cwd) {
      this.postMessage({
        type: "error",
        message: t("workspaceMissingForMerge"),
      });
      return;
    }
    state.lastWorkspaceRoot = cwd;
    this.postMessage({
      type: "deployTestStarted",
      message: t("deployTestStarted"),
    });
    try {
      const configFile = await readMergeConfig(cwd);
      const deployConfig = configFile.deployToTest;
      if (!deployConfig) {
        const errorMessage = t("deployTestMissingConfig");
        this.postMessage({
          type: "error",
          message: errorMessage,
        });
        void vscode.window.showErrorMessage(errorMessage);
        return;
      }
      const jenkins = deployConfig.jenkins;
      if (!jenkins || !jenkins.url || !jenkins.job) {
        const errorMessage = t("deployTestMissingConfig");
        this.postMessage({
          type: "error",
          message: errorMessage,
        });
        void vscode.window.showErrorMessage(errorMessage);
        return;
      }

      // 1. 获取当前分支和远端信息
      const [currentBranch, remotes] = await Promise.all([
        getCurrentBranch(cwd),
        listRemotes(cwd),
      ]);
      if (!currentBranch) {
        const errorMessage = t("currentBranchMissing");
        this.postMessage({ type: "error", message: errorMessage });
        void vscode.window.showErrorMessage(errorMessage);
        return;
      }

      // 2. 构建合并计划：当前分支 -> 目标分支（默认 pre-test）
      const targetBranch = (deployConfig.targetBranch ?? "pre-test").trim();
      const pushRemote = remotes.length > 0 ? remotes[0] : null;
      const plan: ResolvedMergePlan = {
        currentBranch,
        sourceBranch: currentBranch,
        targetBranch,
        strategyFlag: "",
        strategyLabel: "default",
        pushAfterMerge: Boolean(pushRemote),
        pushRemote,
        jenkins: undefined, // 合并时不触发 Jenkins，后面单独触发
      };

      // 3. 执行合并
      const result = await performMerge(cwd, plan);
      if (result.status === "failed") {
        state.lastFailureContext = {
          originalBranch: result.currentBranch,
          targetBranch: result.targetBranch,
          cwd,
        };
        state.lastConflictFiles = result.conflicts;
        this.postMessage({ type: "result", result });
        void vscode.window.showErrorMessage(
          t("mergeFailed", { error: result.errorMessage })
        );
        return;
      }

      // 4. 合并成功后触发 Jenkins
      const headCommit = result.headCommit;
      await triggerJenkinsBuild(jenkins, {
        currentBranch,
        sourceBranch: currentBranch,
        targetBranch,
        mergeCommit: headCommit,
        headCommit,
        deployEnv: "test",
      });

      const successMessage = t("deployTestSuccess", { job: jenkins.job });
      this.postMessage({
        type: "info",
        message: successMessage,
      });
      void vscode.window.showInformationMessage(successMessage);
    } catch (error) {
      const errorMessage = t("deployTestFailed", {
        error: getErrorMessage(error),
      });
      this.postMessage({
        type: "error",
        message: errorMessage,
      });
      void vscode.window.showErrorMessage(errorMessage);
    } finally {
      await this.postState({ loadConfig: false });
    }
  }

  private async postState(options?: {
    loadConfig?: boolean;
  }): Promise<void> {
    const activeRepoRoot = await resolveRepoRoot();
    const loadConfig = options?.loadConfig ?? false;
    if (!activeRepoRoot) {
      state.lastConfigRootsKey = "";
      state.lastConfigGroups = [];
      state.lastConfigError = "";
      state.lastConfigLoaded = false;
      this.postMessage({
        type: "state",
        currentBranch: "",
        configGroups: [],
        configError: t("workspaceNotFound"),
        configLoaded: false,
      });
      return;
    }
    state.lastWorkspaceRoot = activeRepoRoot;
    const repoRoots = await resolveRepoRoots(activeRepoRoot);
    const repoRootsKey = repoRoots.join("|");
    if (state.lastConfigRootsKey !== repoRootsKey) {
      state.lastConfigRootsKey = repoRootsKey;
      state.lastConfigGroups = [];
      state.lastConfigError = "";
      state.lastConfigLoaded = false;
    }
    try {
      const currentBranch = activeRepoRoot
        ? await getCurrentBranch(activeRepoRoot).catch(() => "")
        : "";
      if (loadConfig) {
        const { groups, error } = await getConfigGroups(repoRoots);
        state.lastConfigGroups = groups;
        state.lastConfigError = error;
        state.lastConfigLoaded = true;
      }
      this.postMessage({
        type: "state",
        currentBranch,
        configGroups: state.lastConfigGroups,
        configError: state.lastConfigError,
        configLoaded: state.lastConfigLoaded,
      });
    } catch (error) {
      this.postMessage({
        type: "error",
        message: getErrorMessage(error),
      });
    }
  }

  private postMessage(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  private async createDemandBranch(repoRoot?: string): Promise<void> {
    const notifyInfo = (message: string) => {
      this.postMessage({ type: "info", message });
      void vscode.window.showInformationMessage(message);
    };
    const notifyError = (message: string) => {
      this.postMessage({ type: "error", message });
      void vscode.window.showErrorMessage(message);
    };
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      notifyError(t("workspaceOpenProject"));
      return;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      notifyError(t("workspaceMissingForMerge"));
      return;
    }
    const requestedRepoRoot =
      repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
    if (repoRoot && !requestedRepoRoot) {
      notifyError(t("repoNotFound"));
      return;
    }
    const defaultRepoRoot =
      activeRepoRoot && repoRoots.includes(activeRepoRoot)
        ? activeRepoRoot
        : repoRoots[0];
    const cwd = requestedRepoRoot ?? defaultRepoRoot;
    let configFile: MergeConfigFile | null = null;
    try {
      configFile = await readMergeConfig(cwd);
    } catch {
      configFile = null;
    }
    const settings = resolveDemandBranchSettings(configFile);
    if (settings.demandTypes.length === 0) {
      notifyError(t("demandPrefixEmpty"));
      return;
    }
    type DemandTypePick = vscode.QuickPickItem & {
      value: string;
      commitPrefix: string;
    };
    const demandTypeItems: DemandTypePick[] = settings.demandTypes.map(
      (type) => ({
        label: type.prefix,
        description:
          type.prefix === "feature"
            ? t("demandTypeFeature")
            : type.prefix === "fix"
            ? t("demandTypeFix")
            : "",
        value: type.prefix,
        commitPrefix: type.commitPrefix,
      })
    );
    const typePick = await vscode.window.showQuickPick(
      demandTypeItems,
      { placeHolder: t("demandTypePlaceholder") }
    );
    if (!typePick) {
      return;
    }
    const input = await vscode.window.showInputBox({
      prompt: t("demandDescPrompt"),
      placeHolder: t("demandDescPlaceholder"),
      validateInput: (value) =>
        value.trim().length === 0 ? t("demandDescRequired") : undefined,
    });
    if (!input) {
      return;
    }
    if (!settings.apiKey) {
      notifyError(t("deepseekKeyMissing"));
      return;
    }
    let baseBranch: string | null = null;
    try {
      baseBranch = await getLatestReleaseBranch(cwd, settings.releasePrefix);
    } catch (error) {
      notifyError(getErrorMessage(error));
      return;
    }
    if (!baseBranch) {
      let branches: string[];
      try {
        const [remoteBranches, localBranches] = await Promise.all([
          listRemoteBranches(cwd).catch(() => []),
          listBranches(cwd),
        ]);
        const merged = [...remoteBranches, ...localBranches];
        const seen = new Set<string>();
        branches = merged.filter((branch) => {
          if (seen.has(branch)) {
            return false;
          }
          seen.add(branch);
          return true;
        });
      } catch (error) {
        notifyError(getErrorMessage(error));
        return;
      }
      if (branches.length === 0) {
        notifyError(t("noBranchFound"));
        return;
      }
      const pick = await vscode.window.showQuickPick(branches, {
        placeHolder: t("pickBaseBranchPlaceholder", {
          prefix: settings.releasePrefix,
        }),
      });
      if (!pick) {
        return;
      }
      baseBranch = pick;
    }
    const commitPrefix = typePick.commitPrefix || typePick.value;
    const demandMessage = formatDemandMessage(
      input.trim().replace(/\s+/g, " "),
      commitPrefix
    );
    let branchName = "";
    this.postMessage({
      type: "info",
      message: t("generatingBranchName"),
    });
    let translated: string;
    try {
      translated = await translateToEnglish(input, settings);
    } catch (error) {
      notifyError(getErrorMessage(error));
      return;
    }
    const slug = toBranchSlug(translated);
    if (!slug) {
      notifyError(t("translationEmpty"));
      return;
    }
    const dateStamp = formatDateStamp(new Date());
    branchName = `${typePick.value}_${slug}_${dateStamp}`;
    const edited = await vscode.window.showInputBox({
      prompt: t("branchNamePrompt"),
      value: branchName,
      placeHolder: t("branchNamePlaceholder"),
      validateInput: (value) =>
        value.trim().length === 0 ? t("branchNameRequired") : undefined,
    });
    if (!edited) {
      return;
    }
    branchName = edited.trim();
    const choice = await vscode.window.showInformationMessage(
      t("branchConfirm", { branchName }),
      { modal: true, detail: t("baseBranchDetail", { baseBranch }) },
      t("confirm")
    );
    if (choice !== t("confirm")) {
      return;
    }
    try {
      const branches = await listBranches(cwd);
      if (branches.includes(branchName)) {
        notifyError(t("branchExists", { branchName }));
        return;
      }
      await runGit(["checkout", "-b", branchName, baseBranch], cwd);
      await this.saveDemandMessage(cwd, demandMessage);
      await runGit(["commit", "--allow-empty", "-m", demandMessage], cwd);
      notifyInfo(t("emptyCommitCreated", { message: demandMessage }));
      notifyInfo(t("demandBranchCreated", { baseBranch, branchName }));
    } catch (error) {
      notifyError(getErrorMessage(error));
    }
  }

  private async commitDemandCode(repoRoot?: string): Promise<void> {
    const notifyInfo = (message: string) => {
      this.postMessage({ type: "info", message });
      void vscode.window.showInformationMessage(message);
    };
    const notifyError = (message: string) => {
      this.postMessage({ type: "error", message });
      void vscode.window.showErrorMessage(message);
    };
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      notifyError(t("workspaceOpenProject"));
      return;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      notifyError(t("workspaceMissingForMerge"));
      return;
    }
    const requestedRepoRoot =
      repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
    if (repoRoot && !requestedRepoRoot) {
      notifyError(t("repoNotFound"));
      return;
    }
    const defaultRepoRoot =
      activeRepoRoot && repoRoots.includes(activeRepoRoot)
        ? activeRepoRoot
        : repoRoots[0];
    const cwd = requestedRepoRoot ?? defaultRepoRoot;
    const storedDemandMessage = this.getDemandMessage(cwd);
    let lastCommitMessage = "";
    try {
      lastCommitMessage = await this.getLastCommitMessage(cwd);
    } catch {
      lastCommitMessage = "";
    }
    const baseMessage = pickBaseCommitMessage(
      lastCommitMessage,
      storedDemandMessage
    );
    if (!baseMessage || baseMessage.trim().length === 0) {
      notifyError(t("demandMessageMissing"));
      return;
    }
    const defaultMessage = this.buildNextCommitMessage(baseMessage);
    const inputMessage = await vscode.window.showInputBox({
      prompt: t("commitMessagePrompt"),
      value: defaultMessage,
      placeHolder: t("commitMessagePlaceholder"),
      validateInput: (value) =>
        value.trim().length === 0 ? t("commitMessageRequired") : undefined,
    });
    if (!inputMessage) {
      return;
    }
    const commitMessage = inputMessage.trim();
    const choice = await vscode.window.showInformationMessage(
      t("commitConfirm", { demandMessage: commitMessage }),
      { modal: true },
      t("confirm")
    );
    if (choice !== t("confirm")) {
      return;
    }
    try {
      await runGit(["add", "-A"], cwd);
      const status = await runGit(["status", "--porcelain"], cwd);
      if (!status.stdout.trim()) {
        notifyInfo(t("commitNoChanges"));
        return;
      }
      await runGit(["commit", "-m", commitMessage], cwd);
      notifyInfo(t("commitSuccess", { message: commitMessage }));
    } catch (error) {
      notifyError(getErrorMessage(error));
    }
  }

  private async confirmCommitAndDeploy(repoRoot?: string): Promise<void> {
    const notifyInfo = (message: string) => {
      this.postMessage({ type: "info", message });
      void vscode.window.showInformationMessage(message);
    };
    const notifyError = (message: string) => {
      this.postMessage({ type: "error", message });
      void vscode.window.showErrorMessage(message);
    };
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      notifyError(t("workspaceOpenProject"));
      return;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      notifyError(t("workspaceMissingForMerge"));
      return;
    }
    const requestedRepoRoot =
      repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
    if (repoRoot && !requestedRepoRoot) {
      notifyError(t("repoNotFound"));
      return;
    }
    const defaultRepoRoot =
      activeRepoRoot && repoRoots.includes(activeRepoRoot)
        ? activeRepoRoot
        : repoRoots[0];
    const cwd = requestedRepoRoot ?? defaultRepoRoot;

    // 1. 获取提交信息
    const storedDemandMessage = this.getDemandMessage(cwd);
    let lastCommitMessage = "";
    try {
      lastCommitMessage = await this.getLastCommitMessage(cwd);
    } catch {
      lastCommitMessage = "";
    }
    const baseMessage = pickBaseCommitMessage(
      lastCommitMessage,
      storedDemandMessage
    );
    if (!baseMessage || baseMessage.trim().length === 0) {
      notifyError(t("demandMessageMissing"));
      return;
    }
    const defaultMessage = this.buildNextCommitMessage(baseMessage);
    const inputMessage = await vscode.window.showInputBox({
      prompt: t("commitMessagePrompt"),
      value: defaultMessage,
      placeHolder: t("commitMessagePlaceholder"),
      validateInput: (value) =>
        value.trim().length === 0 ? t("commitMessageRequired") : undefined,
    });
    if (!inputMessage) {
      return;
    }
    const commitMessage = inputMessage.trim();

    // 2. 确认提交并发布
    const choice = await vscode.window.showInformationMessage(
      t("commitConfirm", { demandMessage: commitMessage }),
      { modal: true },
      t("confirm")
    );
    if (choice !== t("confirm")) {
      return;
    }

    // 3. 执行提交
    try {
      await runGit(["add", "-A"], cwd);
      const status = await runGit(["status", "--porcelain"], cwd);
      if (!status.stdout.trim()) {
        notifyInfo(t("commitNoChanges"));
        return;
      }
      await runGit(["commit", "-m", commitMessage], cwd);
      notifyInfo(t("commitSuccess", { message: commitMessage }));
    } catch (error) {
      notifyError(getErrorMessage(error));
      return;
    }

    // 4. 执行 Deploy to Test
    await this.handleDeployTest({ repoRoot: cwd });
  }

  private async handleRebaseSquash(repoRoot?: string): Promise<void> {
    const notifyInfo = (message: string) => {
      this.postMessage({ type: "info", message });
      void vscode.window.showInformationMessage(message);
    };
    const notifyError = (message: string) => {
      this.postMessage({ type: "error", message });
      void vscode.window.showErrorMessage(message);
    };
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      notifyError(t("workspaceOpenProject"));
      return;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      notifyError(t("workspaceMissingForMerge"));
      return;
    }
    const requestedRepoRoot =
      repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
    if (repoRoot && !requestedRepoRoot) {
      notifyError(t("repoNotFound"));
      return;
    }
    const defaultRepoRoot =
      activeRepoRoot && repoRoots.includes(activeRepoRoot)
        ? activeRepoRoot
        : repoRoots[0];
    const cwd = requestedRepoRoot ?? defaultRepoRoot;
    const currentBranch = await getCurrentBranch(cwd).catch(() => "");

    try {
      // 0. 拉取最新代码
      try {
        await runGit(["pull"], cwd);
      } catch (error) {
        const message = getErrorMessage(error);
        if (isNoUpstreamError(message)) {
          notifyInfo(
            t("pullSkippedNoUpstream", {
              branch: currentBranch || "-",
            })
          );
        } else {
          notifyError(t("pullFailed", { error: message }));
          return;
        }
      }

      // 1. 获取最近的 commit 历史（最多 50 条）
      const logResult = await runGit(
        ["log", "--oneline", "-n", "50", "--pretty=%H|%s"],
        cwd
      );
      const lines = logResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        notifyError(t("rebaseNoCommits"));
        return;
      }

      // 2. 解析 commit 并找到最近一组连续的符合格式的 commit
      const commits: { hash: string; message: string }[] = [];
      for (const line of lines) {
        const [hash, ...msgParts] = line.split("|");
        commits.push({ hash, message: msgParts.join("|") });
      }

      // 3. 识别最近一组连续的符合格式的 commit
      // 格式：基础信息 + 可选数字，如 "用户信息3"、"用户信息2"、"用户信息1"、"用户信息"
      const getBaseMessage = (msg: string): string => {
        const match = msg.match(/^(.*?)(\d*)$/);
        return match ? match[1] : msg;
      };

      let preSelectedIndices: number[] = [];
      for (let start = 0; start < commits.length; start += 1) {
        const base = getBaseMessage(commits[start].message);
        if (!base) {
          continue;
        }
        const indices: number[] = [];
        for (let i = start; i < commits.length; i += 1) {
          const nextBase = getBaseMessage(commits[i].message);
          if (nextBase === base) {
            indices.push(i);
          } else {
            break; // 遇到不同的基础信息就停止
          }
        }
        if (indices.length >= 2) {
          preSelectedIndices = indices;
          break;
        }
      }

      // 4. 显示多选列表
      const items: vscode.QuickPickItem[] = commits.map((c, i) => ({
        label: c.message,
        description: c.hash.substring(0, 7),
        picked: preSelectedIndices.includes(i),
      }));

      const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: t("rebaseSelectCommits"),
      });

      if (!selected || selected.length < 2) {
        return;
      }

      // 5. 找到选中的 commit 索引范围
      const selectedIndices = selected.map((s) =>
        items.findIndex((item) => item === s)
      );
      const maxIndex = Math.max(...selectedIndices);
      const count = maxIndex + 1;

      // 6. 使用选中范围中最后一条提交信息作为提交说明
      const baseMessage = commits[maxIndex]?.message || commits[0].message;

      // 7. 执行 git reset --soft 和 git commit
      const resetTarget = `HEAD~${count}`;
      await runGit(["reset", "--soft", resetTarget], cwd);
      await runGit(["commit", "-m", baseMessage], cwd);

      notifyInfo(
        t("rebaseSuccessWithMessage", {
          count: String(count),
          message: baseMessage,
        })
      );
    } catch (error) {
      notifyError(t("rebaseFailed", { error: getErrorMessage(error) }));
    }
  }

  private getDemandMessage(repoRoot: string): string {
    const stored =
      this.context.workspaceState.get<Record<string, string>>(
        DEMAND_MESSAGE_STORAGE_KEY
      ) ?? null;
    if (stored && typeof stored === "object") {
      state.lastDemandMessages = { ...stored };
    }
    return state.lastDemandMessages[repoRoot] ?? "";
  }

  private async saveDemandMessage(
    repoRoot: string,
    message: string
  ): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    const next = {
      ...state.lastDemandMessages,
      [repoRoot]: trimmed,
    };
    state.lastDemandMessages = next;
    await this.context.workspaceState.update(DEMAND_MESSAGE_STORAGE_KEY, next);
  }

  private async getLastCommitMessage(cwd: string): Promise<string> {
    const result = await runGit(["log", "-1", "--pretty=%B"], cwd);
    const lines = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines[0] ?? "";
  }

  private buildNextCommitMessage(lastMessage: string): string {
    const normalized = lastMessage.trim();
    if (!normalized) {
      return "";
    }
    const match = normalized.match(/^(.*?)(\d+)$/);
    if (match) {
      const base = match[1];
      const number = Number(match[2]);
      if (Number.isFinite(number)) {
        return `${base}${number + 1}`;
      }
    }
    return `${normalized}1`;
  }
}

function setupDevAutoReload(context: vscode.ExtensionContext): void {
  if (context.extensionMode !== vscode.ExtensionMode.Development) {
    return;
  }
  const readyAt = Date.now() + 1000;
  const pattern = new vscode.RelativePattern(
    context.extensionPath,
    "dist/extension.js"
  );
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  let reloadTimer: NodeJS.Timeout | null = null;
  const scheduleReload = () => {
    if (Date.now() < readyAt) {
      return;
    }
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => {
      void vscode.commands.executeCommand("workbench.action.reloadWindow");
    }, 300);
  };
  watcher.onDidChange(scheduleReload);
  watcher.onDidCreate(scheduleReload);
  context.subscriptions.push(
    watcher,
    new vscode.Disposable(() => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
    })
  );
}

function getDeepseekSettings(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  const config = vscode.workspace.getConfiguration("quick-merge-jenkins");
  const apiKey = (config.get<string>("deepseekApiKey") ?? "").trim();
  const baseUrl = (config.get<string>("deepseekBaseUrl") ?? "").trim();
  const model =
    (config.get<string>("deepseekModel") ?? "deepseek-chat").trim() ||
    "deepseek-chat";
  return { apiKey, baseUrl, model };
}

function resolveDemandBranchSettings(configFile: MergeConfigFile | null): {
  apiKey: string;
  baseUrl: string;
  model: string;
  demandTypes: { prefix: string; commitPrefix: string }[];
  releasePrefix: string;
} {
  const fallback = getDeepseekSettings();
  const demandConfig = configFile?.demandBranch;
  const apiKey = (demandConfig?.deepseekApiKey ?? "").trim() || fallback.apiKey;
  const baseUrl =
    (demandConfig?.deepseekBaseUrl ?? "").trim() || fallback.baseUrl;
  const model = (demandConfig?.deepseekModel ?? "").trim() || fallback.model;
  const customTypes = normalizeDemandTypes(demandConfig?.types);
  const legacyPrefixes = normalizePrefixes(demandConfig?.prefixes ?? []);
  const legacyCommitPrefixes = normalizeCommitPrefixes(
    demandConfig?.commitPrefixes
  );
  const demandTypes =
    customTypes.length > 0
      ? customTypes
      : legacyPrefixes.length > 0
      ? legacyPrefixes.map((prefix) => ({
          prefix,
          commitPrefix: legacyCommitPrefixes[prefix] ?? prefix,
        }))
      : DEFAULT_DEMAND_TYPES;
  const releasePrefix = normalizeReleasePrefix(demandConfig?.releasePrefix);
  return { apiKey, baseUrl, model, demandTypes, releasePrefix };
}

const DEFAULT_DEMAND_TYPES = [
  { prefix: "feature", commitPrefix: "feat" },
  { prefix: "fix", commitPrefix: "fix" },
];
const DEFAULT_RELEASE_PREFIX = "release";

function normalizePrefixes(prefixes: unknown): string[] {
  if (!Array.isArray(prefixes)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const prefix of prefixes) {
    const normalized = toBranchSlug(String(prefix ?? ""));
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeReleasePrefix(value?: string): string {
  const normalized = toBranchSlug((value ?? "").trim());
  return normalized || DEFAULT_RELEASE_PREFIX;
}

function normalizeCommitPrefixes(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const entries = Object.entries(input as Record<string, unknown>);
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    const normalizedKey = toBranchSlug(String(key ?? ""));
    const normalizedValue = toBranchSlug(String(value ?? ""));
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    result[normalizedKey] = normalizedValue;
  }
  return result;
}

function normalizeDemandTypes(
  input: unknown
): { prefix: string; commitPrefix: string }[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const result: { prefix: string; commitPrefix: string }[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const raw = item as Record<string, unknown>;
    const prefix = toBranchSlug(String(raw.prefix ?? ""));
    if (!prefix || seen.has(prefix)) {
      continue;
    }
    const commitPrefix = toBranchSlug(
      String(raw.commitPrefix ?? raw.prefix ?? "")
    );
    seen.add(prefix);
    result.push({
      prefix,
      commitPrefix: commitPrefix || prefix,
    });
  }
  return result;
}

async function getLatestReleaseBranch(
  cwd: string,
  releasePrefix: string
): Promise<string | null> {
  const remoteBranches = await listRemoteBranches(cwd);
  const latestRemote = findLatestReleaseBranch(remoteBranches, releasePrefix);
  if (latestRemote) {
    return latestRemote;
  }
  const localBranches = await listBranches(cwd);
  return findLatestReleaseBranch(localBranches, releasePrefix);
}

function findLatestReleaseBranch(
  branches: string[],
  releasePrefix: string
): string | null {
  let latestBranch: string | null = null;
  let latestDate = "";
  for (const branch of branches) {
    const date = extractReleaseDate(branch, releasePrefix);
    if (!date) {
      continue;
    }
    if (!latestDate || date > latestDate) {
      latestDate = date;
      latestBranch = branch;
    }
  }
  return latestBranch;
}

function extractReleaseDate(
  branch: string,
  releasePrefix: string
): string | null {
  const prefix = `${releasePrefix}_`;
  const name = branch.split("/").pop() || branch;
  if (!name.startsWith(prefix)) {
    return null;
  }
  const suffix = name.slice(prefix.length);
  if (!/^\d{8}$/.test(suffix)) {
    return null;
  }
  return suffix;
}

function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function toBranchSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isNoUpstreamError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no tracking information") ||
    normalized.includes("set-upstream-to") ||
    message.includes("没有跟踪") ||
    message.includes("未设置上游")
  );
}

function pickBaseCommitMessage(
  lastCommitMessage: string,
  storedDemandMessage: string
): string {
  const trimmedLast = (lastCommitMessage ?? "").trim();
  const trimmedStored = (storedDemandMessage ?? "").trim();
  if (trimmedStored) {
    const prefix = extractCommitPrefix(trimmedStored);
    if (prefix && !hasCommitPrefix(trimmedLast, prefix)) {
      return trimmedStored;
    }
  }
  return trimmedLast || trimmedStored;
}

function formatDemandMessage(message: string, prefix: string): string {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const normalizedPrefix = (prefix ?? "").trim();
  if (!normalizedPrefix) {
    return trimmed;
  }
  if (hasCommitPrefix(trimmed, normalizedPrefix)) {
    return trimmed;
  }
  return `${normalizedPrefix}: ${trimmed}`;
}

function hasCommitPrefix(message: string, prefix: string): boolean {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return false;
  }
  const lowerMessage = trimmed.toLowerCase();
  const lowerPrefix = (prefix ?? "").trim().toLowerCase();
  if (!lowerPrefix) {
    return false;
  }
  if (!lowerMessage.startsWith(lowerPrefix)) {
    return false;
  }
  const rest = trimmed.slice(lowerPrefix.length);
  return rest.length === 0 || /^[\s:：-]/.test(rest);
}

function extractCommitPrefix(message: string): string {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const match = trimmed.match(/^([^:：\s]+)[:：]/);
  return match ? match[1] : "";
}
