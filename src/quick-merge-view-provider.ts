import * as vscode from "vscode";

import type { ActionDeps } from "./actions/action-types";
import {
  confirmDeployTest,
  handleDeployProd,
  handleDeployTest,
  handleMergeToTest,
  handleSquashDeployProd,
} from "./actions/deploy-actions";
import {
  commitDemandCode,
  confirmCommitAndDeploy,
  createDemandBranch,
} from "./actions/demand-actions";
import { handleRebaseSquashWithPrompt } from "./actions/rebase-actions";
import { postState } from "./actions/state-actions";
import {
  checkoutOriginal,
  openConfig as openConfigAction,
  openConflictFiles as openConflictFilesAction,
  openMergeEditor as openMergeEditorAction,
} from "./actions/view-actions";
import {
  handleWebviewMessage,
  WebviewMessageHandlerDeps,
} from "./message-router";
import { state } from "./state";
import { getWebviewHtml } from "./webview";

export class QuickMergeViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "quickMergeView";
  private view?: vscode.WebviewView;
  private readonly deps: ActionDeps;
  private readonly messageDeps: WebviewMessageHandlerDeps;

  constructor(private readonly context: vscode.ExtensionContext) {
    const postMessage = (message: unknown) => this.postMessage(message);
    const postStateFn = (options?: { loadConfig?: boolean }) =>
      postState(postMessage, options);
    this.deps = {
      context,
      postMessage,
      postState: postStateFn,
    };
    this.messageDeps = {
      postState: this.deps.postState,
      handleDeployTest: (message) => handleDeployTest(this.deps, message),
      handleMergeToTest: (message) => handleMergeToTest(this.deps, message),
      handleDeployProd: (repoRoot) => handleDeployProd(this.deps, repoRoot),
      handleSquashDeployProd: (repoRoot) =>
        handleSquashDeployProd(this.deps, repoRoot),
      confirmDeployTest: (message) => confirmDeployTest(this.deps, message),
      commitDemandCode: (repoRoot) => commitDemandCode(this.deps, repoRoot),
      checkoutOriginal: () => checkoutOriginal(this.deps),
      openConflictFiles: () => this.openConflictFiles(),
      openMergeEditor: () => this.openMergeEditor(),
      openConfig: (repoRoot) => this.openConfig(repoRoot),
      confirmCommitAndDeploy: (repoRoot) =>
        confirmCommitAndDeploy(this.deps, repoRoot),
      handleRebaseSquashWithPrompt: (repoRoot) =>
        handleRebaseSquashWithPrompt(this.deps, repoRoot),
      createDemandBranch: (repoRoot) =>
        createDemandBranch(this.deps, repoRoot),
    };
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getWebviewHtml(view.webview);
    view.webview.onDidReceiveMessage(async (message) => {
      await handleWebviewMessage(message, this.messageDeps);
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.deps.postState({ loadConfig: !state.lastConfigLoaded });
      }
    });
    void this.deps.postState({ loadConfig: !state.lastConfigLoaded });
  }

  async openConflictFiles(): Promise<void> {
    await openConflictFilesAction();
  }

  async openMergeEditor(): Promise<void> {
    await openMergeEditorAction();
  }

  async openConfig(repoRoot?: string): Promise<void> {
    await openConfigAction(this.deps, repoRoot);
  }

  private postMessage(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}
