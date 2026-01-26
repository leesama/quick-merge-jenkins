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
import { buildJenkinsJobUrl, triggerJenkinsBuild } from "../jenkins";
import {
  applyJenkinsSettingsToConfig,
  getJenkinsSettings,
} from "../jenkins-settings";
import { performMerge, syncRemoteBranch } from "../merge";
import { getWorkspaceRoot, resolveRepoRoot, resolveRepoRoots } from "../repo";
import { state } from "../state";
import { JenkinsConfig, MergeConfigFile, ResolvedMergePlan } from "../types";
import { getErrorMessage } from "../utils";
import { resolveDemandBranchSettings } from "../demand-settings";
import { getLatestReleaseBranch } from "../release-branch";
import { extractReleaseDate, formatDateStamp, toBranchSlug } from "../extension-utils";
import { getConfigPathInfo, readMergeConfig } from "../config";
import { handleRebaseSquash } from "./rebase-actions";
import type { ActionDeps } from "./action-types";

type ProdPrefixItem = {
  prefix: string;
  jenkins?: Partial<JenkinsConfig>;
};

function normalizeProdPrefixItems(input: unknown): ProdPrefixItem[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const result: ProdPrefixItem[] = [];
  for (const entry of input) {
    let prefix = "";
    let jenkins: Partial<JenkinsConfig> | undefined;
    if (typeof entry === "string") {
      prefix = toBranchSlug(entry);
    } else if (entry && typeof entry === "object") {
      const raw = entry as Record<string, unknown>;
      prefix = toBranchSlug(String(raw.prefix ?? ""));
      if (raw.jenkins && typeof raw.jenkins === "object") {
        jenkins = raw.jenkins as Partial<JenkinsConfig>;
      }
    }
    if (!prefix || seen.has(prefix)) {
      continue;
    }
    seen.add(prefix);
    result.push({ prefix, jenkins });
  }
  return result;
}

function resolveProdJenkinsUrl(jenkins?: Partial<JenkinsConfig> | null): string {
  const settings = getJenkinsSettings();
  const url = (jenkins?.url ?? "").trim() || settings.url;
  const job = (jenkins?.job ?? "").trim();
  return buildJenkinsJobUrl(url, job);
}

function resolvePrefixJenkinsConfig(
  prefixJenkins?: Partial<JenkinsConfig>
): JenkinsConfig | null {
  if (!prefixJenkins) {
    prefixJenkins = {};
  }
  const settings = getJenkinsSettings();
  const url = (prefixJenkins.url ?? "").trim() || settings.url;
  const job = (prefixJenkins.job ?? "").trim();
  if (!url || !job) {
    return null;
  }
  const user = (prefixJenkins.user ?? "").trim() || settings.user;
  const apiToken = (prefixJenkins.apiToken ?? "").trim() || settings.apiToken;
  const parameters = prefixJenkins.parameters;
  const crumb =
    typeof prefixJenkins.crumb === "boolean" ? prefixJenkins.crumb : undefined;
  const resolved: JenkinsConfig = {
    url,
    job,
    parameters,
  };
  if (user) {
    resolved.user = user;
  }
  if (apiToken) {
    resolved.apiToken = apiToken;
  }
  if (typeof crumb === "boolean") {
    resolved.crumb = crumb;
  }
  return resolved;
}

function resolveProdBranchParamName(configFile: MergeConfigFile | null): string {
  const raw =
    typeof configFile?.deployToProd?.branchParamName === "string"
      ? configFile.deployToProd.branchParamName.trim()
      : "";
  return raw || "branch";
}

function applyDefaultProdParameters(
  jenkins: JenkinsConfig,
  branchRef: string,
  paramName: string
): JenkinsConfig {
  const params = jenkins.parameters ?? {};
  if (Object.keys(params).length > 0) {
    return jenkins;
  }
  const normalizedRef = normalizeRemoteBranchRef(branchRef);
  return {
    ...jenkins,
    parameters: {
      [paramName]: normalizedRef,
    },
  };
}

function normalizeRemoteBranchRef(branchRef: string): string {
  const trimmed = (branchRef ?? "").trim();
  if (!trimmed) {
    return branchRef;
  }
  if (trimmed.startsWith("refs/")) {
    return trimmed;
  }
  if (trimmed.includes("/")) {
    return `refs/remotes/${trimmed}`;
  }
  return trimmed;
}

async function openJenkinsPage(
  jenkins: Partial<JenkinsConfig> | null,
  notifyInfo: (message: string) => void,
  notifyError: (message: string) => void
): Promise<void> {
  const url = resolveProdJenkinsUrl(jenkins);
  if (!url) {
    notifyInfo(t("jenkinsUrlMissing"));
    return;
  }
  try {
    const didOpen = await vscode.env.openExternal(vscode.Uri.parse(url));
    if (!didOpen) {
      notifyError(t("jenkinsOpenFailed", { error: t("genericError") }));
    }
  } catch (error) {
    notifyError(
      t("jenkinsOpenFailed", { error: getErrorMessage(error) })
    );
  }
}

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

export async function confirmDeployProdEnv(
  deps: ActionDeps,
  repoRoot?: string
): Promise<void> {
  await handleDeployProdEnv(deps, repoRoot);
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
    const jenkinsSettings = getJenkinsSettings();
    const resolvedConfigFile = applyJenkinsSettingsToConfig(
      configFile,
      jenkinsSettings
    );
    const [currentBranch, remotes] = await Promise.all([
      getCurrentBranch(cwd),
      listRemotes(cwd),
    ]);
    const planResult = buildDeployTestPlan({
      configFile: resolvedConfigFile,
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
    let prodPrefixItems = normalizeProdPrefixItems(
      deployProdConfig?.prodPrefix
    );
    if (prodPrefixItems.length === 0) {
      if (deployProdConfig) {
        notifyError(t("deployProdPrefixEmpty"));
        return;
      }
      prodPrefixItems = [{ prefix: settings.releasePrefix }];
    }

    const latestBranches: {
      prefix: string;
      branch: string;
      jenkins?: Partial<JenkinsConfig>;
    }[] = [];
    for (const item of prodPrefixItems) {
      const prefix = item.prefix;
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
      latestBranches.push({
        prefix,
        branch: baseBranch,
        jenkins: item.jenkins,
      });
    }

    type ProdBranchPick = vscode.QuickPickItem & {
      prefix: string;
      branch: string;
      jenkins?: Partial<JenkinsConfig>;
    };
    const picks: ProdBranchPick[] = latestBranches.map((item) => ({
      label: item.branch.split("/").pop() || item.branch,
      description: item.prefix,
      picked: true,
      prefix: item.prefix,
      branch: item.branch,
      jenkins: item.jenkins,
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

    const jenkinsToOpen =
      selected.find((item) => item.jenkins)?.jenkins ?? null;
    await openJenkinsPage(jenkinsToOpen, notifyInfo, notifyError);
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

export async function handleDeployProdEnv(
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
  try {
    let configFile: MergeConfigFile | null = null;
    try {
      configFile = await readMergeConfig(cwd);
    } catch {
      configFile = null;
    }
    const deployProdConfig = configFile?.deployToProd;
    const settings = resolveDemandBranchSettings(configFile);
    let prodPrefixItems = normalizeProdPrefixItems(
      deployProdConfig?.prodPrefix
    );
    if (prodPrefixItems.length === 0) {
      if (deployProdConfig) {
        notifyError(t("deployProdPrefixEmpty"));
        return;
      }
      prodPrefixItems = [{ prefix: settings.releasePrefix }];
    }
    const autoDeployEnabled = Boolean(deployProdConfig?.autoDeploy);
    if (!autoDeployEnabled) {
      const jenkinsToOpen =
        prodPrefixItems.find((item) => item.jenkins)?.jenkins ?? null;
      await openJenkinsPage(jenkinsToOpen, notifyInfo, notifyError);
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      t("deployProdEnvConfirm"),
      { modal: true },
      t("confirm")
    );
    if (choice !== t("confirm")) {
      return;
    }

    deps.postMessage({
      type: "deployProdEnvStarted",
      message: t("deployProdEnvStarted"),
    });

    const latestBranches: {
      prefix: string;
      branchRef: string;
      branchName: string;
      jenkins?: Partial<JenkinsConfig>;
    }[] = [];
    for (const item of prodPrefixItems) {
      const prefix = item.prefix;
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
      const branchName = baseBranch.split("/").pop() || baseBranch;
      latestBranches.push({
        prefix,
        branchRef: baseBranch,
        branchName,
        jenkins: item.jenkins,
      });
    }

    const todayStamp = formatDateStamp(new Date());
    const branchParamName = resolveProdBranchParamName(configFile);
    for (const item of latestBranches) {
      const jobName = (item.jenkins?.job ?? "").trim();
      if (!jobName) {
        notifyError(t("deployProdJobMissing", { prefix: item.prefix }));
        return;
      }
      const jenkins = resolvePrefixJenkinsConfig(item.jenkins);
      if (!jenkins) {
        notifyError(t("deployProdMissingConfig"));
        return;
      }
      const releaseDate = extractReleaseDate(item.branchName, item.prefix);
      const prompt =
        releaseDate && releaseDate !== todayStamp
          ? t("deployProdEnvDateConfirm", {
              branch: item.branchName,
              date: releaseDate,
              today: todayStamp,
            })
          : t("deployProdEnvBranchConfirm", { branch: item.branchName });
      const choice = await vscode.window.showInformationMessage(
        prompt,
        { modal: true },
        t("confirm")
      );
      if (choice !== t("confirm")) {
        return;
      }
      const headCommit = await runGit(
        ["rev-parse", item.branchRef],
        cwd
      ).then((result) => result.stdout.trim());
      const resolvedJenkins = applyDefaultProdParameters(
        jenkins,
        item.branchRef,
        branchParamName
      );
      await triggerJenkinsBuild(resolvedJenkins, {
        currentBranch: item.branchName,
        sourceBranch: item.branchName,
        targetBranch: item.branchName,
        mergeCommit: headCommit,
        headCommit,
        deployEnv: "prod",
      });
      notifyInfo(
        t("deployProdEnvSuccess", {
          job: resolvedJenkins.job,
          branch: item.branchName,
        })
      );
    }
  } catch (error) {
    notifyError(
      t("deployProdEnvFailed", {
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
