import * as vscode from "vscode";

import { getNonce } from "./utils";

export function getWebviewHtml(webview: vscode.Webview): string {
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

    .footer-actions {
      margin-bottom: 16px;
    }

    .footer-actions .row {
      margin-top: 6px;
    }

    .footer-actions button {
      padding: 6px 10px;
      font-size: 0.9em;
    }

    .config-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .config-missing-hint {
      color: var(--vscode-errorForeground);
      background-color: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      padding: 6px 8px;
      border-radius: 4px;
    }

    .config-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
    }

    .config-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .config-group-title {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .config-group-header .config-group-title {
      flex: 1;
    }

    .config-group-actions button {
      width: auto;
      padding: 4px 8px;
      font-size: 0.85em;
    }

    .footer-actions button.icon-button,
    .config-group-actions button.icon-button {
      font-size: 1.6em;
      line-height: 1;
    }

    .config-group-error {
      color: var(--vscode-errorForeground);
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
  <div class="footer-actions">
    <div class="row" id="refreshRow">
      <button id="refreshBtn" class="secondary" title="刷新配置" aria-label="刷新配置">⟳</button>
    </div>
    <div class="row" id="createConfigRow" hidden>
      <button id="createConfigBtn" class="secondary">创建配置文件</button>
    </div>
  </div>

  <div class="field">
    <div class="config-list" id="configList"></div>
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
    const refreshRow = document.getElementById('refreshRow');
    const refreshBtn = document.getElementById('refreshBtn');
    const createConfigRow = document.getElementById('createConfigRow');
    const createConfigBtn = document.getElementById('createConfigBtn');

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
      createConfigBtn.disabled = isBusy;
      const configButtons = configListEl.querySelectorAll('button');
      configButtons.forEach((button) => {
        button.disabled = isBusy;
      });
    }

    function appendConfigItems(container, items, repoRoot) {
      for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'config-item';
        const btn = document.createElement('button');
        btn.textContent = item.label || '执行合并';
        btn.addEventListener('click', () => {
          setBusy(true);
          setStatus('正在执行合并...', 'info');
          const payload = { type: 'merge', profileKey: item.key };
          if (repoRoot) {
            payload.repoRoot = repoRoot;
          }
          vscode.postMessage(payload);
        });
        itemEl.appendChild(btn);
        const summary = Array.isArray(item.summary) ? item.summary : [];
        if (summary.length > 0) {
          const pre = document.createElement('pre');
          pre.textContent = summary.join('\\n');
          itemEl.appendChild(pre);
        }
        container.appendChild(itemEl);
      }
    }

    function shouldShowCreateConfig(groups) {
      if (!Array.isArray(groups) || groups.length === 0) {
        return false;
      }
      return groups.some((group) => group && group.missingConfig);
    }

    function updateActionButtons(showCreate) {
      refreshRow.hidden = showCreate;
      createConfigRow.hidden = !showCreate;
    }

    function renderState(data) {
      const groups = Array.isArray(data.configGroups) ? data.configGroups : [];
      const items = Array.isArray(data.configSummary) ? data.configSummary : [];
      const error = data.configError || '';
      const uiLabels = data.uiLabels || {};
      const configLoaded = Boolean(data.configLoaded);
      const missingGroups = groups.filter((group) => group && group.missingConfig);
      const hasMissingConfig = missingGroups.length > 0;
      const refreshLabel = uiLabels.refreshLabel || '⟳';
      const isIconLabel = refreshLabel === '⟳';
      refreshBtn.textContent = refreshLabel;
      refreshBtn.title = isIconLabel ? '刷新配置' : refreshLabel;
      refreshBtn.setAttribute('aria-label', isIconLabel ? '刷新配置' : refreshLabel);
      refreshBtn.classList.toggle('icon-button', isIconLabel);
      configListEl.innerHTML = '';
      const showCreate = configLoaded && hasMissingConfig;
      updateActionButtons(showCreate);
      if (error) {
        const errorEl = document.createElement('div');
        errorEl.textContent = '配置错误: ' + error;
        configListEl.appendChild(errorEl);
        return;
      }
      if (!configLoaded) {
        const hintEl = document.createElement('div');
        hintEl.textContent = '请点击刷新图标读取配置。';
        configListEl.appendChild(hintEl);
        return;
      }
      if (missingGroups.length > 0) {
        const missingEl = document.createElement('div');
        missingEl.className = 'config-missing-hint';
        const labels = missingGroups.map(
          (group) => group.repoLabel || group.repoRoot || 'Git 项目'
        );
        missingEl.textContent = '缺少配置文件的仓库: ' + labels.join('、');
        configListEl.appendChild(missingEl);
      }
      if (groups.length === 1) {
        const group = groups[0] || {};
        if (group.error) {
          const groupError = document.createElement('div');
          groupError.textContent = '配置错误: ' + group.error;
          configListEl.appendChild(groupError);
          return;
        }
        const groupItems = Array.isArray(group.items) ? group.items : [];
        if (groupItems.length === 0) {
          const emptyEl = document.createElement('div');
          emptyEl.textContent = '未找到可用的合并配置。';
          configListEl.appendChild(emptyEl);
          return;
        }
        appendConfigItems(configListEl, groupItems, group.repoRoot);
        return;
      }
      if (groups.length > 1) {
        for (const group of groups) {
          const groupEl = document.createElement('div');
          groupEl.className = 'config-group';
          const label = group.repoLabel || group.repoRoot || 'Git 项目';
          const headerEl = document.createElement('div');
          headerEl.className = 'config-group-header';
          const titleEl = document.createElement('div');
          titleEl.className = 'config-group-title';
          titleEl.textContent = label;
          headerEl.appendChild(titleEl);
          if (!showCreate && group.repoRoot) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'config-group-actions';
            const refreshGroupBtn = document.createElement('button');
            refreshGroupBtn.className = 'secondary';
            refreshGroupBtn.textContent = refreshLabel;
            refreshGroupBtn.title = isIconLabel ? '刷新配置' : refreshLabel;
            refreshGroupBtn.setAttribute(
              'aria-label',
              isIconLabel ? '刷新配置' : refreshLabel
            );
            refreshGroupBtn.classList.toggle('icon-button', isIconLabel);
            refreshGroupBtn.addEventListener('click', () => {
              vscode.postMessage({
                type: 'refreshRepo',
                repoRoot: group.repoRoot,
              });
            });
            actionsEl.appendChild(refreshGroupBtn);
            headerEl.appendChild(actionsEl);
          }
          groupEl.appendChild(headerEl);
          if (group.error) {
            const groupError = document.createElement('div');
            groupError.className = 'config-group-error';
            groupError.textContent = '配置错误: ' + group.error;
            groupEl.appendChild(groupError);
          }
          const groupItems = Array.isArray(group.items) ? group.items : [];
          if (groupItems.length === 0 && !group.error) {
            const emptyEl = document.createElement('div');
            emptyEl.textContent = '未找到可用的合并配置。';
            groupEl.appendChild(emptyEl);
          } else {
            appendConfigItems(groupEl, groupItems, group.repoRoot);
          }
          configListEl.appendChild(groupEl);
        }
        return;
      }
      if (items.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.textContent = '未找到可用的合并配置。';
        configListEl.appendChild(emptyEl);
        return;
      }
      appendConfigItems(configListEl, items);
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
          html += '<p style=\"color: var(--vscode-errorForeground)\">⚠️ 回到原分支失败: ' + (result.checkoutError || '') + '</p>';
        } else {
           html += '<p>↩️ 已切回原分支: ' + result.currentBranch + '</p>';
        }

        if (result.pushStatus === 'ok') {
          html += '<p>🚀 已推送到远端: ' + result.pushRemote + '</p>';
        } else if (result.pushStatus === 'failed') {
          html += '<p style=\"color: var(--vscode-errorForeground)\">推送失败: ' + (result.pushError || '') + '</p>';
        }

        if (result.jenkinsStatus === 'ok') {
          html += '<p>🔔 Jenkins 已触发: ' + (result.jenkinsJob || '') + '</p>';
        } else if (result.jenkinsStatus === 'failed') {
          html += '<p style=\"color: var(--vscode-errorForeground)\">Jenkins 触发失败: ' + (result.jenkinsError || '') + '</p>';
        }

        if (Array.isArray(result.files) && result.files.length > 0) {
          html += '<div style=\"margin-top:8px;\"><strong>变更文件:</strong></div><ul>';
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
        html += '<p style=\"color: var(--vscode-errorForeground)\">错误: ' + result.errorMessage + '</p>';

        conflictContent.innerHTML = html;

        if (Array.isArray(result.conflicts) && result.conflicts.length > 0) {
            let conflictHtml = '<div style=\"margin-top:8px;\"><strong>冲突文件:</strong></div><ul>';
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

    createConfigBtn.addEventListener('click', () => {
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
