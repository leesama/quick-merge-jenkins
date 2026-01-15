import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

import { CONFIG_FILE_NAME, SCAN_SKIP_DIRS } from "./constants";
import { state } from "./state";

export function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }
  if (folders.length === 1) {
    return folders[0].uri.fsPath;
  }
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (activeFolder) {
      return activeFolder.uri.fsPath;
    }
  }
  if (state.lastWorkspaceRoot) {
    const matched = folders.find(
      (folder) => folder.uri.fsPath === state.lastWorkspaceRoot
    );
    if (matched) {
      return matched.uri.fsPath;
    }
  }
  return folders[0].uri.fsPath;
}

export async function resolveRepoRoot(): Promise<string | null> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }
  const candidates: string[] = [];
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri?.scheme === "file") {
    candidates.push(activeUri.fsPath);
  }
  if (state.lastWorkspaceRoot && state.lastWorkspaceRoot !== workspaceRoot) {
    candidates.push(state.lastWorkspaceRoot);
  }
  candidates.push(workspaceRoot);

  for (const candidate of candidates) {
    const repoRoot = await findGitRoot(candidate);
    if (repoRoot) {
      return repoRoot;
    }
  }
  return workspaceRoot;
}

export async function resolveRepoRoots(
  fallbackRoot?: string
): Promise<string[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return [];
  }
  const roots = new Set<string>();
  const maxDepth = 3;
  for (const folder of folders) {
    await scanRepoRootsByDepth(folder.uri.fsPath, maxDepth, roots);
  }
  if (fallbackRoot) {
    const repoRoot = await findGitRoot(fallbackRoot);
    if (repoRoot) {
      roots.add(repoRoot);
    }
  }
  return Array.from(roots).sort((a, b) => a.localeCompare(b));
}

export function formatRepoLabel(repoRoot: string): string {
  const relative = vscode.workspace.asRelativePath(repoRoot, true);
  if (!relative || relative === "." || relative === repoRoot) {
    return path.basename(repoRoot);
  }
  return relative;
}

export async function findGitRoot(startPath: string): Promise<string | null> {
  const startDir = await normalizeStartDirectory(startPath);
  if (!startDir) {
    return null;
  }
  let current = startDir;
  while (true) {
    if (await pathExists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

async function scanRepoRootsByDepth(
  root: string,
  maxDepth: number,
  roots: Set<string>
): Promise<void> {
  async function scanDir(dir: string, depth: number): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git") {
        roots.add(dir);
        continue;
      }
      if (
        entry.name === CONFIG_FILE_NAME &&
        (entry.isFile() || entry.isSymbolicLink())
      ) {
        roots.add(dir);
      }
    }
    if (depth >= maxDepth) {
      return;
    }
    const nextDepth = depth + 1;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.name === ".git") {
        continue;
      }
      if (shouldSkipScanDir(entry.name)) {
        continue;
      }
      await scanDir(path.join(dir, entry.name), nextDepth);
    }
  }
  await scanDir(root, 0);
}

function shouldSkipScanDir(name: string): boolean {
  return SCAN_SKIP_DIRS.has(name);
}

async function normalizeStartDirectory(
  startPath: string
): Promise<string | null> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(startPath));
    if (stat.type & vscode.FileType.Directory) {
      return startPath;
    }
    return path.dirname(startPath);
  } catch {
    return null;
  }
}
