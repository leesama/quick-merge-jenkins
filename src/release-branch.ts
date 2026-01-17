import { listBranches, listRemoteBranches } from "./git";
import { findLatestReleaseBranch } from "./extension-utils";

export async function getLatestReleaseBranch(
  cwd: string,
  releasePrefix: string
): Promise<string | null> {
  const remoteBranches = await listRemoteBranches(cwd);
  const latestRemote = findLatestReleaseBranch(remoteBranches, releasePrefix);
  if (latestRemote) {
    return latestRemote;
  }
  const localBranches = await listBranches(cwd);
  return findLatestReleaseBranch(localBranches, releasePrefix);
}
