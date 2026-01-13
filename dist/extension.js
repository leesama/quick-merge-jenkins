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
const node_child_process_1 = require("node:child_process");
const http = __importStar(require("node:http"));
const https = __importStar(require("node:https"));
const path = __importStar(require("node:path"));
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const CONFIG_FILE_NAME = ".quick-merge.json";
const DEFAULT_UI_LABELS = {
    refreshLabel: "刷新配置",
    openConfigLabel: "打开配置文件",
};
let lastFailureContext = null;
let lastConflictFiles = [];
let lastWorkspaceRoot = null;
let lastConfigRoot = null;
let lastConfigItems = [];
let lastConfigError = "";
let lastUiLabels = DEFAULT_UI_LABELS;
let lastConfigLoaded = false;
function activate(context) {
    const provider = new QuickMergeViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(QuickMergeViewProvider.viewType, provider), vscode.commands.registerCommand("quick-merge.refresh", () => provider.refresh()), vscode.commands.registerCommand("quick-merge.openConflictFiles", () => provider.openConflictFiles()), vscode.commands.registerCommand("quick-merge.openMergeEditor", () => provider.openMergeEditor()), vscode.commands.registerCommand("quick-merge.openConfig", () => provider.openConfig()));
    setupDevAutoReload(context);
}
function deactivate() { }
class QuickMergeViewProvider {
    constructor(context) {
        this.context = context;
        this.watchRoot = null;
        this.watchDisposables = [];
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this.getHtml(view.webview);
        view.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === "requestState") {
                const loadConfig = Boolean(message?.loadConfig);
                await this.postState({ loadConfig });
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
                void this.postState({ loadConfig: false });
            }
        });
        void this.postState({ loadConfig: false });
    }
    refresh() {
        void this.postState({ loadConfig: true });
    }
    async openConflictFiles() {
        const cwd = lastWorkspaceRoot ?? getWorkspaceRoot();
        if (!cwd) {
            void vscode.window.showErrorMessage("未找到工作区，无法打开冲突文件列表。");
            return;
        }
        if (lastConflictFiles.length === 0) {
            void vscode.window.showInformationMessage("当前没有检测到冲突文件。");
            return;
        }
        const pick = await vscode.window.showQuickPick(lastConflictFiles, {
            placeHolder: "选择要打开的冲突文件",
        });
        if (!pick) {
            return;
        }
        const fileUri = vscode.Uri.file(path.join(cwd, pick));
        await vscode.window.showTextDocument(fileUri);
    }
    async openMergeEditor() {
        const cwd = lastWorkspaceRoot ?? getWorkspaceRoot();
        if (!cwd) {
            void vscode.window.showErrorMessage("未找到工作区，无法打开合并编辑器。");
            return;
        }
        if (lastConflictFiles.length === 0) {
            void vscode.window.showInformationMessage("当前没有检测到冲突文件。");
            return;
        }
        let target = lastConflictFiles[0];
        if (lastConflictFiles.length > 1) {
            const pick = await vscode.window.showQuickPick(lastConflictFiles, {
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
        const cwd = getWorkspaceRoot();
        if (!cwd) {
            void vscode.window.showErrorMessage("未找到工作区，无法打开配置文件。");
            return;
        }
        const configUri = vscode.Uri.file(path.join(cwd, CONFIG_FILE_NAME));
        try {
            await vscode.workspace.fs.stat(configUri);
        }
        catch {
            const template = getDefaultConfigTemplate();
            const content = Buffer.from(JSON.stringify(template, null, 2));
            await vscode.workspace.fs.writeFile(configUri, content);
        }
        const doc = await vscode.workspace.openTextDocument(configUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        await this.postState({ loadConfig: false });
    }
    async checkoutOriginal() {
        if (!lastFailureContext) {
            void vscode.window.showInformationMessage("没有需要返回的原分支。");
            return;
        }
        try {
            await runGit(["checkout", lastFailureContext.originalBranch], lastFailureContext.cwd);
            lastFailureContext = null;
            lastConflictFiles = [];
            await this.postState({ loadConfig: false });
            this.postMessage({
                type: "info",
                message: "已返回原分支。",
            });
        }
        catch (error) {
            this.postMessage({
                type: "error",
                message: `返回原分支失败：${getErrorMessage(error)}`,
            });
        }
    }
    async handleMerge(message) {
        const cwd = getWorkspaceRoot();
        if (!cwd) {
            this.postMessage({
                type: "error",
                message: "未找到工作区，请先打开一个包含 Git 仓库的文件夹。",
            });
            return;
        }
        lastWorkspaceRoot = cwd;
        this.postMessage({
            type: "mergeStarted",
            message: "正在执行合并...",
        });
        try {
            const profileKey = typeof message?.profileKey === "string" ? message.profileKey : undefined;
            const plan = await loadMergePlan(cwd, profileKey);
            const result = await performMerge(cwd, plan);
            if (result.status === "failed") {
                lastFailureContext = {
                    originalBranch: result.currentBranch,
                    targetBranch: result.targetBranch,
                    cwd,
                };
                lastConflictFiles = result.conflicts;
            }
            else {
                lastFailureContext = null;
                lastConflictFiles = [];
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
                message: getErrorMessage(error),
            });
        }
    }
    async postState(options) {
        const cwd = getWorkspaceRoot();
        const loadConfig = options?.loadConfig ?? false;
        if (!cwd) {
            this.disposeGitWatchers();
            lastConfigRoot = null;
            lastConfigItems = [];
            lastConfigError = "";
            lastUiLabels = DEFAULT_UI_LABELS;
            lastConfigLoaded = false;
            this.postMessage({
                type: "state",
                currentBranch: "",
                configSummary: [],
                configError: "未找到工作区。",
                uiLabels: DEFAULT_UI_LABELS,
                configLoaded: false,
            });
            return;
        }
        lastWorkspaceRoot = cwd;
        if (lastConfigRoot !== cwd) {
            lastConfigRoot = cwd;
            lastConfigItems = [];
            lastConfigError = "";
            lastUiLabels = DEFAULT_UI_LABELS;
            lastConfigLoaded = false;
        }
        this.setupGitWatchers(cwd);
        try {
            const [currentBranch, remotes] = await Promise.all([
                getCurrentBranch(cwd),
                listRemotes(cwd),
            ]);
            if (loadConfig) {
                const { items, error, uiLabels } = await getConfigSummary(cwd, currentBranch, remotes);
                lastConfigItems = items;
                lastConfigError = error;
                lastUiLabels = uiLabels;
                lastConfigLoaded = true;
            }
            this.postMessage({
                type: "state",
                currentBranch,
                configSummary: lastConfigItems,
                configError: lastConfigError,
                uiLabels: lastUiLabels,
                configLoaded: lastConfigLoaded,
            });
        }
        catch (error) {
            this.postMessage({
                type: "error",
                message: getErrorMessage(error),
            });
        }
    }
    setupGitWatchers(cwd) {
        if (this.watchRoot === cwd) {
            return;
        }
        this.disposeGitWatchers();
        this.watchRoot = cwd;
        const patterns = [
            new vscode.RelativePattern(cwd, ".git/HEAD"),
            new vscode.RelativePattern(cwd, ".git/packed-refs"),
            new vscode.RelativePattern(cwd, ".git/refs/heads/**"),
        ];
        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            const onChange = () => void this.postState();
            watcher.onDidChange(onChange);
            watcher.onDidCreate(onChange);
            watcher.onDidDelete(onChange);
            this.watchDisposables.push(watcher);
            this.context.subscriptions.push(watcher);
        }
    }
    disposeGitWatchers() {
        for (const disposable of this.watchDisposables) {
            disposable.dispose();
        }
        this.watchDisposables = [];
        this.watchRoot = null;
    }
    postMessage(message) {
        void this.view?.webview.postMessage(message);
    }
    getHtml(webview) {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Merge</title>
  <style>
    :root {
      --container-paddding: 20px;
      --input-padding-vertical: 6px;
      --input-padding-horizontal: 8px;
      --input-margin-vertical: 6px;
      --label-margin-vertical: 4px;
    }

    body {
      padding: var(--container-paddding);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
    }

    h2 {
      font-size: 1.2rem;
      font-weight: 600;
      margin: 0 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .field {
      margin-bottom: 16px;
    }

    label {
      display: block;
      margin-bottom: var(--label-margin-vertical);
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
    }

    select {
      width: 100%;
      padding: var(--input-padding-vertical) var(--input-padding-horizontal);
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      outline: none;
      box-sizing: border-box;
      border-radius: 2px;
    }

    select:focus {
      border-color: var(--vscode-focusBorder);
    }

    button {
      width: 100%;
      padding: 8px 12px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      outline: none;
      cursor: pointer;
      font-family: inherit;
      border-radius: 2px;
    }

    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .row {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }

    .row button {
      flex: 1;
    }

    .config-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .config-item {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      padding: 10px;
      background-color: var(--vscode-editor-background);
    }

    .config-item button {
      width: 100%;
      text-align: left;
    }

    .config-item pre {
      margin-top: 8px;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }

    .current-branch-display {
      font-family: var(--vscode-editor-font-family);
      background-color: var(--vscode-textBlockQuote-background);
      padding: 8px;
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      margin-top: 4px;
    }

    .status {
      margin-top: 16px;
      padding: 10px;
      border-radius: 3px;
    }

    .status:empty {
      display: none;
    }

    .section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
      animation: fadeIn 0.3s ease-in-out;
    }

    .section-title {
      font-weight: 600;
      margin-bottom: 10px;
      display: block;
      font-size: 1.1em;
    }

    .result-content, .conflict-content {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 12px;
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    ul {
      margin: 8px 0 0 20px;
      padding: 0;
    }

    li {
      margin-bottom: 4px;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="field">
    <label>合并配置</label>
    <div class="config-list" id="configList"></div>
  </div>

  <div class="row">
    <button id="refreshBtn" class="secondary">刷新配置</button>
  </div>
  <div class="row">
    <button id="openConfigBtn" class="secondary">打开配置文件</button>
  </div>

  <div class="status" id="status"></div>

  <div class="section" id="resultSection" hidden>
    <span class="section-title">合并结果</span>
    <div class="result-content" id="resultContent"></div>
  </div>

  <div class="section" id="conflictSection" hidden>
    <span class="section-title">⚠️ 发现冲突</span>
    <div class="conflict-content" id="conflictContent"></div>
    <div class="row">
      <button id="openConflictFiles" class="secondary">查看冲突文件</button>
      <button id="openMergeEditor" class="secondary">打开合并编辑器</button>
    </div>
    <div class="row">
      <button id="checkoutOriginal" class="secondary">放弃合并 (回到原分支)</button>
      <button id="stayOnTarget">保留当前状态 (解决冲突)</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const configListEl = document.getElementById('configList');
    const statusEl = document.getElementById('status');
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    const conflictSection = document.getElementById('conflictSection');
    const conflictContent = document.getElementById('conflictContent');
    const refreshBtn = document.getElementById('refreshBtn');
    const openConfigBtn = document.getElementById('openConfigBtn');

    function setStatus(text, type = 'info') {
      statusEl.textContent = text || '';
      statusEl.className = 'status'; // reset
      if (text) {
        statusEl.classList.add(type);
        if (type === 'error') {
            statusEl.style.backgroundColor = 'var(--vscode-inputValidation-errorBackground)';
            statusEl.style.border = '1px solid var(--vscode-inputValidation-errorBorder)';
        } else if (type === 'success') {
            // No strict standard var for success bg, use block quote or diff insert
            statusEl.style.backgroundColor = 'var(--vscode-diffEditor-insertedTextBackground)';
            statusEl.style.border = '1px solid transparent';
        } else {
            statusEl.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
            statusEl.style.border = 'none';
        }
      } else {
          statusEl.style.backgroundColor = 'transparent';
          statusEl.style.border = 'none';
      }
    }

    function setBusy(isBusy) {
      refreshBtn.disabled = isBusy;
      openConfigBtn.disabled = isBusy;
      const configButtons = configListEl.querySelectorAll('button');
      configButtons.forEach((button) => {
        button.disabled = isBusy;
      });
    }

    function renderState(data) {
      const items = Array.isArray(data.configSummary) ? data.configSummary : [];
      const error = data.configError || '';
      const uiLabels = data.uiLabels || {};
      const configLoaded = Boolean(data.configLoaded);
      refreshBtn.textContent = uiLabels.refreshLabel || '刷新配置';
      openConfigBtn.textContent = uiLabels.openConfigLabel || '打开配置文件';
      configListEl.innerHTML = '';
      if (error) {
        const errorEl = document.createElement('div');
        errorEl.textContent = '配置错误: ' + error;
        configListEl.appendChild(errorEl);
        return;
      }
      if (!configLoaded) {
        const hintEl = document.createElement('div');
        hintEl.textContent = '请点击“刷新配置”读取配置。';
        configListEl.appendChild(hintEl);
        return;
      }
      if (items.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.textContent = '未找到可用的合并配置。';
        configListEl.appendChild(emptyEl);
        return;
      }
      for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'config-item';
        const btn = document.createElement('button');
        btn.textContent = item.label || '执行合并';
        btn.addEventListener('click', () => {
          setBusy(true);
          setStatus('正在执行合并...', 'info');
          vscode.postMessage({ type: 'merge', profileKey: item.key });
        });
        itemEl.appendChild(btn);
        const summary = Array.isArray(item.summary) ? item.summary : [];
        if (summary.length > 0) {
          const pre = document.createElement('pre');
          pre.textContent = summary.join('\\n');
          itemEl.appendChild(pre);
        }
        configListEl.appendChild(itemEl);
      }
    }

    function renderResult(result) {
      if (result.status === 'success') {
        resultSection.hidden = false;
        conflictSection.hidden = true;
        
        let html = '';
        html += '<p><strong>✅ 合并成功</strong></p>';
        html += '<p>目标分支: ' + result.targetBranch + '</p>';
        html += '<p>Head Commit: ' + result.headCommit + (result.isMergeCommit ? ' (Merge Commit)' : '') + '</p>';
        html += '<p>耗时: ' + Math.round(result.durationMs) + ' ms</p>';
        
        if (result.checkoutBack === 'failed') {
          html += '<p style="color: var(--vscode-errorForeground)">⚠️ 回到原分支失败: ' + (result.checkoutError || '') + '</p>';
        } else {
           html += '<p>↩️ 已切回原分支: ' + result.currentBranch + '</p>';
        }

        if (result.pushStatus === 'ok') {
          html += '<p>🚀 已推送到远端: ' + result.pushRemote + '</p>';
        } else if (result.pushStatus === 'failed') {
          html += '<p style="color: var(--vscode-errorForeground)">推送失败: ' + (result.pushError || '') + '</p>';
        }

        if (result.jenkinsStatus === 'ok') {
          html += '<p>🔔 Jenkins 已触发: ' + (result.jenkinsJob || '') + '</p>';
        } else if (result.jenkinsStatus === 'failed') {
          html += '<p style="color: var(--vscode-errorForeground)">Jenkins 触发失败: ' + (result.jenkinsError || '') + '</p>';
        }

        if (Array.isArray(result.files) && result.files.length > 0) {
          html += '<div style="margin-top:8px;"><strong>变更文件:</strong></div><ul>';
          for (const file of result.files) {
            html += '<li>' + file + '</li>';
          }
          html += '</ul>';
        }

        resultContent.innerHTML = html;
        const pushState = result.pushStatus === 'ok'
          ? '成功'
          : result.pushStatus === 'failed'
            ? '失败'
            : '跳过';
        const jenkinsState = result.jenkinsStatus === 'ok'
          ? '成功'
          : result.jenkinsStatus === 'failed'
            ? '失败'
            : '跳过';
        const checkoutState = result.checkoutBack === 'ok' ? '成功' : '失败';
        const hasFailure =
          result.checkoutBack === 'failed' ||
          result.pushStatus === 'failed' ||
          result.jenkinsStatus === 'failed';
        const statusText =
          '合并: 成功 | 推送: ' +
          pushState +
          ' | Jenkins: ' +
          jenkinsState +
          ' | 切回: ' +
          checkoutState;
        const statusType = hasFailure ? 'error' : 'success';
        setStatus(statusText, statusType);
      }
      if (result.status === 'failed') {
        resultSection.hidden = true;
        conflictSection.hidden = false;
        
        let html = '';
        html += '<p>目标分支: ' + result.targetBranch + '</p>';
        html += '<p style="color: var(--vscode-errorForeground)">错误: ' + result.errorMessage + '</p>';
        
        conflictContent.innerHTML = html;

        if (Array.isArray(result.conflicts) && result.conflicts.length > 0) {
            let conflictHtml = '<div style="margin-top:8px;"><strong>冲突文件:</strong></div><ul>';
            for (const file of result.conflicts) {
                conflictHtml += '<li>' + file + '</li>';
            }
            conflictHtml += '</ul>';
            conflictContent.innerHTML += conflictHtml;
        }
        
        setStatus('合并: 失败 | 推送: 未执行 | Jenkins: 未执行 | 切回: 未执行', 'error');
      }
    }

    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestState', loadConfig: true });
    });

    openConfigBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openConfig' });
    });

    document.getElementById('openConflictFiles').addEventListener('click', () => {
      vscode.postMessage({ type: 'openConflictFiles' });
    });

    document.getElementById('openMergeEditor').addEventListener('click', () => {
      vscode.postMessage({ type: 'openMergeEditor' });
    });

    document.getElementById('checkoutOriginal').addEventListener('click', () => {
      vscode.postMessage({ type: 'checkoutOriginal' });
    });

    document.getElementById('stayOnTarget').addEventListener('click', () => {
      setStatus('已留在目标分支处理冲突。', 'info');
      conflictSection.hidden = true; // Optionally hide conflict buttons if they decide to stay
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        renderState(message);
        setBusy(false);
        return;
      }
      if (message.type === 'mergeStarted') {
        setStatus(message.message || '正在执行合并...', 'info');
        setBusy(true);
        return;
      }
      if (message.type === 'result') {
        renderResult(message.result);
        setBusy(false);
        return;
      }
      if (message.type === 'error') {
        setStatus(message.message || '发生错误。', 'error');
        setBusy(false);
        return;
      }
      if (message.type === 'info') {
        setStatus(message.message || '', 'info');
        setBusy(false);
        return;
      }
    });

    vscode.postMessage({ type: 'requestState', loadConfig: false });
  </script>
</body>
</html>`;
    }
}
QuickMergeViewProvider.viewType = "quickMergeView";
async function performMerge(cwd, plan) {
    const start = Date.now();
    const currentBranch = plan.currentBranch;
    const targetBranch = plan.targetBranch;
    await runGit(["checkout", targetBranch], cwd);
    const targetBefore = await getHeadCommit(cwd);
    try {
        const args = ["merge"];
        if (plan.strategyFlag) {
            args.push(plan.strategyFlag);
        }
        args.push(plan.sourceBranch);
        await runGit(args, cwd);
    }
    catch (error) {
        const conflicts = await listConflicts(cwd).catch(() => []);
        return {
            status: "failed",
            currentBranch,
            targetBranch,
            errorMessage: getErrorMessage(error),
            conflicts,
            durationMs: Date.now() - start,
        };
    }
    const headCommit = await getHeadCommit(cwd);
    const parentCount = await getCommitParentCount(headCommit, cwd);
    const files = await listChangedFiles(targetBefore, headCommit, cwd).catch(() => []);
    let pushStatus = "skipped";
    let pushError;
    if (plan.pushAfterMerge && plan.pushRemote) {
        try {
            await runGit(["push", plan.pushRemote, targetBranch], cwd);
            pushStatus = "ok";
        }
        catch (error) {
            pushStatus = "failed";
            pushError = getErrorMessage(error);
        }
    }
    let jenkinsStatus = "skipped";
    let jenkinsError;
    let jenkinsJob;
    if (plan.jenkins) {
        jenkinsJob = plan.jenkins.job;
        try {
            await triggerJenkinsBuild(plan.jenkins, {
                sourceBranch: plan.sourceBranch,
                targetBranch,
                currentBranch,
                mergeCommit: headCommit,
                strategy: plan.strategyLabel,
                pushRemote: plan.pushRemote || "",
            });
            jenkinsStatus = "ok";
        }
        catch (error) {
            jenkinsStatus = "failed";
            jenkinsError = getErrorMessage(error);
        }
    }
    let checkoutBack = "ok";
    let checkoutError;
    try {
        await runGit(["checkout", currentBranch], cwd);
    }
    catch (error) {
        checkoutBack = "failed";
        checkoutError = getErrorMessage(error);
    }
    return {
        status: "success",
        currentBranch,
        targetBranch,
        headCommit,
        isMergeCommit: parentCount > 1,
        files,
        durationMs: Date.now() - start,
        checkoutBack,
        checkoutError,
        pushStatus,
        pushRemote: plan.pushAfterMerge ? plan.pushRemote || undefined : undefined,
        pushError,
        jenkinsStatus,
        jenkinsJob,
        jenkinsError,
    };
}
async function loadMergePlan(cwd, profileKey) {
    const [currentBranch, remotes] = await Promise.all([
        getCurrentBranch(cwd),
        listRemotes(cwd),
    ]);
    if (!currentBranch) {
        throw new Error("无法获取当前分支。");
    }
    const configFile = await readMergeConfig(cwd);
    const { profiles } = normalizeConfigFile(configFile);
    const profile = selectProfile(profiles, profileKey);
    return resolveMergePlan(profile, currentBranch, remotes);
}
async function getConfigSummary(cwd, currentBranch, remotes) {
    try {
        const configFile = await readMergeConfig(cwd);
        const normalized = normalizeConfigFile(configFile);
        const items = normalized.profiles.map((profile, index) => {
            const key = getProfileKey(profile, index);
            const label = getProfileLabel(profile, index);
            try {
                const plan = resolveMergePlan(profile, currentBranch, remotes);
                return {
                    key,
                    label: planLabel(label, plan),
                    summary: buildConfigSummary(plan),
                };
            }
            catch (error) {
                return {
                    key,
                    label,
                    summary: [`配置错误: ${getErrorMessage(error)}`],
                };
            }
        });
        return { items, error: "", uiLabels: normalized.uiLabels };
    }
    catch (error) {
        return {
            items: [],
            error: getErrorMessage(error),
            uiLabels: DEFAULT_UI_LABELS,
        };
    }
}
async function readMergeConfig(cwd) {
    const configUri = vscode.Uri.file(path.join(cwd, CONFIG_FILE_NAME));
    let content;
    try {
        content = await vscode.workspace.fs.readFile(configUri);
    }
    catch {
        throw new Error(`未找到配置文件 ${CONFIG_FILE_NAME}。`);
    }
    try {
        const parsed = JSON.parse(Buffer.from(content).toString("utf8"));
        if (!parsed || typeof parsed !== "object") {
            throw new Error("配置内容必须是 JSON 对象。");
        }
        return parsed;
    }
    catch (error) {
        throw new Error(`配置文件 ${CONFIG_FILE_NAME} 解析失败。`);
    }
}
function resolveMergePlan(config, currentBranch, remotes) {
    const targetBranch = (config.targetBranch ?? "").trim();
    if (!targetBranch) {
        throw new Error("配置缺少 targetBranch。");
    }
    const sourceBranch = (config.sourceBranch ?? "").trim() || currentBranch;
    if (!sourceBranch) {
        throw new Error("无法确定源分支。");
    }
    if (sourceBranch === targetBranch) {
        throw new Error("源分支和目标分支不能相同。");
    }
    const strategyInfo = normalizeStrategy(config.strategy);
    const pushAfterMerge = config.pushAfterMerge !== false;
    let pushRemote = null;
    if (pushAfterMerge) {
        const desiredRemote = (config.pushRemote ?? "").trim();
        const defaultRemote = getDefaultRemote(remotes);
        if (desiredRemote) {
            if (remotes.length > 0 && !remotes.includes(desiredRemote)) {
                throw new Error(`远端 ${desiredRemote} 不存在。`);
            }
            pushRemote = desiredRemote;
        }
        else {
            pushRemote = defaultRemote;
        }
        if (!pushRemote) {
            throw new Error("未找到可用远端，无法推送。");
        }
    }
    let jenkins;
    if (config.jenkins && config.jenkins.enabled !== false) {
        if (!config.jenkins.url || !config.jenkins.job) {
            throw new Error("Jenkins 配置缺少 url 或 job。");
        }
        jenkins = config.jenkins;
    }
    return {
        currentBranch,
        sourceBranch,
        targetBranch,
        strategyFlag: strategyInfo.flag,
        strategyLabel: strategyInfo.label,
        pushAfterMerge,
        pushRemote,
        jenkins,
    };
}
function normalizeConfigFile(configFile) {
    const uiLabels = normalizeUiLabels(configFile.ui ?? configFile.buttons);
    if (!Array.isArray(configFile.profiles) || configFile.profiles.length === 0) {
        throw new Error("配置文件必须包含 profiles。");
    }
    const profiles = configFile.profiles;
    return { uiLabels, profiles };
}
function normalizeUiLabels(input) {
    return {
        refreshLabel: input?.refreshLabel || DEFAULT_UI_LABELS.refreshLabel,
        openConfigLabel: input?.openConfigLabel || DEFAULT_UI_LABELS.openConfigLabel,
    };
}
function selectProfile(profiles, profileKey) {
    if (profiles.length === 0) {
        throw new Error("没有可用的合并配置。");
    }
    if (!profileKey) {
        if (profiles.length === 1) {
            return profiles[0];
        }
        throw new Error("未指定合并配置。");
    }
    const byId = profiles.find((profile) => profile.id?.trim() === profileKey);
    if (byId) {
        return byId;
    }
    const index = Number(profileKey);
    if (Number.isInteger(index) && index >= 0 && index < profiles.length) {
        return profiles[index];
    }
    throw new Error("未找到匹配的合并配置。");
}
function getProfileKey(profile, index) {
    const id = (profile.id ?? "").trim();
    if (id) {
        return id;
    }
    return String(index);
}
function getProfileLabel(profile, index) {
    const label = (profile.label ?? "").trim();
    if (label) {
        return label;
    }
    const id = (profile.id ?? "").trim();
    if (id) {
        return id;
    }
    return `合并配置 ${index + 1}`;
}
function planLabel(label, plan) {
    if (label) {
        return label;
    }
    return `${plan.sourceBranch} -> ${plan.targetBranch}`;
}
function normalizeStrategy(value) {
    const normalized = (value ?? "").trim();
    if (!normalized || normalized === "merge" || normalized === "default") {
        return { flag: "", label: "default" };
    }
    if (normalized === "--no-ff" || normalized === "no-ff" || normalized === "no_ff") {
        return { flag: "--no-ff", label: "--no-ff" };
    }
    if (normalized === "--ff-only" ||
        normalized === "ff-only" ||
        normalized === "ff_only") {
        return { flag: "--ff-only", label: "--ff-only" };
    }
    throw new Error("合并策略无效。");
}
function buildConfigSummary(plan) {
    const lines = [
        `源分支: ${plan.sourceBranch}`,
        `目标分支: ${plan.targetBranch}`,
        `合并策略: ${plan.strategyLabel}`,
        `推送远端: ${plan.pushAfterMerge ? plan.pushRemote ?? "-" : "不推送"}`,
    ];
    if (plan.jenkins) {
        lines.push(`Jenkins: ${plan.jenkins.job}`);
    }
    else {
        lines.push("Jenkins: 未启用");
    }
    return lines;
}
function getDefaultConfigTemplate() {
    return {
        ui: {
            refreshLabel: "刷新配置",
            openConfigLabel: "打开配置文件",
        },
        profiles: [
            {
                id: "merge-main",
                label: "合并到 main",
                sourceBranch: "",
                targetBranch: "main",
                strategy: "default",
                pushAfterMerge: true,
                pushRemote: "origin",
                jenkins: {
                    enabled: false,
                    url: "https://jenkins.example.com",
                    job: "folder/jobName",
                    token: "",
                    user: "",
                    apiToken: "",
                    crumb: true,
                    parameters: {
                        SOURCE_BRANCH: "${sourceBranch}",
                        TARGET_BRANCH: "${targetBranch}",
                        MERGE_COMMIT: "${mergeCommit}",
                    },
                },
            },
            {
                id: "merge-release",
                label: "合并到 release",
                sourceBranch: "",
                targetBranch: "release",
                strategy: "no-ff",
                pushAfterMerge: true,
                pushRemote: "origin"
            }
        ]
    };
}
function getDefaultRemote(remotes) {
    if (remotes.includes("origin")) {
        return "origin";
    }
    return remotes[0] ?? null;
}
async function triggerJenkinsBuild(config, context) {
    const baseUrl = config.url.replace(/\/+$/, "");
    const jobPath = getJenkinsJobPath(config.job);
    const params = buildJenkinsParams(config.parameters, context);
    const hasParams = Object.keys(params).length > 0;
    const endpoint = hasParams ? "buildWithParameters" : "build";
    const url = new URL(`${baseUrl}${jobPath}/${endpoint}`);
    if (config.token) {
        url.searchParams.append("token", config.token);
    }
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
    }
    const headers = {};
    if (config.user && config.apiToken) {
        const token = Buffer.from(`${config.user}:${config.apiToken}`).toString("base64");
        headers.Authorization = `Basic ${token}`;
    }
    if (config.crumb) {
        const crumb = await getJenkinsCrumb(baseUrl, headers);
        headers[crumb.field] = crumb.value;
    }
    const response = await httpRequest(url.toString(), {
        method: "POST",
        headers,
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`Jenkins 触发失败 (${response.statusCode}) ${response.body}`.trim());
    }
}
async function getJenkinsCrumb(baseUrl, headers) {
    const url = new URL(`${baseUrl}/crumbIssuer/api/json`);
    const response = await httpRequest(url.toString(), {
        method: "GET",
        headers,
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`获取 Jenkins Crumb 失败 (${response.statusCode})`);
    }
    const data = JSON.parse(response.body || "{}");
    if (!data.crumbRequestField || !data.crumb) {
        throw new Error("Jenkins Crumb 返回数据无效。");
    }
    return { field: data.crumbRequestField, value: data.crumb };
}
function getJenkinsJobPath(job) {
    const segments = job.split("/").map((part) => part.trim()).filter(Boolean);
    if (segments.length === 0) {
        throw new Error("Jenkins job 不能为空。");
    }
    return `/job/${segments.map(encodeURIComponent).join("/job/")}`;
}
function buildJenkinsParams(parameters, context) {
    const result = {};
    if (!parameters) {
        return result;
    }
    for (const [key, value] of Object.entries(parameters)) {
        result[key] = interpolateTemplate(String(value), context);
    }
    return result;
}
function interpolateTemplate(input, context) {
    return input.replace(/\\$\\{(\\w+)\\}/g, (_, key) => context[key] ?? "");
}
async function httpRequest(url, options) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const transport = target.protocol === "https:" ? https : http;
        const req = transport.request(target, {
            method: options.method,
            headers: options.headers,
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode || 0,
                    body: Buffer.concat(chunks).toString("utf8"),
                });
            });
        });
        req.on("error", reject);
        req.end();
    });
}
async function listBranches(cwd) {
    const result = await runGit(["branch", "--format=%(refname:short)"], cwd);
    return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function listRemotes(cwd) {
    const result = await runGit(["remote"], cwd);
    return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function listConflicts(cwd) {
    const result = await runGit(["diff", "--name-only", "--diff-filter=U"], cwd);
    return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function getCurrentBranch(cwd) {
    const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    return result.stdout.trim();
}
async function getHeadCommit(cwd) {
    const result = await runGit(["rev-parse", "HEAD"], cwd);
    return result.stdout.trim();
}
async function getCommitParentCount(commit, cwd) {
    const result = await runGit(["rev-list", "--parents", "-n", "1", commit], cwd);
    const parts = result.stdout.split(" ").filter(Boolean);
    return Math.max(0, parts.length - 1);
}
async function listChangedFiles(before, after, cwd) {
    if (!before || !after || before === after) {
        return [];
    }
    const result = await runGit(["diff", "--name-only", `${before}..${after}`], cwd);
    return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function runGit(args, cwd) {
    try {
        const { stdout, stderr } = await execFileAsync("git", args, { cwd });
        return {
            stdout: stdout?.toString().trim() ?? "",
            stderr: stderr?.toString().trim() ?? "",
        };
    }
    catch (error) {
        const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
        const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
        const message = stderr || stdout || error?.message || "Git 命令执行失败。";
        const err = new Error(message);
        err.stderr = stderr;
        err.stdout = stdout;
        throw err;
    }
}
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }
    if (folders.length === 1) {
        return folders[0].uri.fsPath;
    }
    const activeUri = vscode.window.activeTextEditor?.document?.uri;
    if (activeUri) {
        const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
        if (activeFolder) {
            return activeFolder.uri.fsPath;
        }
    }
    if (lastWorkspaceRoot) {
        const matched = folders.find((folder) => folder.uri.fsPath === lastWorkspaceRoot);
        if (matched) {
            return matched.uri.fsPath;
        }
    }
    return folders[0].uri.fsPath;
}
function getErrorMessage(error) {
    if (!error) {
        return "未知错误。";
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i += 1) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
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