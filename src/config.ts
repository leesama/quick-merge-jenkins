import * as path from "node:path";
import * as vscode from "vscode";

import { CONFIG_FILE_NAME, LEGACY_CONFIG_FILE_NAME } from "./constants";
import { t } from "./i18n";
import { pathExists } from "./repo";
import { MergeConfigFile } from "./types";

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
