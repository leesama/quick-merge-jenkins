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
const config_1 = require("./config");
const config_groups_1 = require("./config-groups");
const git_1 = require("./git");
const i18n_1 = require("./i18n");
const merge_1 = require("./merge");
const repo_1 = require("./repo");
const state_1 = require("./state");
const utils_1 = require("./utils");
const webview_1 = require("./webview");
const deepseek_1 = require("./deepseek");
const DEMAND_MESSAGE_STORAGE_KEY = "quick-merge.demandMessages";
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
            if (message?.type === "confirmMerge") {
                await this.confirmMerge(message);
                return;
            }
            if (message?.type === "commitDemand") {
                const repoRoot = typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
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
                const repoRoot = typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
                await this.openConfig(repoRoot);
                return;
            }
            if (message?.type === "createDemandBranch") {
                const repoRoot = typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
                await this.createDemandBranch(repoRoot);
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
            void vscode.window.showErrorMessage((0, i18n_1.t)("openConflictWorkspaceMissing"));
            return;
        }
        if (state_1.state.lastConflictFiles.length === 0) {
            void vscode.window.showInformationMessage((0, i18n_1.t)("noConflictFiles"));
            return;
        }
        const pick = await vscode.window.showQuickPick(state_1.state.lastConflictFiles, {
            placeHolder: (0, i18n_1.t)("pickConflictFile"),
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
            void vscode.window.showErrorMessage((0, i18n_1.t)("openMergeEditorWorkspaceMissing"));
            return;
        }
        if (state_1.state.lastConflictFiles.length === 0) {
            void vscode.window.showInformationMessage((0, i18n_1.t)("noConflictFiles"));
            return;
        }
        let target = state_1.state.lastConflictFiles[0];
        if (state_1.state.lastConflictFiles.length > 1) {
            const pick = await vscode.window.showQuickPick(state_1.state.lastConflictFiles, {
                placeHolder: (0, i18n_1.t)("pickMergeEditorFile"),
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
    async openConfig(repoRoot) {
        const workspaceRoot = (0, repo_1.getWorkspaceRoot)();
        if (!workspaceRoot) {
            void vscode.window.showErrorMessage((0, i18n_1.t)("openConfigWorkspaceMissing"));
            return;
        }
        const activeRepoRoot = await (0, repo_1.resolveRepoRoot)();
        const repoRoots = await (0, repo_1.resolveRepoRoots)(activeRepoRoot ?? workspaceRoot);
        if (repoRoots.length === 0) {
            void vscode.window.showErrorMessage((0, i18n_1.t)("noGitRepoCreateConfig"));
            return;
        }
        const requestedRepoRoot = repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
        if (repoRoot && !requestedRepoRoot) {
            void vscode.window.showErrorMessage((0, i18n_1.t)("repoNotFound"));
            return;
        }
        const templatePath = path.join(this.context.extensionPath, "media", (0, i18n_1.getLocale)() === "zh" ? "default-config.jsonc" : "default-config.en.jsonc");
        let template;
        try {
            template = await (0, config_1.getDefaultConfigTemplate)(templatePath);
        }
        catch (error) {
            void vscode.window.showErrorMessage((0, i18n_1.t)("readTemplateFailed", { error: (0, utils_1.getErrorMessage)(error) }));
            return;
        }
        const content = Buffer.from(template);
        const targetRoots = requestedRepoRoot ? [requestedRepoRoot] : repoRoots;
        await Promise.all(targetRoots.map(async (targetRoot) => {
            const configInfo = await (0, config_1.getConfigPathInfo)(targetRoot);
            const configUri = vscode.Uri.file(configInfo.path);
            if (!configInfo.exists) {
                await vscode.workspace.fs.writeFile(configUri, content);
            }
        }));
        const openRoot = requestedRepoRoot
            ? requestedRepoRoot
            : activeRepoRoot && repoRoots.includes(activeRepoRoot)
                ? activeRepoRoot
                : repoRoots[0];
        const openConfigInfo = await (0, config_1.getConfigPathInfo)(openRoot);
        const openUri = vscode.Uri.file(openConfigInfo.path);
        const doc = await vscode.workspace.openTextDocument(openUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        await this.postState({ loadConfig: true });
    }
    async checkoutOriginal() {
        if (!state_1.state.lastFailureContext) {
            void vscode.window.showInformationMessage((0, i18n_1.t)("noOriginalBranch"));
            return;
        }
        try {
            await (0, git_1.runGit)(["checkout", state_1.state.lastFailureContext.originalBranch], state_1.state.lastFailureContext.cwd);
            state_1.state.lastFailureContext = null;
            state_1.state.lastConflictFiles = [];
            await this.postState({ loadConfig: false });
            this.postMessage({
                type: "info",
                message: (0, i18n_1.t)("checkoutOriginalSuccess"),
            });
        }
        catch (error) {
            this.postMessage({
                type: "error",
                message: (0, i18n_1.t)("checkoutOriginalFailed", { error: (0, utils_1.getErrorMessage)(error) }),
            });
        }
    }
    async handleMerge(message) {
        const requestedRoot = typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
        const cwd = requestedRoot ?? (await (0, repo_1.resolveRepoRoot)());
        if (!cwd) {
            this.postMessage({
                type: "error",
                message: (0, i18n_1.t)("workspaceMissingForMerge"),
            });
            return;
        }
        state_1.state.lastWorkspaceRoot = cwd;
        this.postMessage({
            type: "mergeStarted",
            message: (0, i18n_1.t)("mergeStarted"),
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
            if (result.status === "success") {
                const hasFailure = result.checkoutBack === "failed" ||
                    result.pushStatus === "failed" ||
                    result.jenkinsStatus === "failed";
                const message = hasFailure
                    ? (0, i18n_1.t)("mergeCompletedWithFailures", { target: result.targetBranch })
                    : (0, i18n_1.t)("mergeSuccess", { target: result.targetBranch });
                if (hasFailure) {
                    void vscode.window.showWarningMessage(message);
                }
                else {
                    void vscode.window.showInformationMessage(message);
                }
            }
            else {
                void vscode.window.showErrorMessage((0, i18n_1.t)("mergeFailed", { error: result.errorMessage }));
            }
            await this.postState({ loadConfig: false });
        }
        catch (error) {
            void vscode.window.showErrorMessage((0, i18n_1.t)("mergeFailed", { error: (0, utils_1.getErrorMessage)(error) }));
            this.postMessage({
                type: "error",
                message: (0, utils_1.getErrorMessage)(error),
            });
        }
    }
    async confirmMerge(message) {
        const label = typeof message?.label === "string" ? message.label.trim() : "";
        const prompt = label
            ? (0, i18n_1.t)("mergeConfirmWithLabel", { label })
            : (0, i18n_1.t)("mergeConfirm");
        const choice = await vscode.window.showInformationMessage(prompt, { modal: true }, (0, i18n_1.t)("confirm"));
        if (choice !== (0, i18n_1.t)("confirm")) {
            return;
        }
        await this.handleMerge(message);
    }
    async postState(options) {
        const activeRepoRoot = await (0, repo_1.resolveRepoRoot)();
        const loadConfig = options?.loadConfig ?? false;
        const refreshRepoRoot = typeof options?.repoRoot === "string" ? options.repoRoot : "";
        if (!activeRepoRoot) {
            state_1.state.lastConfigRootsKey = "";
            state_1.state.lastConfigGroups = [];
            state_1.state.lastConfigError = "";
            state_1.state.lastUiLabels = (0, i18n_1.getDefaultUiLabels)();
            state_1.state.lastConfigLoaded = false;
            state_1.state.lastHasMissingConfig = false;
            this.postMessage({
                type: "state",
                currentBranch: "",
                configGroups: [],
                configSummary: [],
                configError: (0, i18n_1.t)("workspaceNotFound"),
                uiLabels: (0, i18n_1.getDefaultUiLabels)(),
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
            state_1.state.lastUiLabels = (0, i18n_1.getDefaultUiLabels)();
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
    async createDemandBranch(repoRoot) {
        const notifyInfo = (message) => {
            this.postMessage({ type: "info", message });
            void vscode.window.showInformationMessage(message);
        };
        const notifyError = (message) => {
            this.postMessage({ type: "error", message });
            void vscode.window.showErrorMessage(message);
        };
        const workspaceRoot = (0, repo_1.getWorkspaceRoot)();
        if (!workspaceRoot) {
            notifyError((0, i18n_1.t)("workspaceOpenProject"));
            return;
        }
        const activeRepoRoot = await (0, repo_1.resolveRepoRoot)();
        const repoRoots = await (0, repo_1.resolveRepoRoots)(activeRepoRoot ?? workspaceRoot);
        if (repoRoots.length === 0) {
            notifyError((0, i18n_1.t)("workspaceMissingForMerge"));
            return;
        }
        const requestedRepoRoot = repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
        if (repoRoot && !requestedRepoRoot) {
            notifyError((0, i18n_1.t)("repoNotFound"));
            return;
        }
        const defaultRepoRoot = activeRepoRoot && repoRoots.includes(activeRepoRoot)
            ? activeRepoRoot
            : repoRoots[0];
        const cwd = requestedRepoRoot ?? defaultRepoRoot;
        let configFile = null;
        try {
            configFile = await (0, config_1.readMergeConfig)(cwd);
        }
        catch {
            configFile = null;
        }
        const settings = resolveDemandBranchSettings(configFile);
        if (settings.prefixes.length === 0) {
            notifyError((0, i18n_1.t)("demandPrefixEmpty"));
            return;
        }
        const typePick = await vscode.window.showQuickPick(settings.prefixes.map((prefix) => ({
            label: prefix,
            description: prefix === "feature"
                ? (0, i18n_1.t)("demandTypeFeature")
                : prefix === "fix"
                    ? (0, i18n_1.t)("demandTypeFix")
                    : "",
            value: prefix,
        })), { placeHolder: (0, i18n_1.t)("demandTypePlaceholder") });
        if (!typePick) {
            return;
        }
        const input = await vscode.window.showInputBox({
            prompt: (0, i18n_1.t)("demandDescPrompt"),
            placeHolder: (0, i18n_1.t)("demandDescPlaceholder"),
            validateInput: (value) => value.trim().length === 0 ? (0, i18n_1.t)("demandDescRequired") : undefined,
        });
        if (!input) {
            return;
        }
        if (!settings.apiKey) {
            notifyError((0, i18n_1.t)("deepseekKeyMissing"));
            return;
        }
        let baseBranch = null;
        try {
            baseBranch = await getLatestReleaseBranch(cwd, settings.releasePrefix);
        }
        catch (error) {
            notifyError((0, utils_1.getErrorMessage)(error));
            return;
        }
        if (!baseBranch) {
            let branches;
            try {
                const [remoteBranches, localBranches] = await Promise.all([
                    (0, git_1.listRemoteBranches)(cwd).catch(() => []),
                    (0, git_1.listBranches)(cwd),
                ]);
                const merged = [...remoteBranches, ...localBranches];
                const seen = new Set();
                branches = merged.filter((branch) => {
                    if (seen.has(branch)) {
                        return false;
                    }
                    seen.add(branch);
                    return true;
                });
            }
            catch (error) {
                notifyError((0, utils_1.getErrorMessage)(error));
                return;
            }
            if (branches.length === 0) {
                notifyError((0, i18n_1.t)("noBranchFound"));
                return;
            }
            const pick = await vscode.window.showQuickPick(branches, {
                placeHolder: (0, i18n_1.t)("pickBaseBranchPlaceholder", {
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
            message: (0, i18n_1.t)("generatingBranchName"),
        });
        let translated;
        try {
            translated = await (0, deepseek_1.translateToEnglish)(input, settings);
        }
        catch (error) {
            notifyError((0, utils_1.getErrorMessage)(error));
            return;
        }
        const slug = toBranchSlug(translated);
        if (!slug) {
            notifyError((0, i18n_1.t)("translationEmpty"));
            return;
        }
        const dateStamp = formatDateStamp(new Date());
        branchName = `${typePick.value}_${slug}_${dateStamp}`;
        const edited = await vscode.window.showInputBox({
            prompt: (0, i18n_1.t)("branchNamePrompt"),
            value: branchName,
            placeHolder: (0, i18n_1.t)("branchNamePlaceholder"),
            validateInput: (value) => value.trim().length === 0 ? (0, i18n_1.t)("branchNameRequired") : undefined,
        });
        if (!edited) {
            return;
        }
        branchName = edited.trim();
        const choice = await vscode.window.showInformationMessage((0, i18n_1.t)("branchConfirm", { branchName }), { modal: true, detail: (0, i18n_1.t)("baseBranchDetail", { baseBranch }) }, (0, i18n_1.t)("confirm"));
        if (choice !== (0, i18n_1.t)("confirm")) {
            return;
        }
        try {
            const branches = await (0, git_1.listBranches)(cwd);
            if (branches.includes(branchName)) {
                notifyError((0, i18n_1.t)("branchExists", { branchName }));
                return;
            }
            await (0, git_1.runGit)(["checkout", "-b", branchName, baseBranch], cwd);
            await this.saveDemandMessage(cwd, demandMessage);
            await (0, git_1.runGit)(["commit", "--allow-empty", "-m", demandMessage], cwd);
            notifyInfo((0, i18n_1.t)("emptyCommitCreated", { message: demandMessage }));
            notifyInfo((0, i18n_1.t)("demandBranchCreated", { baseBranch, branchName }));
        }
        catch (error) {
            notifyError((0, utils_1.getErrorMessage)(error));
        }
    }
    async commitDemandCode(repoRoot) {
        const notifyInfo = (message) => {
            this.postMessage({ type: "info", message });
            void vscode.window.showInformationMessage(message);
        };
        const notifyError = (message) => {
            this.postMessage({ type: "error", message });
            void vscode.window.showErrorMessage(message);
        };
        const workspaceRoot = (0, repo_1.getWorkspaceRoot)();
        if (!workspaceRoot) {
            notifyError((0, i18n_1.t)("workspaceOpenProject"));
            return;
        }
        const activeRepoRoot = await (0, repo_1.resolveRepoRoot)();
        const repoRoots = await (0, repo_1.resolveRepoRoots)(activeRepoRoot ?? workspaceRoot);
        if (repoRoots.length === 0) {
            notifyError((0, i18n_1.t)("workspaceMissingForMerge"));
            return;
        }
        const requestedRepoRoot = repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
        if (repoRoot && !requestedRepoRoot) {
            notifyError((0, i18n_1.t)("repoNotFound"));
            return;
        }
        const defaultRepoRoot = activeRepoRoot && repoRoots.includes(activeRepoRoot)
            ? activeRepoRoot
            : repoRoots[0];
        const cwd = requestedRepoRoot ?? defaultRepoRoot;
        const storedDemandMessage = this.getDemandMessage(cwd);
        let lastCommitMessage = "";
        try {
            lastCommitMessage = await this.getLastCommitMessage(cwd);
        }
        catch {
            lastCommitMessage = "";
        }
        const baseMessage = lastCommitMessage || storedDemandMessage;
        if (!baseMessage || baseMessage.trim().length === 0) {
            notifyError((0, i18n_1.t)("demandMessageMissing"));
            return;
        }
        const defaultMessage = this.buildNextCommitMessage(baseMessage);
        const inputMessage = await vscode.window.showInputBox({
            prompt: (0, i18n_1.t)("commitMessagePrompt"),
            value: defaultMessage,
            placeHolder: (0, i18n_1.t)("commitMessagePlaceholder"),
            validateInput: (value) => value.trim().length === 0 ? (0, i18n_1.t)("commitMessageRequired") : undefined,
        });
        if (!inputMessage) {
            return;
        }
        const commitMessage = inputMessage.trim();
        const choice = await vscode.window.showInformationMessage((0, i18n_1.t)("commitConfirm", { demandMessage: commitMessage }), { modal: true }, (0, i18n_1.t)("confirm"));
        if (choice !== (0, i18n_1.t)("confirm")) {
            return;
        }
        try {
            await (0, git_1.runGit)(["add", "-A"], cwd);
            const status = await (0, git_1.runGit)(["status", "--porcelain"], cwd);
            if (!status.stdout.trim()) {
                notifyInfo((0, i18n_1.t)("commitNoChanges"));
                return;
            }
            await (0, git_1.runGit)(["commit", "-m", commitMessage], cwd);
            notifyInfo((0, i18n_1.t)("commitSuccess", { message: commitMessage }));
        }
        catch (error) {
            notifyError((0, utils_1.getErrorMessage)(error));
        }
    }
    getDemandMessage(repoRoot) {
        const stored = this.context.workspaceState.get(DEMAND_MESSAGE_STORAGE_KEY) ?? null;
        if (stored && typeof stored === "object") {
            state_1.state.lastDemandMessages = { ...stored };
        }
        return state_1.state.lastDemandMessages[repoRoot] ?? "";
    }
    async saveDemandMessage(repoRoot, message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }
        const next = {
            ...state_1.state.lastDemandMessages,
            [repoRoot]: trimmed,
        };
        state_1.state.lastDemandMessages = next;
        await this.context.workspaceState.update(DEMAND_MESSAGE_STORAGE_KEY, next);
    }
    async getLastCommitMessage(cwd) {
        const result = await (0, git_1.runGit)(["log", "-1", "--pretty=%B"], cwd);
        const lines = result.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        return lines[0] ?? "";
    }
    buildNextCommitMessage(lastMessage) {
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
function getDeepseekSettings() {
    const config = vscode.workspace.getConfiguration("quick-merge");
    const apiKey = (config.get("deepseekApiKey") ?? "").trim();
    const baseUrl = (config.get("deepseekBaseUrl") ?? "").trim();
    const model = (config.get("deepseekModel") ?? "deepseek-chat").trim() ||
        "deepseek-chat";
    return { apiKey, baseUrl, model };
}
function resolveDemandBranchSettings(configFile) {
    const fallback = getDeepseekSettings();
    const demandConfig = configFile?.demandBranch;
    const apiKey = (demandConfig?.deepseekApiKey ?? fallback.apiKey).trim();
    const baseUrl = (demandConfig?.deepseekBaseUrl ?? fallback.baseUrl).trim();
    const model = (demandConfig?.deepseekModel ?? fallback.model).trim() || "deepseek-chat";
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
function normalizePrefixes(prefixes) {
    if (!Array.isArray(prefixes)) {
        return [];
    }
    const seen = new Set();
    const result = [];
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
function normalizeReleasePrefix(value) {
    const normalized = toBranchSlug((value ?? "").trim());
    return normalized || DEFAULT_RELEASE_PREFIX;
}
async function getLatestReleaseBranch(cwd, releasePrefix) {
    const remoteBranches = await (0, git_1.listRemoteBranches)(cwd);
    const latestRemote = findLatestReleaseBranch(remoteBranches, releasePrefix);
    if (latestRemote) {
        return latestRemote;
    }
    const localBranches = await (0, git_1.listBranches)(cwd);
    return findLatestReleaseBranch(localBranches, releasePrefix);
}
function findLatestReleaseBranch(branches, releasePrefix) {
    let latestBranch = null;
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
function extractReleaseDate(branch, releasePrefix) {
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
function formatDateStamp(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}${month}${day}`;
}
function toBranchSlug(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}
//# sourceMappingURL=extension.js.map