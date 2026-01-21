import * as vscode from "vscode";

import { JenkinsConfig, MergeConfigFile } from "./types";

export interface JenkinsSettings {
  url: string;
  user: string;
  apiToken: string;
}

export function getJenkinsSettings(): JenkinsSettings {
  const config = vscode.workspace.getConfiguration("quick-merge-jenkins");
  const url = (config.get<string>("jenkinsUrl") ?? "").trim();
  const user = (config.get<string>("jenkinsUser") ?? "").trim();
  const apiToken = (config.get<string>("jenkinsApiToken") ?? "").trim();
  return { url, user, apiToken };
}

export function applyJenkinsSettings(
  jenkins: JenkinsConfig | undefined,
  settings: JenkinsSettings
): JenkinsConfig | undefined {
  if (!jenkins) {
    return jenkins;
  }
  const url = (jenkins.url ?? "").trim() || settings.url;
  const user = (jenkins.user ?? "").trim() || settings.user;
  const apiToken = (jenkins.apiToken ?? "").trim() || settings.apiToken;
  if (
    url === jenkins.url &&
    user === jenkins.user &&
    apiToken === jenkins.apiToken
  ) {
    return jenkins;
  }
  return {
    ...jenkins,
    url,
    user,
    apiToken,
  };
}

export function applyJenkinsSettingsToConfig(
  configFile: MergeConfigFile | null,
  settings: JenkinsSettings
): MergeConfigFile | null {
  if (!configFile) {
    return configFile;
  }
  const deployConfig = configFile.deployToTest;
  if (!deployConfig?.jenkins) {
    return configFile;
  }
  const resolvedJenkins = applyJenkinsSettings(deployConfig.jenkins, settings);
  if (resolvedJenkins === deployConfig.jenkins) {
    return configFile;
  }
  return {
    ...configFile,
    deployToTest: {
      ...deployConfig,
      jenkins: resolvedJenkins,
    },
  };
}
