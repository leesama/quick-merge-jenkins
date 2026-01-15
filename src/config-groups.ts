import * as path from "node:path";

import { CONFIG_FILE_NAME, DEFAULT_UI_LABELS } from "./constants";
import {
  buildConfigSummary,
  getProfileKey,
  getProfileLabel,
  normalizeConfigFile,
  planLabel,
  readMergeConfig,
} from "./config";
import { getCurrentBranch, listRemotes } from "./git";
import { resolveMergePlan } from "./merge";
import { formatRepoLabel, pathExists } from "./repo";
import { getErrorMessage } from "./utils";
import { ConfigGroup, UiLabels } from "./types";

export async function getConfigGroups(
  repoRoots: string[]
): Promise<{ groups: ConfigGroup[]; error: string; uiLabels: UiLabels }> {
  if (repoRoots.length === 0) {
    return {
      groups: [],
      error: "未找到 Git 仓库。",
      uiLabels: DEFAULT_UI_LABELS,
    };
  }
  const results = await Promise.all(
    repoRoots.map((repoRoot) => getConfigGroup(repoRoot))
  );
  const groups = results.map((result) => result.group);
  let uiLabels = DEFAULT_UI_LABELS;
  if (repoRoots.length === 1) {
    for (const result of results) {
      if (!result.group.error) {
        uiLabels = result.uiLabels;
        break;
      }
    }
  }
  return { groups, error: "", uiLabels };
}

export async function getConfigGroup(
  repoRoot: string
): Promise<{ group: ConfigGroup; uiLabels: UiLabels }> {
  const repoLabel = formatRepoLabel(repoRoot);
  const configPath = path.join(repoRoot, CONFIG_FILE_NAME);
  const hasConfig = await pathExists(configPath);
  if (!hasConfig) {
    return {
      group: {
        repoRoot,
        repoLabel,
        items: [],
        error: `未找到配置文件 ${CONFIG_FILE_NAME}。`,
        missingConfig: true,
      },
      uiLabels: DEFAULT_UI_LABELS,
    };
  }
  try {
    const [currentBranch, remotes] = await Promise.all([
      getCurrentBranch(repoRoot),
      listRemotes(repoRoot),
    ]);
    const configFile = await readMergeConfig(repoRoot);
    const normalized = normalizeConfigFile(configFile);
    const items = normalized.profiles.map((profile, index) => {
      const key = getProfileKey(profile, index);
      const label = getProfileLabel(profile, index);
      try {
        const plan = resolveMergePlan(profile, currentBranch, remotes);
        return {
          key,
          label: planLabel(label, plan),
          summary: buildConfigSummary(plan),
        };
      } catch (error) {
        return {
          key,
          label,
          summary: [`配置错误: ${getErrorMessage(error)}`],
        };
      }
    });
    return {
      group: {
        repoRoot,
        repoLabel,
        items,
        missingConfig: false,
      },
      uiLabels: normalized.uiLabels,
    };
  } catch (error) {
    return {
      group: {
        repoRoot,
        repoLabel,
        items: [],
        error: getErrorMessage(error),
        missingConfig: false,
      },
      uiLabels: DEFAULT_UI_LABELS,
    };
  }
}
