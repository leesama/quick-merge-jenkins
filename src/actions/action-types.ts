import type * as vscode from "vscode";

export interface ActionDeps {
  context: vscode.ExtensionContext;
  postMessage: (message: unknown) => void;
  postState: (options?: { loadConfig?: boolean }) => Promise<void>;
}
