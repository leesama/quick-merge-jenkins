export type MergeStrategy = "" | "--no-ff" | "--ff-only";

export type MergeResult = MergeSuccess | MergeFailure;

export interface MergeSuccess {
  status: "success";
  currentBranch: string;
  targetBranch: string;
  headCommit: string;
  isMergeCommit: boolean;
  files: string[];
  durationMs: number;
  checkoutBack: "ok" | "failed";
  checkoutError?: string;
  pushStatus: "skipped" | "ok" | "failed";
  pushRemote?: string;
  pushError?: string;
  jenkinsStatus: "skipped" | "ok" | "failed";
  jenkinsJob?: string;
  jenkinsError?: string;
}

export interface MergeFailure {
  status: "failed";
  currentBranch: string;
  targetBranch: string;
  errorMessage: string;
  conflicts: string[];
  durationMs: number;
}

export interface MergeConfigFile {
  demandBranch?: DemandBranchConfig;
  deployToTest?: DeployConfig;
}

export interface JenkinsConfig {
  url: string;
  job: string;
  enabled?: boolean;
  token?: string;
  user?: string;
  apiToken?: string;
  crumb?: boolean;
  parameters?: Record<string, string>;
}

export interface DeployConfig {
  targetBranch?: string;
  jenkins?: JenkinsConfig;
}

export interface ResolvedMergePlan {
  currentBranch: string;
  sourceBranch: string;
  targetBranch: string;
  strategyFlag: MergeStrategy;
  strategyLabel: string;
  pushAfterMerge: boolean;
  pushRemote: string | null;
  jenkins?: JenkinsConfig;
}

export interface ConfigGroup {
  repoRoot: string;
  repoLabel: string;
  error?: string;
  missingConfig?: boolean;
  deployToTest?: DeployButtonInfo;
}

export interface DeployButtonInfo {
  label: string;
  enabled: boolean;
  error?: string;
}

export interface DemandBranchType {
  prefix: string;
  commitPrefix?: string;
}

export interface DemandBranchConfig {
  types?: DemandBranchType[];
  prefixes?: string[];
  releasePrefix?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  commitPrefixes?: Record<string, string>;
}
