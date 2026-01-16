import {
  getCommitParentCount,
  getHeadCommit,
  listChangedFiles,
  listConflicts,
  runGit,
} from "./git";
import { triggerJenkinsBuild } from "./jenkins";
import { getErrorMessage } from "./utils";
import { MergeResult, ResolvedMergePlan, JenkinsConfig } from "./types";

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
