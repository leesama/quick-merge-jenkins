import * as vscode from "vscode";

import { getCurrentBranch, listBranches, runGit } from "../git";
import { t } from "../i18n";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "../repo";
import { state } from "../state";
import { getErrorMessage } from "../utils";
import { isNoUpstreamError, isRootResetError } from "../extension-utils";
import {
  findConsecutiveCommitGroup,
  parseCommitLog,
} from "../rebase-squash-utils";
import type { ActionDeps } from "./action-types";

export async function handleRebaseSquashWithPrompt(
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

  let didSquash = await handleRebaseSquash(deps, repoRoot);
  if (!didSquash) {
    return;
  }

  while (true) {
    const choice = await vscode.window.showInformationMessage(
      t("squashMorePrompt"),
      { modal: true },
      t("squashMoreNo"),
      t("squashMoreYes")
    );
    if (choice !== t("squashMoreYes")) {
      return;
    }
    const cwd = repoRoot ?? state.lastWorkspaceRoot ?? (await resolveRepoRoot());
    if (!cwd) {
      notifyError(t("workspaceMissingForMerge"));
      return;
    }
    let branches: string[] = [];
    try {
      branches = await listBranches(cwd);
    } catch (error) {
      notifyError(getErrorMessage(error));
      return;
    }
    const currentBranch = await getCurrentBranch(cwd).catch(() => "");
    const candidates = currentBranch
      ? branches.filter((branch) => branch !== currentBranch)
      : branches;
    if (candidates.length === 0) {
      notifyInfo(t("noBranchFound"));
      return;
    }
    const pick = await vscode.window.showQuickPick(candidates, {
      placeHolder: t("squashPickBranchPlaceholder"),
    });
    if (!pick) {
      return;
    }
    try {
      await runGit(["checkout", pick], cwd);
    } catch (error) {
      notifyError(getErrorMessage(error));
      return;
    }
    didSquash = await handleRebaseSquash(deps, cwd);
    if (!didSquash) {
      return;
    }
  }
}

export async function handleRebaseSquash(
  deps: ActionDeps,
  repoRoot?: string
): Promise<boolean> {
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
    return false;
  }
  const activeRepoRoot = await resolveRepoRoot();
  const repoRoots = await resolveRepoRoots(activeRepoRoot ?? workspaceRoot);
  if (repoRoots.length === 0) {
    notifyError(t("workspaceMissingForMerge"));
    return false;
  }
  const requestedRepoRoot =
    repoRoot && repoRoots.includes(repoRoot) ? repoRoot : undefined;
  if (repoRoot && !requestedRepoRoot) {
    notifyError(t("repoNotFound"));
    return false;
  }
  const defaultRepoRoot =
    activeRepoRoot && repoRoots.includes(activeRepoRoot)
      ? activeRepoRoot
      : repoRoots[0];
  const cwd = requestedRepoRoot ?? defaultRepoRoot;
  state.lastWorkspaceRoot = cwd;
  const currentBranch = await getCurrentBranch(cwd).catch(() => "");

  try {
    try {
      await runGit(["pull"], cwd);
    } catch (error) {
      const message = getErrorMessage(error);
      if (isNoUpstreamError(message)) {
        notifyInfo(
          t("pullSkippedNoUpstream", {
            branch: currentBranch || "-",
          })
        );
      } else {
        notifyError(t("pullFailed", { error: message }));
        return false;
      }
    }

    const logResult = await runGit(
      ["log", "--oneline", "-n", "50", "--pretty=%H|%s"],
      cwd
    );
    const commits = parseCommitLog(logResult.stdout);

    if (commits.length < 2) {
      notifyError(t("rebaseNoCommits"));
      return false;
    }

    const preSelectedIndices = findConsecutiveCommitGroup(commits);

    const items: vscode.QuickPickItem[] = commits.map((c, i) => ({
      label: c.message,
      description: c.hash.substring(0, 7),
      picked: preSelectedIndices.includes(i),
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: t("rebaseSelectCommits"),
    });

    if (!selected || selected.length < 2) {
      return false;
    }

    const selectedIndices = selected.map((s) =>
      items.findIndex((item) => item === s)
    );
    const maxIndex = Math.max(...selectedIndices);
    const count = maxIndex + 1;

    const baseMessage = commits[maxIndex]?.message || commits[0].message;

    const resetTarget = `HEAD~${count}`;
    try {
      await runGit(["reset", "--soft", resetTarget], cwd);
    } catch (error) {
      const message = getErrorMessage(error);
      if (!isRootResetError(message)) {
        throw error;
      }
      const emptyTree = await runGit(
        ["hash-object", "-t", "tree", "/dev/null"],
        cwd
      );
      const emptyCommit = await runGit(
        ["commit-tree", emptyTree.stdout, "-m", "quick-merge-squash-root"],
        cwd
      );
      if (!emptyCommit.stdout) {
        throw error;
      }
      await runGit(["reset", "--soft", emptyCommit.stdout], cwd);
    }
    await runGit(["commit", "-m", baseMessage], cwd);

    notifyInfo(
      t("rebaseSuccessWithMessage", {
        count: String(count),
        message: baseMessage,
      })
    );
    return true;
  } catch (error) {
    notifyError(t("rebaseFailed", { error: getErrorMessage(error) }));
    return false;
  }
}
