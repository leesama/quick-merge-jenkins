"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const constants_1 = require("./constants");
const config_1 = require("./config");
const config_groups_1 = require("./config-groups");
const git_1 = require("./git");
const merge_1 = require("./merge");
const repo_1 = require("./repo");
const state_1 = require("./state");
const utils_1 = require("./utils");
const webview_1 = require("./webview");
function activate(context) {
    const provider = new QuickMergeViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(QuickMergeViewProvider.viewType, provider), vscode.commands.registerCommand("quick-merge.refresh", () => provider.refresh()), vscode.commands.registerCommand("quick-merge.openConflictFiles", () => provider.openConflictFiles()), vscode.commands.registerCommand("quick-merge.openMergeEditor", () => provider.openMergeEditor()), vscode.commands.registerCommand("quick-merge.openConfig", () => provider.openConfig()));
    setupDevAutoReload(context);
}
function deactivate() { }
class QuickMergeViewProvider {
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = (0, webview_1.getWebviewHtml)(view.webview);
        view.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === "requestState") {
                const loadConfig = Boolean(message?.loadConfig);
                await this.postState({ loadConfig });
                return;
            }
            if (message?.type === "refreshRepo") {
                const repoRoot = typeof message?.repoRoot === "string" ? message.repoRoot : "";
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
                void this.postState({ loadConfig: !state_1.state.lastConfigLoaded });
            }
        });
        void this.postState({ loadConfig: !state_1.state.lastConfigLoaded });
    }
    refresh() {
        void this.postState({ loadConfig: true });
    }
    async openConflictFiles() {
        const cwd = state_1.state.lastWorkspaceRoot ?? (await (0, repo_1.resolveRepoRoot)());
        if (!cwd) {
            void vscode.window.showErrorMessage("未找到工作区，无法打开冲突文件列表。");
            return;
        }
        if (state_1.state.lastConflictFiles.length === 0) {
            void vscode.window.showInformationMessage("当前没有检测到冲突文件。");
            return;
        }
        const pick = await vscode.window.showQuickPick(state_1.state.lastConflictFiles, {
            placeHolder: "选择要打开的冲突文件",
        });
        if (!pick) {
            return;
        }
        const fileUri = vscode.Uri.file(path.join(cwd, pick));
        await vscode.window.showTextDocument(fileUri);
    }
    async openMergeEditor() {
        const cwd = state_1.state.lastWorkspaceRoot ?? (await (0, repo_1.resolveRepoRoot)());
        if (!cwd) {
            void vscode.window.showErrorMessage("未找到工作区，无法打开合并编辑器。");
            return;
        }
        if (state_1.state.lastConflictFiles.length === 0) {
            void vscode.window.showInformationMessage("当前没有检测到冲突文件。");
            return;
        }
        let target = state_1.state.lastConflictFiles[0];
        if (state_1.state.lastConflictFiles.length > 1) {
            const pick = await vscode.window.showQuickPick(state_1.state.lastConflictFiles, {
                placeHolder: "选择要在合并编辑器中打开的文件",
            });
            if (!pick) {
                return;
            }
            target = pick;
        }
        const fileUri = vscode.Uri.file(path.join(cwd, target));
        try {
            await vscode.commands.executeCommand("vscode.openWith", fileUri, "vscode.mergeEditor");
            return;
        }
        catch {
            try {
                await vscode.commands.executeCommand("vscode.openMergeEditor", fileUri);
                return;
            }
            catch {
                await vscode.window.showTextDocument(fileUri);
            }
        }
    }
    async openConfig() {
        const workspaceRoot = (0, repo_1.getWorkspaceRoot)();
        if (!workspaceRoot) {
            void vscode.window.showErrorMessage("未找到工作区，无法打开配置文件。");
            return;
        }
        const activeRepoRoot = await (0, repo_1.resolveRepoRoot)();
        const repoRoots = await (0, repo_1.resolveRepoRoots)(activeRepoRoot ?? workspaceRoot);
        if (repoRoots.length === 0) {
            void vscode.window.showErrorMessage("未找到 Git 仓库，无法创建配置文件。");
            return;
        }
        const template = (0, config_1.getDefaultConfigTemplate)();
        const content = Buffer.from(JSON.stringify(template, null, 2));
        await Promise.all(repoRoots.map(async (repoRoot) => {
            const configUri = vscode.Uri.file(path.join(repoRoot, constants_1.CONFIG_FILE_NAME));
            try {
                await vscode.workspace.fs.stat(configUri);
            }
            catch {
                await vscode.workspace.fs.writeFile(configUri, content);
            }
        }));
        const openRoot = activeRepoRoot && repoRoots.includes(activeRepoRoot)
            ? activeRepoRoot
            : repoRoots[0];
        const openUri = vscode.Uri.file(path.join(openRoot, constants_1.CONFIG_FILE_NAME));
        const doc = await vscode.workspace.openTextDocument(openUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        await this.postState({ loadConfig: true });
    }
    async checkoutOriginal() {
        if (!state_1.state.lastFailureContext) {
            void vscode.window.showInformationMessage("没有需要返回的原分支。");
            return;
        }
        try {
            await (0, git_1.runGit)(["checkout", state_1.state.lastFailureContext.originalBranch], state_1.state.lastFailureContext.cwd);
            state_1.state.lastFailureContext = null;
            state_1.state.lastConflictFiles = [];
            await this.postState({ loadConfig: false });
            this.postMessage({
                type: "info",
                message: "已返回原分支。",
            });
        }
        catch (error) {
            this.postMessage({
                type: "error",
                message: `返回原分支失败：${(0, utils_1.getErrorMessage)(error)}`,
            });
        }
    }
    async handleMerge(message) {
        const requestedRoot = typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        const cwd = requestedRoot ?? (await (0, repo_1.resolveRepoRoot)());
        if (!cwd) {
            this.postMessage({
                type: "error",
                message: "未找到工作区，请先打开一个包含 Git 仓库的文件夹。",
            });
            return;
        }
        state_1.state.lastWorkspaceRoot = cwd;
        this.postMessage({
            type: "mergeStarted",
            message: "正在执行合并...",
        });
        try {
            const profileKey = typeof message?.profileKey === "string" ? message.profileKey : undefined;
            const plan = await (0, merge_1.loadMergePlan)(cwd, profileKey);
            const result = await (0, merge_1.performMerge)(cwd, plan);
            if (result.status === "failed") {
                state_1.state.lastFailureContext = {
                    originalBranch: result.currentBranch,
                    targetBranch: result.targetBranch,
                    cwd,
                };
                state_1.state.lastConflictFiles = result.conflicts;
            }
            else {
                state_1.state.lastFailureContext = null;
                state_1.state.lastConflictFiles = [];
            }
            this.postMessage({
                type: "result",
                result,
            });
            await this.postState({ loadConfig: false });
        }
        catch (error) {
            this.postMessage({
                type: "error",
                message: (0, utils_1.getErrorMessage)(error),
            });
        }
    }
    async postState(options) {
        const activeRepoRoot = await (0, repo_1.resolveRepoRoot)();
        const loadConfig = options?.loadConfig ?? false;
        const refreshRepoRoot = typeof options?.repoRoot === "string" ? options.repoRoot : "";
        if (!activeRepoRoot) {
            state_1.state.lastConfigRootsKey = "";
            state_1.state.lastConfigGroups = [];
            state_1.state.lastConfigError = "";
            state_1.state.lastUiLabels = constants_1.DEFAULT_UI_LABELS;
            state_1.state.lastConfigLoaded = false;
            state_1.state.lastHasMissingConfig = false;
            this.postMessage({
                type: "state",
                currentBranch: "",
                configGroups: [],
                configSummary: [],
                configError: "未找到工作区。",
                uiLabels: constants_1.DEFAULT_UI_LABELS,
                configLoaded: false,
                hasMissingConfig: false,
            });
            return;
        }
        state_1.state.lastWorkspaceRoot = activeRepoRoot;
        const repoRoots = await (0, repo_1.resolveRepoRoots)(activeRepoRoot);
        const repoRootsKey = repoRoots.join("|");
        const shouldRefreshGroup = loadConfig && refreshRepoRoot && repoRoots.includes(refreshRepoRoot);
        if (state_1.state.lastConfigRootsKey !== repoRootsKey) {
            state_1.state.lastConfigRootsKey = repoRootsKey;
            state_1.state.lastConfigGroups = [];
            state_1.state.lastConfigError = "";
            state_1.state.lastUiLabels = constants_1.DEFAULT_UI_LABELS;
            state_1.state.lastConfigLoaded = false;
            state_1.state.lastHasMissingConfig = false;
        }
        try {
            const currentBranch = activeRepoRoot
                ? await (0, git_1.getCurrentBranch)(activeRepoRoot).catch(() => "")
                : "";
            if (loadConfig) {
                if (shouldRefreshGroup && state_1.state.lastConfigLoaded) {
                    const { group, uiLabels } = await (0, config_groups_1.getConfigGroup)(refreshRepoRoot);
                    const nextGroups = [...state_1.state.lastConfigGroups];
                    const index = nextGroups.findIndex((item) => item.repoRoot === refreshRepoRoot);
                    if (index >= 0) {
                        nextGroups[index] = group;
                    }
                    else {
                        nextGroups.push(group);
                    }
                    state_1.state.lastConfigGroups = nextGroups;
                    if (repoRoots.length === 1) {
                        state_1.state.lastUiLabels = uiLabels;
                    }
                    state_1.state.lastConfigLoaded = true;
                    state_1.state.lastHasMissingConfig = nextGroups.some((item) => item && item.missingConfig);
                }
                else {
                    const { groups, error, uiLabels } = await (0, config_groups_1.getConfigGroups)(repoRoots);
                    state_1.state.lastConfigGroups = groups;
                    state_1.state.lastConfigError = error;
                    state_1.state.lastUiLabels = uiLabels;
                    state_1.state.lastConfigLoaded = true;
                    state_1.state.lastHasMissingConfig = groups.some((item) => item && item.missingConfig);
                }
            }
            this.postMessage({
                type: "state",
                currentBranch,
                configGroups: state_1.state.lastConfigGroups,
                configSummary: state_1.state.lastConfigGroups.flatMap((group) => group.items),
                configError: state_1.state.lastConfigError,
                uiLabels: state_1.state.lastUiLabels,
                configLoaded: state_1.state.lastConfigLoaded,
                hasMissingConfig: state_1.state.lastHasMissingConfig,
            });
        }
        catch (error) {
            this.postMessage({
                type: "error",
                message: (0, utils_1.getErrorMessage)(error),
            });
        }
    }
    postMessage(message) {
        void this.view?.webview.postMessage(message);
    }
}
QuickMergeViewProvider.viewType = "quickMergeView";
function setupDevAutoReload(context) {
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
        return;
    }
    const readyAt = Date.now() + 1000;
    const pattern = new vscode.RelativePattern(context.extensionPath, "dist/extension.js");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    let reloadTimer = null;
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
    context.subscriptions.push(watcher, new vscode.Disposable(() => {
        if (reloadTimer) {
            clearTimeout(reloadTimer);
        }
    }));
}
//# sourceMappingURL=extension.js.map