import * as vscode from "vscode";

export function setupDevAutoReload(context: vscode.ExtensionContext): void {
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
