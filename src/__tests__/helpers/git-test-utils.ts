import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { runGit } from "../../git";

export async function createTempRepo(
  testContext: { after: (fn: () => void | Promise<void>) => void }
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "quick-merge-"));
  testContext.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await runGit(["init"], dir);
  await runGit(["config", "user.email", "test@example.com"], dir);
  await runGit(["config", "user.name", "Test User"], dir);
  return dir;
}

export async function createBareRemote(
  testContext: { after: (fn: () => void | Promise<void>) => void }
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "quick-merge-remote-"));
  testContext.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await runGit(["init", "--bare"], dir);
  return dir;
}

export async function commitFile(
  cwd: string,
  filename: string,
  content: string,
  message: string
): Promise<void> {
  const filePath = path.join(cwd, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  await runGit(["add", filename], cwd);
  await runGit(["commit", "-m", message], cwd);
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return result.stdout.trim();
}

export async function createBranch(
  cwd: string,
  branch: string,
  base?: string
): Promise<void> {
  const args = ["checkout", "-b", branch];
  if (base) {
    args.push(base);
  }
  await runGit(args, cwd);
}

export async function setRemoteAndPush(
  cwd: string,
  remotePath: string,
  branch: string
): Promise<void> {
  await runGit(["remote", "add", "origin", remotePath], cwd);
  await runGit(["push", "-u", "origin", branch], cwd);
}
