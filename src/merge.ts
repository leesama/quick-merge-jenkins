import {
  getCommitParentCount,
  getCurrentBranch,
  getDefaultRemote,
  getHeadCommit,
  listChangedFiles,
  listConflicts,
  listRemotes,
  runGit,
} from "./git";
import { triggerJenkinsBuild } from "./jenkins";
import {
  normalizeConfigFile,
  normalizeStrategy,
  readMergeConfig,
  selectProfile,
} from "./config";
import { getErrorMessage } from "./utils";
import {
  MergeProfile,
  MergeResult,
  ResolvedMergePlan,
  JenkinsConfig,
} from "./types";

export async function performMerge(
  cwd: string,
  plan: ResolvedMergePlan
): Promise<MergeResult> {
  const start = Date.now();
  const currentBranch = plan.currentBranch;
  const targetBranch = plan.targetBranch;

  await runGit(["checkout", targetBranch], cwd);
  const targetBefore = await getHeadCommit(cwd);

  try {
    const args = ["merge"];
    if (plan.strategyFlag) {
      args.push(plan.strategyFlag);
    }
    args.push(plan.sourceBranch);
    await runGit(args, cwd);
  } catch (error) {
    const conflicts = await listConflicts(cwd).catch(() => []);
    return {
      status: "failed",
      currentBranch,
      targetBranch,
      errorMessage: getErrorMessage(error),
      conflicts,
      durationMs: Date.now() - start,
    };
  }

  const headCommit = await getHeadCommit(cwd);
  const parentCount = await getCommitParentCount(headCommit, cwd);
  const files = await listChangedFiles(targetBefore, headCommit, cwd).catch(
    () => []
  );

  let pushStatus: "skipped" | "ok" | "failed" = "skipped";
  let pushError: string | undefined;
  if (plan.pushAfterMerge && plan.pushRemote) {
    try {
      await runGit(["push", plan.pushRemote, targetBranch], cwd);
      pushStatus = "ok";
    } catch (error) {
      pushStatus = "failed";
      pushError = getErrorMessage(error);
    }
  }

  let jenkinsStatus: "skipped" | "ok" | "failed" = "skipped";
  let jenkinsError: string | undefined;
  let jenkinsJob: string | undefined;
  if (plan.jenkins) {
    jenkinsJob = plan.jenkins.job;
    try {
      await triggerJenkinsBuild(plan.jenkins, {
        sourceBranch: plan.sourceBranch,
        targetBranch,
        currentBranch,
        mergeCommit: headCommit,
        strategy: plan.strategyLabel,
        pushRemote: plan.pushRemote || "",
      });
      jenkinsStatus = "ok";
    } catch (error) {
      jenkinsStatus = "failed";
      jenkinsError = getErrorMessage(error);
    }
  }

  let checkoutBack: "ok" | "failed" = "ok";
  let checkoutError: string | undefined;
  try {
    await runGit(["checkout", currentBranch], cwd);
  } catch (error) {
    checkoutBack = "failed";
    checkoutError = getErrorMessage(error);
  }

  return {
    status: "success",
    currentBranch,
    targetBranch,
    headCommit,
    isMergeCommit: parentCount > 1,
    files,
    durationMs: Date.now() - start,
    checkoutBack,
    checkoutError,
    pushStatus,
    pushRemote: plan.pushAfterMerge ? plan.pushRemote || undefined : undefined,
    pushError,
    jenkinsStatus,
    jenkinsJob,
    jenkinsError,
  };
}

export async function loadMergePlan(
  cwd: string,
  profileKey?: string
): Promise<ResolvedMergePlan> {
  const [currentBranch, remotes] = await Promise.all([
    getCurrentBranch(cwd),
    listRemotes(cwd),
  ]);
  if (!currentBranch) {
    throw new Error("无法获取当前分支。");
  }
  const configFile = await readMergeConfig(cwd);
  const { profiles } = normalizeConfigFile(configFile);
  const profile = selectProfile(profiles, profileKey);
  return resolveMergePlan(profile, currentBranch, remotes);
}

export function resolveMergePlan(
  config: MergeProfile,
  currentBranch: string,
  remotes: string[]
): ResolvedMergePlan {
  const targetBranch = (config.targetBranch ?? "").trim();
  if (!targetBranch) {
    throw new Error("配置缺少 targetBranch。");
  }
  const sourceBranch = (config.sourceBranch ?? "").trim() || currentBranch;
  if (!sourceBranch) {
    throw new Error("无法确定源分支。");
  }
  if (sourceBranch === targetBranch) {
    throw new Error("源分支和目标分支不能相同。");
  }

  const strategyInfo = normalizeStrategy(config.strategy);
  const pushAfterMerge = config.pushAfterMerge !== false;
  let pushRemote: string | null = null;
  if (pushAfterMerge) {
    const desiredRemote = (config.pushRemote ?? "").trim();
    const defaultRemote = getDefaultRemote(remotes);
    if (desiredRemote) {
      if (remotes.length > 0 && !remotes.includes(desiredRemote)) {
        throw new Error(`远端 ${desiredRemote} 不存在。`);
      }
      pushRemote = desiredRemote;
    } else {
      pushRemote = defaultRemote;
    }
    if (!pushRemote) {
      throw new Error("未找到可用远端，无法推送。");
    }
  }

  let jenkins: JenkinsConfig | undefined;
  if (config.jenkins && config.jenkins.enabled !== false) {
    if (!config.jenkins.url || !config.jenkins.job) {
      throw new Error("Jenkins 配置缺少 url 或 job。");
    }
    jenkins = config.jenkins;
  }

  return {
    currentBranch,
    sourceBranch,
    targetBranch,
    strategyFlag: strategyInfo.flag,
    strategyLabel: strategyInfo.label,
    pushAfterMerge,
    pushRemote,
    jenkins,
  };
}
