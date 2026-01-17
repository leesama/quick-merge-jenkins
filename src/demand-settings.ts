import * as vscode from "vscode";

import { MergeConfigFile } from "./types";
import {
  DEFAULT_DEMAND_TYPES,
  normalizeCommitPrefixes,
  normalizeDemandTypes,
  normalizePrefixes,
  normalizeReleasePrefix,
} from "./extension-utils";

export function getDeepseekSettings(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  const config = vscode.workspace.getConfiguration("quick-merge-jenkins");
  const apiKey = (config.get<string>("deepseekApiKey") ?? "").trim();
  const baseUrl = (config.get<string>("deepseekBaseUrl") ?? "").trim();
  const model =
    (config.get<string>("deepseekModel") ?? "deepseek-chat").trim() ||
    "deepseek-chat";
  return { apiKey, baseUrl, model };
}

export function resolveDemandBranchSettings(
  configFile: MergeConfigFile | null
): {
  apiKey: string;
  baseUrl: string;
  model: string;
  demandTypes: { prefix: string; commitPrefix: string }[];
  releasePrefix: string;
} {
  const fallback = getDeepseekSettings();
  const demandConfig = configFile?.demandBranch;
  const apiKey = (demandConfig?.deepseekApiKey ?? "").trim() || fallback.apiKey;
  const baseUrl =
    (demandConfig?.deepseekBaseUrl ?? "").trim() || fallback.baseUrl;
  const model = (demandConfig?.deepseekModel ?? "").trim() || fallback.model;
  const customTypes = normalizeDemandTypes(demandConfig?.types);
  const legacyPrefixes = normalizePrefixes(demandConfig?.prefixes ?? []);
  const legacyCommitPrefixes = normalizeCommitPrefixes(
    demandConfig?.commitPrefixes
  );
  const demandTypes =
    customTypes.length > 0
      ? customTypes
      : legacyPrefixes.length > 0
      ? legacyPrefixes.map((prefix) => ({
          prefix,
          commitPrefix: legacyCommitPrefixes[prefix] ?? prefix,
        }))
      : DEFAULT_DEMAND_TYPES;
  const releasePrefix = normalizeReleasePrefix(demandConfig?.releasePrefix);
  return { apiKey, baseUrl, model, demandTypes, releasePrefix };
}
