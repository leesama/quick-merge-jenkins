export interface CommitInfo {
  hash: string;
  message: string;
}

export function parseCommitLog(raw: string): CommitInfo[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [hash, ...msgParts] = line.split("|");
      return { hash, message: msgParts.join("|") };
    });
}

export function findConsecutiveCommitGroup(commits: CommitInfo[]): number[] {
  for (let start = 0; start < commits.length; start += 1) {
    const base = getBaseMessage(commits[start].message);
    if (!base) {
      continue;
    }
    const indices: number[] = [];
    for (let i = start; i < commits.length; i += 1) {
      const nextBase = getBaseMessage(commits[i].message);
      if (nextBase === base) {
        indices.push(i);
      } else {
        break;
      }
    }
    if (indices.length >= 2) {
      return indices;
    }
  }
  return [];
}

function getBaseMessage(message: string): string {
  const match = message.match(/^(.*?)(\d*)$/);
  return match ? match[1] : message;
}
