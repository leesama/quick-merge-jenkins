import * as vscode from "vscode";

import {
  buildNextCommitMessage,
  formatDateStamp,
  formatDemandMessage,
  pickBaseCommitMessage,
  toBranchSlug,
} from "../extension-utils";
import { listBranches, listRemoteBranches, runGit } from "../git";
import { t } from "../i18n";
import { translateToEnglish } from "../deepseek";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "../repo";
import { state } from "../state";
import { MergeConfigFile } from "../types";
import { getErrorMessage } from "../utils";
import { resolveDemandBranchSettings } from "../demand-settings";
import { getLatestReleaseBranch } from "../release-branch";
import { readMergeConfig } from "../config";
import { handleDeployTest } from "./deploy-actions";
import type { ActionDeps } from "./action-types";

const DEMAND_MESSAGE_STORAGE_KEY = "quick-merge-jenkins.demandMessages";

export async function createDemandBranch(
  deps: ActionDeps,
  repoRoot?: string
): Promise<void> {
  const notifyInfo = (message: string) => {
    deps.postMessage({ type: "info", message });
    void vscode.window.showInformationMessage(message);
  };
  const notifyError = (message: string) => {
    deps.postMessage({ type: "error", message });
    void vscode.window.showErrorMessage(message);
  };
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    notifyError(t("workspaceOpenProject"));
    return;
  }
  const activeRepoRoot = await resolveRepoRoot();
  const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
  if (repoRoots.length === 0) {
    notifyError(t("workspaceMissingForMerge"));
    return;
  }
  const requestedRepoRoot =
    repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
  if (repoRoot && !requestedRepoRoot) {
    notifyError(t("repoNotFound"));
    return;
  }
  const defaultRepoRoot =
    activeRepoRoot && repoRoots.includes(activeRepoRoot)
      ? activeRepoRoot
      : repoRoots[0];
  const cwd = requestedRepoRoot ?? defaultRepoRoot;
  let configFile: MergeConfigFile | null = null;
  try {
    configFile = await readMergeConfig(cwd);
  } catch {
    configFile = null;
  }
  const settings = resolveDemandBranchSettings(configFile);
  if (settings.demandTypes.length === 0) {
    notifyError(t("demandPrefixEmpty"));
    return;
  }
  type DemandTypePick = vscode.QuickPickItem & {
    value: string;
    commitPrefix: string;
  };
  const demandTypeItems: DemandTypePick[] = settings.demandTypes.map(
    (type) => ({
      label: type.prefix,
      description:
        type.prefix === "feature"
          ? t("demandTypeFeature")
          : type.prefix === "fix"
          ? t("demandTypeFix")
          : "",
      value: type.prefix,
      commitPrefix: type.commitPrefix,
    })
  );
  const typePick = await vscode.window.showQuickPick(demandTypeItems, {
    placeHolder: t("demandTypePlaceholder"),
  });
  if (!typePick) {
    return;
  }
  const input = await vscode.window.showInputBox({
    prompt: t("demandDescPrompt"),
    placeHolder: t("demandDescPlaceholder"),
    validateInput: (value) =>
      value.trim().length === 0 ? t("demandDescRequired") : undefined,
  });
  if (!input) {
    return;
  }
  if (!settings.apiKey) {
    notifyError(t("deepseekKeyMissing"));
    return;
  }
  let baseBranch: string | null = null;
  try {
    baseBranch = await getLatestReleaseBranch(cwd, settings.releasePrefix);
  } catch (error) {
    notifyError(getErrorMessage(error));
    return;
  }
  if (!baseBranch) {
    let branches: string[];
    try {
      const [remoteBranches, localBranches] = await Promise.all([
        listRemoteBranches(cwd).catch(() => []),
        listBranches(cwd),
      ]);
      const merged = [...remoteBranches, ...localBranches];
      const seen = new Set<string>();
      branches = merged.filter((branch) => {
        if (seen.has(branch)) {
          return false;
        }
        seen.add(branch);
        return true;
      });
    } catch (error) {
      notifyError(getErrorMessage(error));
      return;
    }
    if (branches.length === 0) {
      notifyError(t("noBranchFound"));
      return;
    }
    const pick = await vscode.window.showQuickPick(branches, {
      placeHolder: t("pickBaseBranchPlaceholder", {
        prefix: settings.releasePrefix,
      }),
    });
    if (!pick) {
      return;
    }
    baseBranch = pick;
  }
  const commitPrefix = typePick.commitPrefix || typePick.value;
  const demandMessage = formatDemandMessage(
    input.trim().replace(/\\s+/g, " "),
    commitPrefix
  );
  let branchName = "";
  deps.postMessage({
    type: "info",
    message: t("generatingBranchName"),
  });
  let translated: string;
  try {
    translated = await translateToEnglish(input, settings);
  } catch (error) {
    notifyError(getErrorMessage(error));
    return;
  }
  const slug = toBranchSlug(translated);
  if (!slug) {
    notifyError(t("translationEmpty"));
    return;
  }
  const dateStamp = formatDateStamp(new Date());
  branchName = `${typePick.value}_${slug}_${dateStamp}`;
  const edited = await vscode.window.showInputBox({
    prompt: t("branchNamePrompt"),
    value: branchName,
    placeHolder: t("branchNamePlaceholder"),
    validateInput: (value) =>
      value.trim().length === 0 ? t("branchNameRequired") : undefined,
  });
  if (!edited) {
    return;
  }
  branchName = edited.trim();
  const choice = await vscode.window.showInformationMessage(
    t("branchConfirm", { branchName }),
    { modal: true, detail: t("baseBranchDetail", { baseBranch }) },
    t("confirm")
  );
  if (choice !== t("confirm")) {
    return;
  }
  try {
    const branches = await listBranches(cwd);
    if (branches.includes(branchName)) {
      notifyError(t("branchExists", { branchName }));
      return;
    }
    await runGit(["checkout", "-b", branchName, baseBranch], cwd);
    await saveDemandMessage(deps, cwd, demandMessage);
    await runGit(["commit", "--allow-empty", "-m", demandMessage], cwd);
    notifyInfo(t("emptyCommitCreated", { message: demandMessage }));
    notifyInfo(t("demandBranchCreated", { baseBranch, branchName }));
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

export async function commitDemandCode(
  deps: ActionDeps,
  repoRoot?: string
): Promise<void> {
  const notifyInfo = (message: string) => {
    deps.postMessage({ type: "info", message });
    void vscode.window.showInformationMessage(message);
  };
  const notifyError = (message: string) => {
    deps.postMessage({ type: "error", message });
    void vscode.window.showErrorMessage(message);
  };
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    notifyError(t("workspaceOpenProject"));
    return;
  }
  const activeRepoRoot = await resolveRepoRoot();
  const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
  if (repoRoots.length === 0) {
    notifyError(t("workspaceMissingForMerge"));
    return;
  }
  const requestedRepoRoot =
    repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
  if (repoRoot && !requestedRepoRoot) {
    notifyError(t("repoNotFound"));
    return;
  }
  const defaultRepoRoot =
    activeRepoRoot && repoRoots.includes(activeRepoRoot)
      ? activeRepoRoot
      : repoRoots[0];
  const cwd = requestedRepoRoot ?? defaultRepoRoot;
  const storedDemandMessage = getDemandMessage(deps, cwd);
  let lastCommitMessage = "";
  try {
    lastCommitMessage = await getLastCommitMessage(cwd);
  } catch {
    lastCommitMessage = "";
  }
  const baseMessage = pickBaseCommitMessage(
    lastCommitMessage,
    storedDemandMessage
  );
  if (!baseMessage || baseMessage.trim().length === 0) {
    notifyError(t("demandMessageMissing"));
    return;
  }
  const defaultMessage = buildNextCommitMessage(baseMessage);
  const inputMessage = await vscode.window.showInputBox({
    prompt: t("commitMessagePrompt"),
    value: defaultMessage,
    placeHolder: t("commitMessagePlaceholder"),
    validateInput: (value) =>
      value.trim().length === 0 ? t("commitMessageRequired") : undefined,
  });
  if (!inputMessage) {
    return;
  }
  const commitMessage = inputMessage.trim();
  const choice = await vscode.window.showInformationMessage(
    t("commitConfirm", { demandMessage: commitMessage }),
    { modal: true },
    t("confirm")
  );
  if (choice !== t("confirm")) {
    return;
  }
  try {
    await runGit(["add", "-A"], cwd);
    const status = await runGit(["status", "--porcelain"], cwd);
    if (!status.stdout.trim()) {
      notifyInfo(t("commitNoChanges"));
      return;
    }
    await runGit(["commit", "-m", commitMessage], cwd);
    notifyInfo(t("commitSuccess", { message: commitMessage }));
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

export async function confirmCommitAndDeploy(
  deps: ActionDeps,
  repoRoot?: string
): Promise<void> {
  const notifyInfo = (message: string) => {
    deps.postMessage({ type: "info", message });
    void vscode.window.showInformationMessage(message);
  };
  const notifyError = (message: string) => {
    deps.postMessage({ type: "error", message });
    void vscode.window.showErrorMessage(message);
  };
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    notifyError(t("workspaceOpenProject"));
    return;
  }
  const activeRepoRoot = await resolveRepoRoot();
  const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
  if (repoRoots.length === 0) {
    notifyError(t("workspaceMissingForMerge"));
    return;
  }
  const requestedRepoRoot =
    repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
  if (repoRoot && !requestedRepoRoot) {
    notifyError(t("repoNotFound"));
    return;
  }
  const defaultRepoRoot =
    activeRepoRoot && repoRoots.includes(activeRepoRoot)
      ? activeRepoRoot
      : repoRoots[0];
  const cwd = requestedRepoRoot ?? defaultRepoRoot;

  const storedDemandMessage = getDemandMessage(deps, cwd);
  let lastCommitMessage = "";
  try {
    lastCommitMessage = await getLastCommitMessage(cwd);
  } catch {
    lastCommitMessage = "";
  }
  const baseMessage = pickBaseCommitMessage(
    lastCommitMessage,
    storedDemandMessage
  );
  if (!baseMessage || baseMessage.trim().length === 0) {
    notifyError(t("demandMessageMissing"));
    return;
  }
  const defaultMessage = buildNextCommitMessage(baseMessage);
  const inputMessage = await vscode.window.showInputBox({
    prompt: t("commitMessagePrompt"),
    value: defaultMessage,
    placeHolder: t("commitMessagePlaceholder"),
    validateInput: (value) =>
      value.trim().length === 0 ? t("commitMessageRequired") : undefined,
  });
  if (!inputMessage) {
    return;
  }
  const commitMessage = inputMessage.trim();

  const choice = await vscode.window.showInformationMessage(
    t("commitConfirm", { demandMessage: commitMessage }),
    { modal: true },
    t("confirm")
  );
  if (choice !== t("confirm")) {
    return;
  }

  try {
    await runGit(["add", "-A"], cwd);
    const status = await runGit(["status", "--porcelain"], cwd);
    if (!status.stdout.trim()) {
      notifyInfo(t("commitNoChanges"));
      return;
    }
    await runGit(["commit", "-m", commitMessage], cwd);
    notifyInfo(t("commitSuccess", { message: commitMessage }));
  } catch (error) {
    notifyError(getErrorMessage(error));
    return;
  }

  await handleDeployTest(deps, { repoRoot: cwd });
}

export function getDemandMessage(deps: ActionDeps, repoRoot: string): string {
  const stored =
    deps.context.workspaceState.get<Record<string, string>>(
      DEMAND_MESSAGE_STORAGE_KEY
    ) ?? null;
  if (stored && typeof stored === "object") {
    state.lastDemandMessages = { ...stored };
  }
  return state.lastDemandMessages[repoRoot] ?? "";
}

export async function saveDemandMessage(
  deps: ActionDeps,
  repoRoot: string,
  message: string
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }
  const next = {
    ...state.lastDemandMessages,
    [repoRoot]: trimmed,
  };
  state.lastDemandMessages = next;
  await deps.context.workspaceState.update(DEMAND_MESSAGE_STORAGE_KEY, next);
}

export async function getLastCommitMessage(cwd: string): Promise<string> {
  const result = await runGit(["log", "-1", "--pretty=%B"], cwd);
  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[0] ?? "";
}
