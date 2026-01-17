import * as path from "node:path";
import * as vscode from "vscode";

import {
  getConfigPathInfo,
  getDefaultConfigTemplate,
} from "../config";
import { getLocale, t } from "../i18n";
import { runGit } from "../git";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "../repo";
import { state } from "../state";
import { getErrorMessage } from "../utils";
import type { ActionDeps } from "./action-types";

export async function openConflictFiles(): Promise<void> {
  const cwd = state.lastWorkspaceRoot ?? (await resolveRepoRoot());
  if (!cwd) {
    void vscode.window.showErrorMessage(t("openConflictWorkspaceMissing"));
    return;
  }
  if (state.lastConflictFiles.length === 0) {
    void vscode.window.showInformationMessage(t("noConflictFiles"));
    return;
  }
  const pick = await vscode.window.showQuickPick(state.lastConflictFiles, {
    placeHolder: t("pickConflictFile"),
  });
  if (!pick) {
    return;
  }
  const fileUri = vscode.Uri.file(path.join(cwd, pick));
  await vscode.window.showTextDocument(fileUri);
}

export async function openMergeEditor(): Promise<void> {
  const cwd = state.lastWorkspaceRoot ?? (await resolveRepoRoot());
  if (!cwd) {
    void vscode.window.showErrorMessage(t("openMergeEditorWorkspaceMissing"));
    return;
  }
  if (state.lastConflictFiles.length === 0) {
    void vscode.window.showInformationMessage(t("noConflictFiles"));
    return;
  }
  let target = state.lastConflictFiles[0];
  if (state.lastConflictFiles.length > 1) {
    const pick = await vscode.window.showQuickPick(state.lastConflictFiles, {
      placeHolder: t("pickMergeEditorFile"),
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

export async function openConfig(
  deps: ActionDeps,
  repoRoot?: string
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage(t("openConfigWorkspaceMissing"));
    return;
  }
  const activeRepoRoot = await resolveRepoRoot();
  const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
  if (repoRoots.length === 0) {
    void vscode.window.showErrorMessage(t("noGitRepoCreateConfig"));
    return;
  }
  const requestedRepoRoot =
    repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
  if (repoRoot && !requestedRepoRoot) {
    void vscode.window.showErrorMessage(t("repoNotFound"));
    return;
  }
  const templatePath = path.join(
    deps.context.extensionPath,
    "media",
    getLocale() === "zh" ? "default-config.jsonc" : "default-config.en.jsonc"
  );
  let template: string;
  try {
    template = await getDefaultConfigTemplate(templatePath);
  } catch (error) {
    void vscode.window.showErrorMessage(
      t("readTemplateFailed", { error: getErrorMessage(error) })
    );
    return;
  }
  const content = Buffer.from(template);
  const targetRoots = requestedRepoRoot ? [requestedRepoRoot] : repoRoots;
  await Promise.all(
    targetRoots.map(async (targetRoot) => {
      const configInfo = await getConfigPathInfo(targetRoot);
      const configUri = vscode.Uri.file(configInfo.path);
      if (!configInfo.exists) {
        await vscode.workspace.fs.writeFile(configUri, content);
      }
    })
  );
  const openRoot = requestedRepoRoot
    ? requestedRepoRoot
    : activeRepoRoot && repoRoots.includes(activeRepoRoot)
    ? activeRepoRoot
    : repoRoots[0];
  const openConfigInfo = await getConfigPathInfo(openRoot);
  const openUri = vscode.Uri.file(openConfigInfo.path);
  const doc = await vscode.workspace.openTextDocument(openUri);
  await vscode.window.showTextDocument(doc, { preview: false });
  await deps.postState({ loadConfig: true });
}

export async function checkoutOriginal(deps: ActionDeps): Promise<void> {
  if (!state.lastFailureContext) {
    void vscode.window.showInformationMessage(t("noOriginalBranch"));
    return;
  }
  try {
    await runGit(
      ["checkout", state.lastFailureContext.originalBranch],
      state.lastFailureContext.cwd
    );
    state.lastFailureContext = null;
    state.lastConflictFiles = [];
    await deps.postState({ loadConfig: false });
    deps.postMessage({
      type: "info",
      message: t("checkoutOriginalSuccess"),
    });
  } catch (error) {
    deps.postMessage({
      type: "error",
      message: t("checkoutOriginalFailed", { error: getErrorMessage(error) }),
    });
  }
}
