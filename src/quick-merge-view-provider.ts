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
import { resolveDemandBranchSettings } from "./demand-settings";
import { getLatestReleaseBranch } from "./release-branch";
import {
  buildNextCommitMessage,
  formatDateStamp,
  formatDemandMessage,
  isNoUpstreamError,
  isRootResetError,
  normalizePrefixes,
  pickBaseCommitMessage,
  toBranchSlug,
} from "./extension-utils";

const DEMAND_MESSAGE_STORAGE_KEY = "quick-merge-jenkins.demandMessages";

export class QuickMergeViewProvider implements vscode.WebviewViewProvider {
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
      if (message?.type === "deployProd") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.handleDeployProd(repoRoot);
        return;
      }
      if (message?.type === "squashDeployProd") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        await this.handleSquashDeployProd(repoRoot);
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
        await this.handleRebaseSquashWithPrompt(repoRoot);
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

  private async handleDeployProd(repoRoot?: string): Promise<void> {
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
    state.lastWorkspaceRoot = cwd;
    this.postMessage({
      type: "deployProdStarted",
      message: t("deployProdStarted"),
    });
    try {
      const currentBranch = await getCurrentBranch(cwd).catch(() => "");
      if (!currentBranch) {
        notifyError(t("currentBranchMissing"));
        return;
      }

      let configFile: MergeConfigFile | null = null;
      try {
        configFile = await readMergeConfig(cwd);
      } catch {
        configFile = null;
      }
      const settings = resolveDemandBranchSettings(configFile);
      const deployProdConfig = configFile?.deployToProd;
      let prodPrefixes = normalizePrefixes(deployProdConfig?.prodPrefix);
      if (prodPrefixes.length === 0) {
        if (deployProdConfig) {
          notifyError(t("deployProdPrefixEmpty"));
          return;
        }
        prodPrefixes = [settings.releasePrefix];
      }

      const latestBranches: { prefix: string; branch: string }[] = [];
      for (const prefix of prodPrefixes) {
        let baseBranch: string | null = null;
        try {
          baseBranch = await getLatestReleaseBranch(cwd, prefix);
        } catch (error) {
          notifyError(getErrorMessage(error));
          return;
        }
        if (!baseBranch) {
          notifyError(t("deployProdBaseBranchMissing", { prefix }));
          return;
        }
        latestBranches.push({ prefix, branch: baseBranch });
      }

      type ProdBranchPick = vscode.QuickPickItem & {
        prefix: string;
        branch: string;
      };
      const picks: ProdBranchPick[] = latestBranches.map((item) => ({
        label: item.branch.split("/").pop() || item.branch,
        description: item.prefix,
        picked: true,
        prefix: item.prefix,
        branch: item.branch,
      }));
      const selected = await vscode.window.showQuickPick(picks, {
        canPickMany: true,
        placeHolder: t("deployProdPickBranchesPlaceholder"),
      });
      if (!selected || selected.length === 0) {
        return;
      }

      const allBranches = await listBranches(cwd);
      const isFeatBranch = (branch: string): boolean => {
        const name = branch.split("/").pop() || branch;
        const normalized = name.toLowerCase();
        return /^(feat|feature)([\\/_-]|$)/.test(normalized);
      };
      const candidateBranches = allBranches.filter(isFeatBranch);
      if (currentBranch && !candidateBranches.includes(currentBranch)) {
        candidateBranches.unshift(currentBranch);
      }
      const uniqueCandidates = Array.from(new Set(candidateBranches));
      if (uniqueCandidates.length === 0) {
        notifyError(t("deployProdFeatBranchEmpty"));
        return;
      }
      type FeatBranchPick = vscode.QuickPickItem & { branch: string };
      const featPicks: FeatBranchPick[] = uniqueCandidates.map((branch) => ({
        label: branch,
        picked: branch === currentBranch,
        branch,
      }));
      const selectedFeatBranches = await vscode.window.showQuickPick(featPicks, {
        canPickMany: true,
        placeHolder: t("deployProdPickFeatBranchesPlaceholder"),
      });
      if (!selectedFeatBranches || selectedFeatBranches.length === 0) {
        return;
      }
      const sourceBranches = selectedFeatBranches.map((item) => item.branch);

      const dateStamp = formatDateStamp(new Date());
      const [localBranches, remoteBranches] = await Promise.all([
        listBranches(cwd),
        listRemoteBranches(cwd).catch(() => []),
      ]);
      const remotes = await listRemotes(cwd).catch(() => []);
      const pushRemote = remotes.length > 0 ? remotes[0] : null;

      for (const pick of selected) {
        const targetBranch = `${pick.prefix}_${dateStamp}`;
        const targetExists =
          localBranches.includes(targetBranch) ||
          remoteBranches.some(
            (branch) => (branch.split("/").pop() || branch) === targetBranch
          );
        if (targetExists) {
          notifyError(t("branchExists", { branchName: targetBranch }));
          return;
        }

        await runGit(["branch", targetBranch, pick.branch], cwd);
        localBranches.push(targetBranch);

        for (let i = 0; i < sourceBranches.length; i += 1) {
          const sourceBranch = sourceBranches[i];
          const isLastSource = i === sourceBranches.length - 1;
          const plan: ResolvedMergePlan = {
            currentBranch,
            sourceBranch,
            targetBranch,
            strategyFlag: "",
            strategyLabel: "default",
            pushAfterMerge: Boolean(pushRemote) && isLastSource,
            pushRemote,
            jenkins: undefined,
          };

          const result = await performMerge(cwd, plan);
          if (result.status === "failed") {
            state.lastFailureContext = {
              originalBranch: result.currentBranch,
              targetBranch: result.targetBranch,
              cwd,
            };
            state.lastConflictFiles = result.conflicts;
            this.postMessage({ type: "result", result });
            notifyError(t("mergeFailed", { error: result.errorMessage }));
            return;
          }

          this.postMessage({ type: "result", result });
        }

        notifyInfo(t("deployProdSuccess", { branch: targetBranch }));
      }
    } catch (error) {
      notifyError(
        t("deployProdFailed", {
          error: getErrorMessage(error),
        })
      );
    } finally {
      await this.postState({ loadConfig: false });
    }
  }

  private async handleSquashDeployProd(repoRoot?: string): Promise<void> {
    const didSquash = await this.handleRebaseSquash(repoRoot);
    if (!didSquash) {
      return;
    }
    await this.handleDeployProd(repoRoot);
  }

  private async handleRebaseSquashWithPrompt(
    repoRoot?: string
  ): Promise<void> {
    const notifyInfo = (message: string) => {
      this.postMessage({ type: "info", message });
      void vscode.window.showInformationMessage(message);
    };
    const notifyError = (message: string) => {
      this.postMessage({ type: "error", message });
      void vscode.window.showErrorMessage(message);
    };

    let didSquash = await this.handleRebaseSquash(repoRoot);
    if (!didSquash) {
      return;
    }

    while (true) {
      const choice = await vscode.window.showInformationMessage(
        t("squashMorePrompt"),
        { modal: true },
        t("squashMoreNo"),
        t("squashMoreYes")
      );
      if (choice !== t("squashMoreYes")) {
        return;
      }
      const cwd =
        repoRoot ?? state.lastWorkspaceRoot ?? (await resolveRepoRoot());
      if (!cwd) {
        notifyError(t("workspaceMissingForMerge"));
        return;
      }
      let branches: string[] = [];
      try {
        branches = await listBranches(cwd);
      } catch (error) {
        notifyError(getErrorMessage(error));
        return;
      }
      const currentBranch = await getCurrentBranch(cwd).catch(() => "");
      const candidates = currentBranch
        ? branches.filter((branch) => branch !== currentBranch)
        : branches;
      if (candidates.length === 0) {
        notifyInfo(t("noBranchFound"));
        return;
      }
      const pick = await vscode.window.showQuickPick(candidates, {
        placeHolder: t("squashPickBranchPlaceholder"),
      });
      if (!pick) {
        return;
      }
      try {
        await runGit(["checkout", pick], cwd);
      } catch (error) {
        notifyError(getErrorMessage(error));
        return;
      }
      didSquash = await this.handleRebaseSquash(cwd);
      if (!didSquash) {
        return;
      }
    }
  }

  private async postState(options?: { loadConfig?: boolean }): Promise<void> {
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
    const typePick = await vscode.window.showQuickPick(demandTypeItems, {
      placeHolder: t("demandTypePlaceholder"),
    });
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
    const defaultMessage = buildNextCommitMessage(baseMessage);
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
    const defaultMessage = buildNextCommitMessage(baseMessage);
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

  private async handleRebaseSquash(repoRoot?: string): Promise<boolean> {
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
      return false;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      notifyError(t("workspaceMissingForMerge"));
      return false;
    }
    const requestedRepoRoot =
      repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
    if (repoRoot && !requestedRepoRoot) {
      notifyError(t("repoNotFound"));
      return false;
    }
    const defaultRepoRoot =
      activeRepoRoot && repoRoots.includes(activeRepoRoot)
        ? activeRepoRoot
        : repoRoots[0];
    const cwd = requestedRepoRoot ?? defaultRepoRoot;
    state.lastWorkspaceRoot = cwd;
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
          return false;
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
        return false;
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
        return false;
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
      try {
        await runGit(["reset", "--soft", resetTarget], cwd);
      } catch (error) {
        const message = getErrorMessage(error);
        if (!isRootResetError(message)) {
          throw error;
        }
        const emptyTree = await runGit(
          ["hash-object", "-t", "tree", "/dev/null"],
          cwd
        );
        const emptyCommit = await runGit(
          ["commit-tree", emptyTree.stdout, "-m", "quick-merge-squash-root"],
          cwd
        );
        if (!emptyCommit.stdout) {
          throw error;
        }
        await runGit(["reset", "--soft", emptyCommit.stdout], cwd);
      }
      await runGit(["commit", "-m", baseMessage], cwd);

      notifyInfo(
        t("rebaseSuccessWithMessage", {
          count: String(count),
          message: baseMessage,
        })
      );
      return true;
    } catch (error) {
      notifyError(t("rebaseFailed", { error: getErrorMessage(error) }));
      return false;
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
}
