import * as vscode from "vscode";

import { getLocale, getWebviewStrings } from "./i18n";
import { getNonce } from "./utils";

export function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const strings = getWebviewStrings();
  const i18nJson = JSON.stringify(strings);
  const lang = getLocale() === "zh" ? "zh-CN" : "en";
  return `<!DOCTYPE html>
<html lang="${lang}">
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
      cursor: pointer;
    }

    .config-group-header .config-group-title {
      flex: 1;
    }


    .config-group-demand {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .config-group-demand button {
      width: 100%;
      padding: 6px 10px;
      font-size: 0.9em;
    }

    .config-group-deploy {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .config-group-deploy button {
      width: 100%;
      padding: 6px 10px;
      font-size: 0.9em;
    }

    .config-group-squash {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .config-group-squash button {
      width: 100%;
      padding: 6px 10px;
      font-size: 0.9em;
    }

    .config-group-prod {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .config-group-prod button {
      width: 100%;
      padding: 6px 10px;
      font-size: 0.9em;
    }


    .config-group-error {
      color: var(--vscode-errorForeground);
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
    <div class="row">
      <button id="createConfigBtn" class="secondary">${strings.createConfigLabel}</button>
    </div>
  </div>

  <div class="field">
    <div class="config-list" id="configList"></div>
  </div>

  <div class="status" id="status"></div>

  <div class="section" id="resultSection" hidden>
    <span class="section-title">${strings.mergeResultTitle}</span>
    <div class="result-content" id="resultContent"></div>
  </div>

  <div class="section" id="conflictSection" hidden>
    <span class="section-title">${strings.conflictTitle}</span>
    <div class="conflict-content" id="conflictContent"></div>
    <div class="row">
      <button id="openConflictFiles" class="secondary">${strings.openConflictFiles}</button>
      <button id="openMergeEditor" class="secondary">${strings.openMergeEditor}</button>
    </div>
    <div class="row">
      <button id="checkoutOriginal" class="secondary">${strings.checkoutOriginal}</button>
      <button id="stayOnTarget">${strings.stayOnTarget}</button>
    </div>
  </div>


  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const i18n = ${i18nJson};
    const configListEl = document.getElementById('configList');
    const statusEl = document.getElementById('status');
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    const conflictSection = document.getElementById('conflictSection');
    const conflictContent = document.getElementById('conflictContent');
    const createConfigBtn = document.getElementById('createConfigBtn');

    function format(template, params) {
      if (!params) {
        return template;
      }
      return template.replace(/\\{(\\w+)\\}/g, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
          return params[key];
        }
        return match;
      });
    }

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
      const buttons = document.querySelectorAll('button');
      buttons.forEach((button) => {
        if (isBusy) {
          button.dataset.wasDisabled = button.disabled ? 'true' : 'false';
          button.disabled = true;
        } else {
          const wasDisabled = button.dataset.wasDisabled === 'true';
          button.disabled = wasDisabled;
          delete button.dataset.wasDisabled;
        }
      });
    }

    function appendDemandButton(container, repoRoot) {
      if (!repoRoot) {
        return;
      }
      const actionsEl = document.createElement('div');
      actionsEl.className = 'config-group-demand';
      const demandBtn = document.createElement('button');
      demandBtn.className = 'secondary';
      demandBtn.textContent = i18n.demandCreate;
      demandBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'createDemandBranch', repoRoot });
      });
      actionsEl.appendChild(demandBtn);
      container.appendChild(actionsEl);
    }

    function appendSquashButton(container, repoRoot) {
      if (!repoRoot) {
        return;
      }
      const actionsEl = document.createElement('div');
      actionsEl.className = 'config-group-squash';
      
      const rebaseBtn = document.createElement('button');
      rebaseBtn.className = 'secondary';
      rebaseBtn.textContent = i18n.rebaseSquash;
      rebaseBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'rebaseSquash', repoRoot });
      });
      actionsEl.appendChild(rebaseBtn);

      const deployProdBtn = document.createElement('button');
      deployProdBtn.className = 'secondary';
      deployProdBtn.textContent = i18n.deployProdLabel;
      deployProdBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'deployProd', repoRoot });
      });
      actionsEl.appendChild(deployProdBtn);

      const squashDeployProdBtn = document.createElement('button');
      squashDeployProdBtn.className = 'secondary';
      squashDeployProdBtn.textContent = i18n.squashDeployProdLabel;
      squashDeployProdBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'squashDeployProd', repoRoot });
      });
      actionsEl.appendChild(squashDeployProdBtn);

      container.appendChild(actionsEl);
    }

    function appendDeployButton(container, repoRoot, deployInfo) {
      if (!repoRoot) {
        return;
      }
      const deployMeta = deployInfo || {
        label: i18n.deployTestLabel,
        enabled: false,
        error: i18n.deployTestMissingConfig,
      };
      const canClick = deployMeta.enabled || Boolean(deployMeta.error);
      const actionsEl = document.createElement('div');
      actionsEl.className = 'config-group-deploy';

      // 提交代码按钮
      const commitBtn = document.createElement('button');
      commitBtn.className = 'secondary';
      commitBtn.textContent = i18n.demandCommit;
      commitBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'commitDemand', repoRoot });
      });
      actionsEl.appendChild(commitBtn);

      // Deploy to test 按钮
      const deployBtn = document.createElement('button');
      deployBtn.className = 'secondary';
      deployBtn.textContent = deployMeta.label || i18n.deployTestLabel;
      if (!canClick) {
        deployBtn.disabled = true;
      }
      if (deployMeta.error) {
        deployBtn.title = deployMeta.error;
      }
      deployBtn.addEventListener('click', () => {
        if (!canClick) {
          return;
        }
        const label = deployBtn.textContent || i18n.deployTestLabel;
        if (!deployMeta.enabled) {
          vscode.postMessage({ type: 'deployTest', repoRoot, label });
          return;
        }
        vscode.postMessage({ type: 'confirmDeployTest', repoRoot, label });
      });
      actionsEl.appendChild(deployBtn);

      // Commit & Deploy to test 按钮
      const commitAndDeployBtn = document.createElement('button');
      commitAndDeployBtn.className = 'secondary';
      commitAndDeployBtn.textContent = i18n.commitAndDeploy;
      if (!canClick) {
        commitAndDeployBtn.disabled = true;
      }
      if (deployMeta.error) {
        commitAndDeployBtn.title = deployMeta.error;
      }
      commitAndDeployBtn.addEventListener('click', () => {
        if (!canClick) {
          return;
        }
        vscode.postMessage({ type: 'confirmCommitAndDeploy', repoRoot });
      });
      actionsEl.appendChild(commitAndDeployBtn);

      container.appendChild(actionsEl);
    }

    function renderState(data) {
      const groups = Array.isArray(data.configGroups) ? data.configGroups : [];
      const error = data.configError || '';
      const configLoaded = Boolean(data.configLoaded);
      const missingGroups = groups.filter((group) => group && group.missingConfig);
      const shouldShowCreateConfig = !configLoaded || missingGroups.length > 0;
      createConfigBtn.hidden = !shouldShowCreateConfig;
      if (shouldShowCreateConfig) {
        createConfigBtn.disabled = false;
      } else {
        createConfigBtn.disabled = true;
      }
      configListEl.innerHTML = '';
      if (error) {
        const errorEl = document.createElement('div');
        errorEl.textContent = format(i18n.configErrorMessage, { error });
        configListEl.appendChild(errorEl);
        return;
      }
      if (!configLoaded) {
        const hintEl = document.createElement('div');
        hintEl.textContent = i18n.refreshHint;
        configListEl.appendChild(hintEl);
        return;
      }
      if (missingGroups.length > 0) {
        const missingEl = document.createElement('div');
        missingEl.className = 'config-missing-hint';
        const labels = missingGroups.map(
          (group) => group.repoLabel || group.repoRoot || i18n.gitProjectLabel
        );
        missingEl.textContent = format(i18n.missingConfigHint, {
          labels: labels.join(i18n.listSeparator),
        });
        configListEl.appendChild(missingEl);
      }
      if (groups.length === 1) {
        const group = groups[0] || {};
        const groupEl = document.createElement('div');
        groupEl.className = 'config-group';
        const label = group.repoLabel || group.repoRoot || i18n.gitProjectLabel;
        const headerEl = document.createElement('div');
        headerEl.className = 'config-group-header';
        const titleEl = document.createElement('div');
        titleEl.className = 'config-group-title';
        titleEl.textContent = label;
        if (group.repoRoot) {
          titleEl.title = i18n.openConfigHint;
          titleEl.addEventListener('dblclick', () => {
            vscode.postMessage({
              type: 'openConfig',
              repoRoot: group.repoRoot,
            });
          });
        }
        headerEl.appendChild(titleEl);
        groupEl.appendChild(headerEl);
        appendDemandButton(groupEl, group.repoRoot);
        appendDeployButton(groupEl, group.repoRoot, group.deployToTest);
        if (group.error) {
          const groupError = document.createElement('div');
          groupError.className = 'config-group-error';
          groupError.textContent = format(i18n.configErrorMessage, {
            error: group.error,
          });
          groupEl.appendChild(groupError);
        }
          appendSquashButton(groupEl, group.repoRoot);
          configListEl.appendChild(groupEl);
        return;
      }
      if (groups.length > 1) {
        for (const group of groups) {
          const groupEl = document.createElement('div');
          groupEl.className = 'config-group';
          const label = group.repoLabel || group.repoRoot || i18n.gitProjectLabel;
          const headerEl = document.createElement('div');
          headerEl.className = 'config-group-header';
          const titleEl = document.createElement('div');
          titleEl.className = 'config-group-title';
          titleEl.textContent = label;
          if (group.repoRoot) {
            titleEl.title = i18n.openConfigHint;
            titleEl.addEventListener('dblclick', () => {
              vscode.postMessage({
                type: 'openConfig',
                repoRoot: group.repoRoot,
              });
            });
          }
          headerEl.appendChild(titleEl);
          groupEl.appendChild(headerEl);
          appendDemandButton(groupEl, group.repoRoot);
          appendDeployButton(groupEl, group.repoRoot, group.deployToTest);
          if (group.error) {
            const groupError = document.createElement('div');
            groupError.className = 'config-group-error';
            groupError.textContent = format(i18n.configErrorMessage, {
              error: group.error,
            });
            groupEl.appendChild(groupError);
          }
          appendSquashButton(groupEl, group.repoRoot);
          configListEl.appendChild(groupEl);
        }
        return;
      }
    }

    function renderResult(result) {
      if (result.status === 'success') {
        resultSection.hidden = false;
        conflictSection.hidden = true;

        let html = '';
        const mergeCommitSuffix = result.isMergeCommit ? i18n.mergeCommitSuffix : '';
        html += '<p><strong>' + i18n.mergeSuccessTitle + '</strong></p>';
        html += '<p>' + format(i18n.targetBranchLabel, { branch: result.targetBranch }) + '</p>';
        html += '<p>' + format(i18n.headCommitLabel, { commit: result.headCommit + mergeCommitSuffix }) + '</p>';
        html += '<p>' + format(i18n.durationLabel, { duration: String(Math.round(result.durationMs)) }) + '</p>';

        if (result.checkoutBack === 'failed') {
          html += '<p style=\"color: var(--vscode-errorForeground)\">' + format(i18n.checkoutBackFailed, { error: result.checkoutError || '' }) + '</p>';
        } else {
           html += '<p>' + format(i18n.checkoutBackOk, { branch: result.currentBranch }) + '</p>';
        }

        if (result.pushStatus === 'ok') {
          html += '<p>' + format(i18n.pushOk, { remote: result.pushRemote || '' }) + '</p>';
        } else if (result.pushStatus === 'failed') {
          html += '<p style=\"color: var(--vscode-errorForeground)\">' + format(i18n.pushFailed, { error: result.pushError || '' }) + '</p>';
        }

        if (result.jenkinsStatus === 'ok') {
          html += '<p>' + format(i18n.jenkinsOk, { job: result.jenkinsJob || '' }) + '</p>';
        } else if (result.jenkinsStatus === 'failed') {
          html += '<p style=\"color: var(--vscode-errorForeground)\">' + format(i18n.jenkinsFailed, { error: result.jenkinsError || '' }) + '</p>';
        }

        if (Array.isArray(result.files) && result.files.length > 0) {
          html += '<div style=\"margin-top:8px;\"><strong>' + i18n.changedFilesLabel + '</strong></div><ul>';
          for (const file of result.files) {
            html += '<li>' + file + '</li>';
          }
          html += '</ul>';
        }

        resultContent.innerHTML = html;
        const pushState = result.pushStatus === 'ok'
          ? i18n.statusSuccess
          : result.pushStatus === 'failed'
            ? i18n.statusFailed
            : i18n.statusSkipped;
        const jenkinsState = result.jenkinsStatus === 'ok'
          ? i18n.statusSuccess
          : result.jenkinsStatus === 'failed'
            ? i18n.statusFailed
            : i18n.statusSkipped;
        const checkoutState = result.checkoutBack === 'ok' ? i18n.statusSuccess : i18n.statusFailed;
        const hasFailure =
          result.checkoutBack === 'failed' ||
          result.pushStatus === 'failed' ||
          result.jenkinsStatus === 'failed';
        const statusText = format(i18n.statusSummary, {
          merge: i18n.statusSuccess,
          push: pushState,
          jenkins: jenkinsState,
          checkout: checkoutState,
        });
        const statusType = hasFailure ? 'error' : 'success';
        setStatus(statusText, statusType);
      }
      if (result.status === 'failed') {
        resultSection.hidden = true;
        conflictSection.hidden = false;

        let html = '';
        html += '<p>' + format(i18n.targetBranchLabel, { branch: result.targetBranch }) + '</p>';
        html += '<p style=\"color: var(--vscode-errorForeground)\">' + format(i18n.mergeErrorLabel, { error: result.errorMessage }) + '</p>';

        conflictContent.innerHTML = html;

        if (Array.isArray(result.conflicts) && result.conflicts.length > 0) {
            let conflictHtml = '<div style=\"margin-top:8px;\"><strong>' + i18n.conflictFilesLabel + '</strong></div><ul>';
            for (const file of result.conflicts) {
                conflictHtml += '<li>' + file + '</li>';
            }
            conflictHtml += '</ul>';
            conflictContent.innerHTML += conflictHtml;
        }

        setStatus(i18n.mergeFailedSummary, 'error');
      }
    }

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
      setStatus(i18n.stayOnTargetStatus, 'info');
      conflictSection.hidden = true; // Optionally hide conflict buttons if they decide to stay
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        renderState(message);
        setBusy(false);
        return;
      }
      if (message.type === 'deployTestStarted') {
        setStatus(message.message || i18n.deployTestInProgress, 'info');
        setBusy(true);
        return;
      }
      if (message.type === 'deployProdStarted') {
        setStatus(message.message || i18n.deployProdInProgress, 'info');
        setBusy(true);
        return;
      }
      if (message.type === 'result') {
        renderResult(message.result);
        setBusy(false);
        return;
      }
      if (message.type === 'error') {
        setStatus(message.message || i18n.genericError, 'error');
        setBusy(false);
        return;
      }
      if (message.type === 'info') {
        setStatus(message.message || '', 'info');
        setBusy(false);
        return;
      }
    });

    vscode.postMessage({ type: 'requestState', loadConfig: true });
  </script>
</body>
</html>`;
}
