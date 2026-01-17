import { JenkinsConfig, MergeConfigFile, ResolvedMergePlan } from "./types";

export type DeployTestPlanError =
  | "missing-config"
  | "missing-jenkins"
  | "missing-branch";

export type DeployTestPlanResult =
  | {
      status: "ok";
      plan: ResolvedMergePlan;
      jenkins: JenkinsConfig;
    }
  | {
      status: "error";
      reason: DeployTestPlanError;
    };

export interface DeployTestPlanInput {
  configFile: MergeConfigFile | null;
  currentBranch: string | null;
  remotes: string[];
}

export function buildDeployTestPlan(
  input: DeployTestPlanInput
): DeployTestPlanResult {
  const deployConfig = input.configFile?.deployToTest;
  if (!deployConfig) {
    return { status: "error", reason: "missing-config" };
  }
  const jenkins = deployConfig.jenkins;
  if (!jenkins || !jenkins.url || !jenkins.job) {
    return { status: "error", reason: "missing-jenkins" };
  }
  const currentBranch = input.currentBranch?.trim() ?? "";
  if (!currentBranch) {
    return { status: "error", reason: "missing-branch" };
  }
  const targetBranch = (deployConfig.targetBranch ?? "pre-test").trim();
  const pushRemote = input.remotes[0] ?? null;
  const plan: ResolvedMergePlan = {
    currentBranch,
    sourceBranch: currentBranch,
    targetBranch,
    strategyFlag: "",
    strategyLabel: "default",
    pushAfterMerge: Boolean(pushRemote),
    pushRemote,
    jenkins: undefined,
  };
  return { status: "ok", plan, jenkins };
}
