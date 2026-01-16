import { CONFIG_FILE_NAME, LEGACY_CONFIG_FILE_NAME } from "./constants";
import {
  buildConfigSummary,
  getProfileKey,
  getProfileLabel,
  getConfigPathInfo,
  normalizeConfigFile,
  planLabel,
  readMergeConfig,
} from "./config";
import { getCurrentBranch, listRemotes } from "./git";
import { getDefaultUiLabels, t } from "./i18n";
import { resolveMergePlan } from "./merge";
import { formatRepoLabel } from "./repo";
import { getErrorMessage } from "./utils";
import { ConfigGroup, UiLabels } from "./types";

export async function getConfigGroups(
  repoRoots: string[]
): Promise<{ groups: ConfigGroup[]; error: string; uiLabels: UiLabels }> {
  if (repoRoots.length === 0) {
    return {
      groups: [],
      error: t("gitRepoNotFound"),
      uiLabels: getDefaultUiLabels(),
    };
  }
  const results = await Promise.all(
    repoRoots.map((repoRoot) => getConfigGroup(repoRoot))
  );
  const groups = results.map((result) => result.group);
  let uiLabels = getDefaultUiLabels();
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
  const configInfo = await getConfigPathInfo(repoRoot);
  if (!configInfo.exists) {
    return {
      group: {
        repoRoot,
        repoLabel,
        items: [],
        error: t("configFileNotFound", {
          configFile: CONFIG_FILE_NAME,
          legacyFile: LEGACY_CONFIG_FILE_NAME,
        }),
        missingConfig: true,
      },
      uiLabels: getDefaultUiLabels(),
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
          summary: [t("configErrorMessage", { error: getErrorMessage(error) })],
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
      uiLabels: getDefaultUiLabels(),
    };
  }
}
