import * as path from "node:path";
import * as vscode from "vscode";

import { CONFIG_FILE_NAME, LEGACY_CONFIG_FILE_NAME } from "./constants";
import { getDefaultUiLabels, resolveLocalizedString, t } from "./i18n";
import { pathExists } from "./repo";
import {
  MergeConfigFile,
  MergeProfile,
  MergeStrategy,
  ResolvedMergePlan,
  UiLabels,
} from "./types";

export async function readMergeConfig(cwd: string): Promise<MergeConfigFile> {
  const configInfo = await getConfigPathInfo(cwd);
  if (!configInfo.exists) {
    throw new Error(
      t("configFileNotFound", {
        configFile: CONFIG_FILE_NAME,
        legacyFile: LEGACY_CONFIG_FILE_NAME,
      })
    );
  }
  const configLabel = path.basename(configInfo.path);
  const configUri = vscode.Uri.file(configInfo.path);
  let content: Uint8Array;
  try {
    content = await vscode.workspace.fs.readFile(configUri);
  } catch {
    throw new Error(
      t("configFileNotFound", {
        configFile: CONFIG_FILE_NAME,
        legacyFile: LEGACY_CONFIG_FILE_NAME,
      })
    );
  }
  try {
    const raw = Buffer.from(content).toString("utf8");
    const parsed = JSON.parse(stripJsonComments(raw));
    if (!parsed || typeof parsed !== "object") {
      throw new Error(t("configMustBeObject"));
    }
    return parsed as MergeConfigFile;
  } catch {
    throw new Error(t("configParseFailed", { configLabel }));
  }
}

export function normalizeConfigFile(configFile: MergeConfigFile): {
  uiLabels: UiLabels;
  profiles: MergeProfile[];
} {
  const uiLabels = normalizeUiLabels(configFile.ui ?? configFile.buttons);
  if (!Array.isArray(configFile.profiles) || configFile.profiles.length === 0) {
    throw new Error(t("configMustHaveProfiles"));
  }
  const profiles = configFile.profiles;
  return { uiLabels, profiles };
}

export function normalizeUiLabels(input?: UiLabels): UiLabels {
  const defaults = getDefaultUiLabels();
  const defaultRefresh = resolveLocalizedString(defaults.refreshLabel, "⟳");
  const defaultOpenConfig = resolveLocalizedString(
    defaults.openConfigLabel,
    t("openConfigLabel")
  );
  return {
    refreshLabel: resolveLocalizedString(input?.refreshLabel, defaultRefresh),
    openConfigLabel: resolveLocalizedString(
      input?.openConfigLabel,
      defaultOpenConfig
    ),
  };
}

export function selectProfile(
  profiles: MergeProfile[],
  profileKey?: string
): MergeProfile {
  if (profiles.length === 0) {
    throw new Error(t("noMergeProfiles"));
  }
  if (!profileKey) {
    if (profiles.length === 1) {
      return profiles[0];
    }
    throw new Error(t("mergeProfileUnspecified"));
  }
  const byId = profiles.find((profile) => profile.id?.trim() === profileKey);
  if (byId) {
    return byId;
  }
  const index = Number(profileKey);
  if (Number.isInteger(index) && index >= 0 && index < profiles.length) {
    return profiles[index];
  }
  throw new Error(t("mergeProfileNotFound"));
}

export function getProfileKey(profile: MergeProfile, index: number): string {
  const id = (profile.id ?? "").trim();
  if (id) {
    return id;
  }
  return String(index);
}

export function getProfileLabel(profile: MergeProfile, index: number): string {
  const localized = resolveLocalizedString(profile.label).trim();
  if (localized) {
    return localized;
  }
  const id = (profile.id ?? "").trim();
  if (id) {
    return id;
  }
  return t("mergeProfileLabel", { index: String(index + 1) });
}

export function planLabel(label: string, plan: ResolvedMergePlan): string {
  if (label) {
    return label;
  }
  return t("mergeToLabel", { branch: plan.targetBranch });
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
  throw new Error(t("mergeStrategyInvalid"));
}

export function buildConfigSummary(plan: ResolvedMergePlan): string[] {
  const lines = [
    t("summarySourceBranch", { branch: plan.sourceBranch }),
    t("summaryTargetBranch", { branch: plan.targetBranch }),
    t("summaryStrategy", { strategy: plan.strategyLabel }),
    plan.pushAfterMerge
      ? t("summaryPushRemote", { remote: plan.pushRemote ?? "-" })
      : t("summaryNoPush"),
  ];
  if (plan.jenkins) {
    lines.push(t("summaryJenkinsJob", { job: plan.jenkins.job }));
  } else {
    lines.push(t("summaryJenkinsDisabled"));
  }
  return lines;
}

export async function getDefaultConfigTemplate(
  templatePath: string
): Promise<string> {
  const uri = vscode.Uri.file(templatePath);
  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString("utf8");
}

export async function getConfigPathInfo(cwd: string): Promise<{
  path: string;
  exists: boolean;
  isLegacy: boolean;
}> {
  const jsoncPath = path.join(cwd, CONFIG_FILE_NAME);
  if (await pathExists(jsoncPath)) {
    return { path: jsoncPath, exists: true, isLegacy: false };
  }
  const legacyPath = path.join(cwd, LEGACY_CONFIG_FILE_NAME);
  if (await pathExists(legacyPath)) {
    return { path: legacyPath, exists: true, isLegacy: true };
  }
  return { path: jsoncPath, exists: false, isLegacy: false };
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      output += char;
      if (char === '"' && !isEscaped(input, i)) {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function isEscaped(input: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && input[i] === "\\"; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
