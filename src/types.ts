export type MergeStrategy = "" | "--no-ff" | "--ff-only";

export type MergeResult = MergeSuccess | MergeFailure;

export type LocalizedString = string | { zh?: string; en?: string };

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

export interface MergeConfig {
  sourceBranch?: string;
  targetBranch?: string;
  strategy?: string;
  pushAfterMerge?: boolean;
  pushRemote?: string;
  jenkins?: JenkinsConfig;
}

export interface MergeConfigFile {
  ui?: UiLabels;
  buttons?: UiLabels;
  demandBranch?: DemandBranchConfig;
  profiles?: MergeProfile[];
}

export interface MergeProfile extends MergeConfig {
  id?: string;
  label?: LocalizedString;
  description?: LocalizedString;
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

export interface ConfigSummaryItem {
  key: string;
  label: string;
  summary: string[];
}

export interface ConfigGroup {
  repoRoot: string;
  repoLabel: string;
  items: ConfigSummaryItem[];
  error?: string;
  missingConfig?: boolean;
}

export interface UiLabels {
  refreshLabel?: LocalizedString;
  openConfigLabel?: LocalizedString;
}

export interface DemandBranchConfig {
  prefixes?: string[];
  releasePrefix?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
}
