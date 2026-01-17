import * as vscode from "vscode";

import { setupDevAutoReload } from "./dev-reload";
import { QuickMergeViewProvider } from "./quick-merge-view-provider";

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
