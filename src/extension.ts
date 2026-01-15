import * as vscode from "vscode";
import * as path from "node:path";
import { CONFIG_FILE_NAME, DEFAULT_UI_LABELS } from "./constants";
import { getDefaultConfigTemplate } from "./config";
import { getConfigGroup, getConfigGroups } from "./config-groups";
import { getCurrentBranch, runGit } from "./git";
import { loadMergePlan, performMerge } from "./merge";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "./repo";
import { state } from "./state";
import { getErrorMessage } from "./utils";
import { getWebviewHtml } from "./webview";

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
        await this.openConfig();
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
      void vscode.window.showErrorMessage(
        "未找到工作区，无法打开冲突文件列表。"
      );
      return;
    }
    if (state.lastConflictFiles.length === 0) {
      void vscode.window.showInformationMessage("当前没有检测到冲突文件。");
      return;
    }
    const pick = await vscode.window.showQuickPick(state.lastConflictFiles, {
      placeHolder: "选择要打开的冲突文件",
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
      void vscode.window.showErrorMessage("未找到工作区，无法打开合并编辑器。");
      return;
    }
    if (state.lastConflictFiles.length === 0) {
      void vscode.window.showInformationMessage("当前没有检测到冲突文件。");
      return;
    }
    let target = state.lastConflictFiles[0];
    if (state.lastConflictFiles.length > 1) {
      const pick = await vscode.window.showQuickPick(state.lastConflictFiles, {
        placeHolder: "选择要在合并编辑器中打开的文件",
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

  async openConfig(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage("未找到工作区，无法打开配置文件。");
      return;
    }
    const activeRepoRoot = await resolveRepoRoot();
    const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
    if (repoRoots.length === 0) {
      void vscode.window.showErrorMessage(
        "未找到 Git 仓库，无法创建配置文件。"
      );
      return;
    }
    const template = getDefaultConfigTemplate();
    const content = Buffer.from(JSON.stringify(template, null, 2));
    await Promise.all(
      repoRoots.map(async (repoRoot) => {
        const configUri = vscode.Uri.file(
          path.join(repoRoot, CONFIG_FILE_NAME)
        );
        try {
          await vscode.workspace.fs.stat(configUri);
        } catch {
          await vscode.workspace.fs.writeFile(configUri, content);
        }
      })
    );
    const openRoot =
      activeRepoRoot && repoRoots.includes(activeRepoRoot)
        ? activeRepoRoot
        : repoRoots[0];
    const openUri = vscode.Uri.file(path.join(openRoot, CONFIG_FILE_NAME));
    const doc = await vscode.workspace.openTextDocument(openUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await this.postState({ loadConfig: true });
  }

  private async checkoutOriginal(): Promise<void> {
    if (!state.lastFailureContext) {
      void vscode.window.showInformationMessage("没有需要返回的原分支。");
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
        message: "已返回原分支。",
      });
    } catch (error) {
      this.postMessage({
        type: "error",
        message: `返回原分支失败：${getErrorMessage(error)}`,
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
        message: "未找到工作区，请先打开一个包含 Git 仓库的文件夹。",
      });
      return;
    }
    state.lastWorkspaceRoot = cwd;

    this.postMessage({
      type: "mergeStarted",
      message: "正在执行合并...",
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
      await this.postState({ loadConfig: false });
    } catch (error) {
      this.postMessage({
        type: "error",
        message: getErrorMessage(error),
      });
    }
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
      state.lastUiLabels = DEFAULT_UI_LABELS;
      state.lastConfigLoaded = false;
      state.lastHasMissingConfig = false;
      this.postMessage({
        type: "state",
        currentBranch: "",
        configGroups: [],
        configSummary: [],
        configError: "未找到工作区。",
        uiLabels: DEFAULT_UI_LABELS,
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
      state.lastUiLabels = DEFAULT_UI_LABELS;
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
