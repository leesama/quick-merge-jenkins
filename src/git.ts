import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { t } from "./i18n";

const execFileAsync = promisify(execFile);

export async function listBranches(cwd: string): Promise<string[]> {
  const result = await runGit(["branch", "--format=%(refname:short)"], cwd);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function listRemoteBranches(cwd: string): Promise<string[]> {
  const result = await runGit(["branch", "-r", "--format=%(refname:short)"], cwd);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function listRemotes(cwd: string): Promise<string[]> {
  const result = await runGit(["remote"], cwd);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function listConflicts(cwd: string): Promise<string[]> {
  const result = await runGit(["diff", "--name-only", "--diff-filter=U"], cwd);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return result.stdout.trim();
}

export async function getHeadCommit(cwd: string): Promise<string> {
  const result = await runGit(["rev-parse", "HEAD"], cwd);
  return result.stdout.trim();
}

export async function getCommitParentCount(
  commit: string,
  cwd: string
): Promise<number> {
  const result = await runGit(
    ["rev-list", "--parents", "-n", "1", commit],
    cwd
  );
  const parts = result.stdout.split(" ").filter(Boolean);
  return Math.max(0, parts.length - 1);
}

export async function listChangedFiles(
  before: string,
  after: string,
  cwd: string
): Promise<string[]> {
  if (!before || !after || before === after) {
    return [];
  }
  const result = await runGit(
    ["diff", "--name-only", `${before}..${after}`],
    cwd
  );
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function runGit(
  args: string[],
  cwd: string,
  options: { trim?: boolean } = {}
): Promise<{ stdout: string; stderr: string }> {
  const shouldTrim = options.trim !== false;
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd });
    const rawStdout = stdout?.toString() ?? "";
    const rawStderr = stderr?.toString() ?? "";
    return {
      stdout: shouldTrim ? rawStdout.trim() : rawStdout,
      stderr: shouldTrim ? rawStderr.trim() : rawStderr,
    };
  } catch (error: any) {
    const stderrRaw = typeof error?.stderr === "string" ? error.stderr : "";
    const stdoutRaw = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = shouldTrim ? stderrRaw.trim() : stderrRaw;
    const stdout = shouldTrim ? stdoutRaw.trim() : stdoutRaw;
    const message = stderr || stdout || error?.message || t("gitCommandFailed");
    const err = new Error(message);
    (err as any).stderr = stderr;
    (err as any).stdout = stdout;
    throw err;
  }
}

export function getDefaultRemote(remotes: string[]): string | null {
  if (remotes.includes("origin")) {
    return "origin";
  }
  return remotes[0] ?? null;
}
