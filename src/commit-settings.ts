import { MergeConfigFile } from "./types";

export function resolveCommitSettings(
  configFile: MergeConfigFile | null
): { pushAfterCommit: boolean } {
  const pushAfterCommit = configFile?.commit?.pushAfterCommit;
  return { pushAfterCommit: pushAfterCommit !== false };
}
