import * as vscode from "vscode";
import * as path from "node:path";
import {
  getConfigPathInfo,
  getDefaultConfigTemplate,
  readMergeConfig,
} from "./config";
import { getConfigGroup, getConfigGroups } from "./config-groups";
import { getCurrentBranch, listBranches, listRemoteBranches, runGit } from "./git";
import { getDefaultUiLabels, getLocale, t } from "./i18n";
import { loadMergePlan, performMerge } from "./merge";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "./repo";
import { state } from "./state";
import { MergeConfigFile } from "./types";
import { getErrorMessage } from "./utils";
import { getWebviewHtml } from "./webview";
import { translateToEnglish } from "./deepseek";

const DEMAND_MESSAGE_STORAGE_KEY = "quick-merge.demandMessages";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new QuickMergeViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      QuickMergeViewProvider.viewType,
      provider
    ),
    vscode.commands.registerCommand("quick-merge.refresh", () =>
      provider.refresh()
    ),
    vscode.commands.registerCommand("quick-merge.openConflictFiles", () =>
      provider.openConflictFiles()
    ),
    vscode.commands.registerCommand("quick-merge.openMergeEditor", () =>
      provider.openMergeEditor()
    ),
    vscode.commands.registerCommand("quick-merge.openConfig", () =>
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
      if (message?.type === "refreshRepo") {
        const repoRoot =
          typeof message?.repoRoot === "string" ? message.repoRoot : "";
        await this.postState({ loadConfig: true, repoRoot });
        return;
      }
      if (message?.type === "merge") {
        await this.handleMerge(message);
        return;
      }
      if (message?.type === "confirmMerge") {
        await this.confirmMerge(message);
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

  refresh(): void {
    void this.postState({ loadConfig: true });
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

  private async handleMerge(message: any): Promise<void> {
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
      type: "mergeStarted",
      message: t("mergeStarted"),
    });

    try {
      const profileKey =
        typeof message?.profileKey === "string" ? message.profileKey : undefined;
      const plan = await loadMergePlan(cwd, profileKey);
      const result = await performMerge(cwd, plan);
      if (result.status === "failed") {
        state.lastFailureContext = {
          originalBranch: result.currentBranch,
          targetBranch: result.targetBranch,
          cwd,
        };
        state.lastConflictFiles = result.conflicts;
      } else {
        state.lastFailureContext = null;
        state.lastConflictFiles = [];
      }
      this.postMessage({
        type: "result",
        result,
      });
      if (result.status === "success") {
        const hasFailure =
          result.checkoutBack === "failed" ||
          result.pushStatus === "failed" ||
          result.jenkinsStatus === "failed";
        const message = hasFailure
          ? t("mergeCompletedWithFailures", { target: result.targetBranch })
          : t("mergeSuccess", { target: result.targetBranch });
        if (hasFailure) {
          void vscode.window.showWarningMessage(message);
        } else {
          void vscode.window.showInformationMessage(message);
        }
      } else {
        void vscode.window.showErrorMessage(
          t("mergeFailed", { error: result.errorMessage })
        );
      }
      await this.postState({ loadConfig: false });
    } catch (error) {
      void vscode.window.showErrorMessage(
        t("mergeFailed", { error: getErrorMessage(error) })
      );
      this.postMessage({
        type: "error",
        message: getErrorMessage(error),
      });
    }
  }

  private async confirmMerge(message: any): Promise<void> {
    const label =
      typeof message?.label === "string" ? message.label.trim() : "";
    const prompt = label
      ? t("mergeConfirmWithLabel", { label })
      : t("mergeConfirm");
    const choice = await vscode.window.showInformationMessage(
      prompt,
      { modal: true },
      t("confirm")
    );
    if (choice !== t("confirm")) {
      return;
    }
    await this.handleMerge(message);
  }

  private async postState(options?: {
    loadConfig?: boolean;
    repoRoot?: string;
  }): Promise<void> {
    const activeRepoRoot = await resolveRepoRoot();
    const loadConfig = options?.loadConfig ?? false;
    const refreshRepoRoot =
      typeof options?.repoRoot === "string" ? options.repoRoot : "";
    if (!activeRepoRoot) {
      state.lastConfigRootsKey = "";
      state.lastConfigGroups = [];
      state.lastConfigError = "";
      state.lastUiLabels = getDefaultUiLabels();
      state.lastConfigLoaded = false;
      state.lastHasMissingConfig = false;
      this.postMessage({
        type: "state",
        currentBranch: "",
        configGroups: [],
        configSummary: [],
        configError: t("workspaceNotFound"),
        uiLabels: getDefaultUiLabels(),
        configLoaded: false,
        hasMissingConfig: false,
      });
      return;
    }
    state.lastWorkspaceRoot = activeRepoRoot;
    const repoRoots = await resolveRepoRoots(activeRepoRoot);
    const repoRootsKey = repoRoots.join("|");
    const shouldRefreshGroup =
      loadConfig && refreshRepoRoot && repoRoots.includes(refreshRepoRoot);
    if (state.lastConfigRootsKey !== repoRootsKey) {
      state.lastConfigRootsKey = repoRootsKey;
      state.lastConfigGroups = [];
      state.lastConfigError = "";
      state.lastUiLabels = getDefaultUiLabels();
      state.lastConfigLoaded = false;
      state.lastHasMissingConfig = false;
    }
    try {
      const currentBranch = activeRepoRoot
        ? await getCurrentBranch(activeRepoRoot).catch(() => "")
        : "";
      if (loadConfig) {
        if (shouldRefreshGroup && state.lastConfigLoaded) {
          const { group, uiLabels } = await getConfigGroup(refreshRepoRoot);
          const nextGroups = [...state.lastConfigGroups];
          const index = nextGroups.findIndex(
            (item) => item.repoRoot === refreshRepoRoot
          );
          if (index >= 0) {
            nextGroups[index] = group;
          } else {
            nextGroups.push(group);
          }
          state.lastConfigGroups = nextGroups;
          if (repoRoots.length === 1) {
            state.lastUiLabels = uiLabels;
          }
          state.lastConfigLoaded = true;
          state.lastHasMissingConfig = nextGroups.some(
            (item) => item && item.missingConfig
          );
        } else {
          const { groups, error, uiLabels } = await getConfigGroups(repoRoots);
          state.lastConfigGroups = groups;
          state.lastConfigError = error;
          state.lastUiLabels = uiLabels;
          state.lastConfigLoaded = true;
          state.lastHasMissingConfig = groups.some(
            (item) => item && item.missingConfig
          );
        }
      }
      this.postMessage({
        type: "state",
        currentBranch,
        configGroups: state.lastConfigGroups,
        configSummary: state.lastConfigGroups.flatMap((group) => group.items),
        configError: state.lastConfigError,
        uiLabels: state.lastUiLabels,
        configLoaded: state.lastConfigLoaded,
        hasMissingConfig: state.lastHasMissingConfig,
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
    const repoRoots = await resolveRepoRoots(
      activeRepoRoot ?? workspaceRoot
    );
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
    if (settings.prefixes.length === 0) {
      notifyError(t("demandPrefixEmpty"));
      return;
    }
    const typePick = await vscode.window.showQuickPick(
      settings.prefixes.map((prefix) => ({
        label: prefix,
        description:
          prefix === "feature"
            ? t("demandTypeFeature")
            : prefix === "fix"
              ? t("demandTypeFix")
              : "",
        value: prefix,
      })),
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
    const demandMessage = input.trim().replace(/\s+/g, " ");
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
    const repoRoots = await resolveRepoRoots(
      activeRepoRoot ?? workspaceRoot
    );
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
    const baseMessage = lastCommitMessage || storedDemandMessage;
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
    await this.context.workspaceState.update(
      DEMAND_MESSAGE_STORAGE_KEY,
      next
    );
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
  const config = vscode.workspace.getConfiguration("quick-merge");
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
  prefixes: string[];
  releasePrefix: string;
} {
  const fallback = getDeepseekSettings();
  const demandConfig = configFile?.demandBranch;
  const apiKey = (demandConfig?.deepseekApiKey ?? fallback.apiKey).trim();
  const baseUrl = (demandConfig?.deepseekBaseUrl ?? fallback.baseUrl).trim();
  const model =
    (demandConfig?.deepseekModel ?? fallback.model).trim() || "deepseek-chat";
  const hasCustomPrefixes = Array.isArray(demandConfig?.prefixes);
  const customPrefixes = normalizePrefixes(demandConfig?.prefixes ?? []);
  const prefixes = hasCustomPrefixes
    ? customPrefixes
    : DEFAULT_DEMAND_PREFIXES;
  const releasePrefix = normalizeReleasePrefix(demandConfig?.releasePrefix);
  return { apiKey, baseUrl, model, prefixes, releasePrefix };
}

const DEFAULT_DEMAND_PREFIXES = ["feature", "fix"];
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
