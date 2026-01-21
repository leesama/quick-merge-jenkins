import { getConfigPathInfo, readMergeConfig } from "./config";
import { t } from "./i18n";
import { applyJenkinsSettings, getJenkinsSettings } from "./jenkins-settings";
import { formatRepoLabel } from "./repo";
import { getErrorMessage } from "./utils";
import { ConfigGroup, DeployButtonInfo, MergeConfigFile } from "./types";

export async function getConfigGroups(
  repoRoots: string[]
): Promise<{ groups: ConfigGroup[]; error: string }> {
  if (repoRoots.length === 0) {
    return {
      groups: [],
      error: t("gitRepoNotFound"),
    };
  }
  const results = await Promise.all(
    repoRoots.map((repoRoot) => getConfigGroup(repoRoot))
  );
  const groups = results.map((result) => result.group);
  return { groups, error: "" };
}

export async function getConfigGroup(
  repoRoot: string
): Promise<{ group: ConfigGroup }> {
  const repoLabel = formatRepoLabel(repoRoot);
  const configInfo = await getConfigPathInfo(repoRoot);
  if (!configInfo.exists) {
    return {
      group: {
        repoRoot,
        repoLabel,
        missingConfig: true,
      },
    };
  }
  try {
    const configFile = await readMergeConfig(repoRoot);
    return {
      group: {
        repoRoot,
        repoLabel,
        missingConfig: false,
        deployToTest: getDeployToTestInfo(configFile),
      },
    };
  } catch (error) {
    return {
      group: {
        repoRoot,
        repoLabel,
        error: getErrorMessage(error),
        missingConfig: false,
      },
    };
  }
}

function getDeployToTestInfo(
  configFile: MergeConfigFile
): DeployButtonInfo | undefined {
  const deployConfig = configFile.deployToTest;
  if (!deployConfig) {
    return undefined;
  }
  const label = t("deployTestLabel");
  const jenkinsSettings = getJenkinsSettings();
  const resolvedJenkins = applyJenkinsSettings(
    deployConfig.jenkins,
    jenkinsSettings
  );
  const hasJenkins =
    Boolean(resolvedJenkins?.url) && Boolean(resolvedJenkins?.job);
  const isEnabled = hasJenkins;
  return {
    label,
    enabled: isEnabled,
    error: hasJenkins ? undefined : t("deployTestMissingConfig"),
  };
}
