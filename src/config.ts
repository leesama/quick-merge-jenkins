import * as path from "node:path";
import * as vscode from "vscode";

import { CONFIG_FILE_NAME, DEFAULT_UI_LABELS } from "./constants";
import {
  MergeConfigFile,
  MergeProfile,
  MergeStrategy,
  ResolvedMergePlan,
  UiLabels,
} from "./types";

export async function readMergeConfig(cwd: string): Promise<MergeConfigFile> {
  const configUri = vscode.Uri.file(path.join(cwd, CONFIG_FILE_NAME));
  let content: Uint8Array;
  try {
    content = await vscode.workspace.fs.readFile(configUri);
  } catch {
    throw new Error(`未找到配置文件 ${CONFIG_FILE_NAME}。`);
  }
  try {
    const parsed = JSON.parse(Buffer.from(content).toString("utf8"));
    if (!parsed || typeof parsed !== "object") {
      throw new Error("配置内容必须是 JSON 对象。");
    }
    return parsed as MergeConfigFile;
  } catch {
    throw new Error(`配置文件 ${CONFIG_FILE_NAME} 解析失败。`);
  }
}

export function normalizeConfigFile(configFile: MergeConfigFile): {
  uiLabels: UiLabels;
  profiles: MergeProfile[];
} {
  const uiLabels = normalizeUiLabels(configFile.ui ?? configFile.buttons);
  if (!Array.isArray(configFile.profiles) || configFile.profiles.length === 0) {
    throw new Error("配置文件必须包含 profiles。");
  }
  const profiles = configFile.profiles;
  return { uiLabels, profiles };
}

export function normalizeUiLabels(input?: UiLabels): UiLabels {
  return {
    refreshLabel: input?.refreshLabel || DEFAULT_UI_LABELS.refreshLabel,
    openConfigLabel: input?.openConfigLabel || DEFAULT_UI_LABELS.openConfigLabel,
  };
}

export function selectProfile(
  profiles: MergeProfile[],
  profileKey?: string
): MergeProfile {
  if (profiles.length === 0) {
    throw new Error("没有可用的合并配置。");
  }
  if (!profileKey) {
    if (profiles.length === 1) {
      return profiles[0];
    }
    throw new Error("未指定合并配置。");
  }
  const byId = profiles.find((profile) => profile.id?.trim() === profileKey);
  if (byId) {
    return byId;
  }
  const index = Number(profileKey);
  if (Number.isInteger(index) && index >= 0 && index < profiles.length) {
    return profiles[index];
  }
  throw new Error("未找到匹配的合并配置。");
}

export function getProfileKey(profile: MergeProfile, index: number): string {
  const id = (profile.id ?? "").trim();
  if (id) {
    return id;
  }
  return String(index);
}

export function getProfileLabel(profile: MergeProfile, index: number): string {
  const label = (profile.label ?? "").trim();
  if (label) {
    return label;
  }
  const id = (profile.id ?? "").trim();
  if (id) {
    return id;
  }
  return `合并配置 ${index + 1}`;
}

export function planLabel(label: string, plan: ResolvedMergePlan): string {
  if (label) {
    return label;
  }
  return `${plan.sourceBranch} -> ${plan.targetBranch}`;
}

export function normalizeStrategy(value?: string): {
  flag: MergeStrategy;
  label: string;
} {
  const normalized = (value ?? "").trim();
  if (!normalized || normalized === "merge" || normalized === "default") {
    return { flag: "", label: "default" };
  }
  if (normalized === "--no-ff" || normalized === "no-ff" || normalized === "no_ff") {
    return { flag: "--no-ff", label: "--no-ff" };
  }
  if (
    normalized === "--ff-only" ||
    normalized === "ff-only" ||
    normalized === "ff_only"
  ) {
    return { flag: "--ff-only", label: "--ff-only" };
  }
  throw new Error("合并策略无效。");
}

export function buildConfigSummary(plan: ResolvedMergePlan): string[] {
  const lines = [
    `源分支: ${plan.sourceBranch}`,
    `目标分支: ${plan.targetBranch}`,
    `合并策略: ${plan.strategyLabel}`,
    `推送远端: ${plan.pushAfterMerge ? plan.pushRemote ?? "-" : "不推送"}`,
  ];
  if (plan.jenkins) {
    lines.push(`Jenkins: ${plan.jenkins.job}`);
  } else {
    lines.push("Jenkins: 未启用");
  }
  return lines;
}

export function getDefaultConfigTemplate(): MergeConfigFile {
  return {
    ui: {
      refreshLabel: "⟳",
      openConfigLabel: "打开配置文件",
    },
    profiles: [
      {
        id: "merge-main",
        label: "合并到 main",
        sourceBranch: "",
        targetBranch: "main",
        strategy: "default",
        pushAfterMerge: true,
        pushRemote: "origin",
        jenkins: {
          enabled: false,
          url: "https://jenkins.example.com",
          job: "folder/jobName",
          token: "",
          user: "",
          apiToken: "",
          crumb: true,
          parameters: {
            SOURCE_BRANCH: "${sourceBranch}",
            TARGET_BRANCH: "${targetBranch}",
            MERGE_COMMIT: "${mergeCommit}",
          },
        },
      },
      {
        id: "merge-release",
        label: "合并到 release",
        sourceBranch: "",
        targetBranch: "release",
        strategy: "no-ff",
        pushAfterMerge: true,
        pushRemote: "origin",
      },
    ],
  };
}
