import * as vscode from "vscode";

import { buildDeployTestPlan, buildMergeToTestPlan } from "../deploy-test-planner";
import {
  getCurrentBranch,
  listBranches,
  listRemoteBranches,
  listRemotes,
  runGit,
} from "../git";
import { t } from "../i18n";
import { triggerJenkinsBuild } from "../jenkins";
import { performMerge, syncRemoteBranch } from "../merge";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "../repo";
import { state } from "../state";
import { MergeConfigFile, ResolvedMergePlan } from "../types";
import { getErrorMessage } from "../utils";
import { resolveDemandBranchSettings } from "../demand-settings";
import { getLatestReleaseBranch } from "../release-branch";
import { formatDateStamp, normalizePrefixes } from "../extension-utils";
import { getConfigPathInfo, readMergeConfig } from "../config";
import { handleRebaseSquash } from "./rebase-actions";
import type { ActionDeps } from "./action-types";

export async function confirmDeployTest(
  deps: ActionDeps,
  message: any
): Promise<void> {
  const label = typeof message?.label === "string" ? message.label.trim() : "";
  const prompt = label
    ? t("deployTestConfirmWithLabel", { label })
    : t("deployTestConfirm");
  const choice = await vscode.window.showInformationMessage(
    prompt,
    { modal: true },
    t("confirm")
  );
  if (choice !== t("confirm")) {
    return;
  }
  await handleDeployTest(deps, message);
}

export async function handleDeployTest(
  deps: ActionDeps,
  message: any
): Promise<void> {
  const requestedRoot =
    typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
  const cwd = requestedRoot ?? (await resolveRepoRoot());
  if (!cwd) {
    deps.postMessage({
      type: "error",
      message: t("workspaceMissingForMerge"),
    });
    return;
  }
  state.lastWorkspaceRoot = cwd;
  deps.postMessage({
    type: "deployTestStarted",
    message: t("deployTestStarted"),
  });
  try {
    const configFile = await readMergeConfig(cwd);
    const [currentBranch, remotes] = await Promise.all([
      getCurrentBranch(cwd),
      listRemotes(cwd),
    ]);
    const planResult = buildDeployTestPlan({
      configFile,
      currentBranch,
      remotes,
    });
    if (planResult.status === "error") {
      const errorMessage =
        planResult.reason === "missing-branch"
          ? t("currentBranchMissing")
          : t("deployTestMissingConfig");
      deps.postMessage({
        type: "error",
        message: errorMessage,
      });
      void vscode.window.showErrorMessage(errorMessage);
      return;
    }

    const { plan, jenkins } = planResult;

    const result = await performMerge(cwd, plan);
    if (result.status === "failed") {
      state.lastFailureContext = {
        originalBranch: result.currentBranch,
        targetBranch: result.targetBranch,
        cwd,
      };
      state.lastConflictFiles = result.conflicts;
      deps.postMessage({ type: "result", result });
      void vscode.window.showErrorMessage(
        t("mergeFailed", { error: result.errorMessage })
      );
      return;
    }

    const headCommit = result.headCommit;
    await triggerJenkinsBuild(jenkins, {
      currentBranch: plan.currentBranch,
      sourceBranch: plan.sourceBranch,
      targetBranch: plan.targetBranch,
      mergeCommit: headCommit,
      headCommit,
      deployEnv: "test",
    });

    const successMessage = t("deployTestSuccess", { job: jenkins.job });
    deps.postMessage({
      type: "info",
      message: successMessage,
    });
    void vscode.window.showInformationMessage(successMessage);
  } catch (error) {
    const errorMessage = t("deployTestFailed", {
      error: getErrorMessage(error),
    });
    deps.postMessage({
      type: "error",
      message: errorMessage,
    });
    void vscode.window.showErrorMessage(errorMessage);
  } finally {
    await deps.postState({ loadConfig: false });
  }
}

export async function handleMergeToTest(
  deps: ActionDeps,
  message: any
): Promise<void> {
  const requestedRoot =
    typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
  const cwd = requestedRoot ?? (await resolveRepoRoot());
  if (!cwd) {
    deps.postMessage({
      type: "error",
      message: t("workspaceMissingForMerge"),
    });
    return;
  }
  state.lastWorkspaceRoot = cwd;
  deps.postMessage({
    type: "mergeTestStarted",
    message: t("mergeTestStarted"),
  });
  try {
    let configFile: MergeConfigFile | null = null;
    try {
      const configInfo = await getConfigPathInfo(cwd);
      if (configInfo.exists) {
        configFile = await readMergeConfig(cwd);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      deps.postMessage({
        type: "error",
        message: errorMessage,
      });
      void vscode.window.showErrorMessage(errorMessage);
      return;
    }
    const [currentBranch, remotes] = await Promise.all([
      getCurrentBranch(cwd),
      listRemotes(cwd),
    ]);
    const planResult = buildMergeToTestPlan({
      configFile,
      currentBranch,
      remotes,
    });
    if (planResult.status === "error") {
      const errorMessage =
        planResult.reason === "missing-branch"
          ? t("currentBranchMissing")
          : t("remoteMissing");
      deps.postMessage({
        type: "error",
        message: errorMessage,
      });
      void vscode.window.showErrorMessage(errorMessage);
      return;
    }
    const { plan } = planResult;

    await syncRemoteBranch(cwd, plan.pushRemote, plan.currentBranch);

    const result = await performMerge(cwd, plan);
    if (result.status === "failed") {
      state.lastFailureContext = {
        originalBranch: result.currentBranch,
        targetBranch: result.targetBranch,
        cwd,
      };
      state.lastConflictFiles = result.conflicts;
      deps.postMessage({ type: "result", result });
      void vscode.window.showErrorMessage(
        t("mergeFailed", { error: result.errorMessage })
      );
      return;
    }

    deps.postMessage({ type: "result", result });

    if (result.pushStatus === "failed") {
      const errorMessage = t("pushFailed", {
        error: result.pushError || t("genericError"),
      });
      deps.postMessage({
        type: "error",
        message: errorMessage,
      });
      void vscode.window.showErrorMessage(errorMessage);
      return;
    }

    const successMessage = t("mergeSuccess", { target: plan.targetBranch });
    deps.postMessage({
      type: "info",
      message: successMessage,
    });
    void vscode.window.showInformationMessage(successMessage);
  } catch (error) {
    const errorMessage = t("mergeFailed", {
      error: getErrorMessage(error),
    });
    deps.postMessage({
      type: "error",
      message: errorMessage,
    });
    void vscode.window.showErrorMessage(errorMessage);
  } finally {
    await deps.postState({ loadConfig: false });
  }
}

export async function handleDeployProd(
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
  state.lastWorkspaceRoot = cwd;
  deps.postMessage({
    type: "deployProdStarted",
    message: t("deployProdStarted"),
  });
  try {
    const currentBranch = await getCurrentBranch(cwd).catch(() => "");
    if (!currentBranch) {
      notifyError(t("currentBranchMissing"));
      return;
    }

    let configFile: MergeConfigFile | null = null;
    try {
      configFile = await readMergeConfig(cwd);
    } catch {
      configFile = null;
    }
    const settings = resolveDemandBranchSettings(configFile);
    const deployProdConfig = configFile?.deployToProd;
    let prodPrefixes = normalizePrefixes(deployProdConfig?.prodPrefix);
    if (prodPrefixes.length === 0) {
      if (deployProdConfig) {
        notifyError(t("deployProdPrefixEmpty"));
        return;
      }
      prodPrefixes = [settings.releasePrefix];
    }

    const latestBranches: { prefix: string; branch: string }[] = [];
    for (const prefix of prodPrefixes) {
      let baseBranch: string | null = null;
      try {
        baseBranch = await getLatestReleaseBranch(cwd, prefix);
      } catch (error) {
        notifyError(getErrorMessage(error));
        return;
      }
      if (!baseBranch) {
        notifyError(t("deployProdBaseBranchMissing", { prefix }));
        return;
      }
      latestBranches.push({ prefix, branch: baseBranch });
    }

    type ProdBranchPick = vscode.QuickPickItem & {
      prefix: string;
      branch: string;
    };
    const picks: ProdBranchPick[] = latestBranches.map((item) => ({
      label: item.branch.split("/").pop() || item.branch,
      description: item.prefix,
      picked: true,
      prefix: item.prefix,
      branch: item.branch,
    }));
    const selected = await vscode.window.showQuickPick(picks, {
      canPickMany: true,
      placeHolder: t("deployProdPickBranchesPlaceholder"),
    });
    if (!selected || selected.length === 0) {
      return;
    }

    const allBranches = await listBranches(cwd);
    const isFeatBranch = (branch: string): boolean => {
      const name = branch.split("/").pop() || branch;
      const normalized = name.toLowerCase();
      return /^(feat|feature)([\\/_-]|$)/.test(normalized);
    };
    const candidateBranches = allBranches.filter(isFeatBranch);
    if (currentBranch && !candidateBranches.includes(currentBranch)) {
      candidateBranches.unshift(currentBranch);
    }
    const uniqueCandidates = Array.from(new Set(candidateBranches));
    if (uniqueCandidates.length === 0) {
      notifyError(t("deployProdFeatBranchEmpty"));
      return;
    }
    type FeatBranchPick = vscode.QuickPickItem & { branch: string };
    const featPicks: FeatBranchPick[] = uniqueCandidates.map((branch) => ({
      label: branch,
      picked: branch === currentBranch,
      branch,
    }));
    const selectedFeatBranches = await vscode.window.showQuickPick(featPicks, {
      canPickMany: true,
      placeHolder: t("deployProdPickFeatBranchesPlaceholder"),
    });
    if (!selectedFeatBranches || selectedFeatBranches.length === 0) {
      return;
    }
    const sourceBranches = selectedFeatBranches.map((item) => item.branch);

    const dateStamp = formatDateStamp(new Date());
    const [localBranches, remoteBranches] = await Promise.all([
      listBranches(cwd),
      listRemoteBranches(cwd).catch(() => []),
    ]);
    const remotes = await listRemotes(cwd).catch(() => []);
    const pushRemote = remotes.length > 0 ? remotes[0] : null;

    for (const pick of selected) {
      const targetBranch = `${pick.prefix}_${dateStamp}`;
      const targetExists =
        localBranches.includes(targetBranch) ||
        remoteBranches.some(
          (branch) => (branch.split("/").pop() || branch) === targetBranch
        );
      if (targetExists) {
        notifyError(t("branchExists", { branchName: targetBranch }));
        return;
      }

      await runGit(["branch", targetBranch, pick.branch], cwd);
      localBranches.push(targetBranch);

      for (let i = 0; i < sourceBranches.length; i += 1) {
        const sourceBranch = sourceBranches[i];
        const isLastSource = i === sourceBranches.length - 1;
        const plan: ResolvedMergePlan = {
          currentBranch,
          sourceBranch,
          targetBranch,
          strategyFlag: "",
          strategyLabel: "default",
          pushAfterMerge: Boolean(pushRemote) && isLastSource,
          pushRemote,
          jenkins: undefined,
        };

        const result = await performMerge(cwd, plan);
        if (result.status === "failed") {
          state.lastFailureContext = {
            originalBranch: result.currentBranch,
            targetBranch: result.targetBranch,
            cwd,
          };
          state.lastConflictFiles = result.conflicts;
          deps.postMessage({ type: "result", result });
          notifyError(t("mergeFailed", { error: result.errorMessage }));
          return;
        }

        deps.postMessage({ type: "result", result });
      }

      notifyInfo(t("deployProdSuccess", { branch: targetBranch }));
    }
  } catch (error) {
    notifyError(
      t("deployProdFailed", {
        error: getErrorMessage(error),
      })
    );
  } finally {
    await deps.postState({ loadConfig: false });
  }
}

export async function handleSquashDeployProd(
  deps: ActionDeps,
  repoRoot?: string
): Promise<void> {
  const didSquash = await handleRebaseSquash(deps, repoRoot);
  if (!didSquash) {
    return;
  }
  await handleDeployProd(deps, repoRoot);
}
