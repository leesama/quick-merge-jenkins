export const DEFAULT_DEMAND_TYPES = [
  { prefix: "feature", commitPrefix: "feat" },
  { prefix: "fix", commitPrefix: "fix" },
];
export const DEFAULT_RELEASE_PREFIX = "release";

export function toBranchSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePrefixes(prefixes: unknown): string[] {
  if (!Array.isArray(prefixes)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const prefix of prefixes) {
    const normalized = toBranchSlug(String(prefix ?? ""));
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeReleasePrefix(value?: string): string {
  const normalized = toBranchSlug((value ?? "").trim());
  return normalized || DEFAULT_RELEASE_PREFIX;
}

export function normalizeCommitPrefixes(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const entries = Object.entries(input as Record<string, unknown>);
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    const normalizedKey = toBranchSlug(String(key ?? ""));
    const normalizedValue = toBranchSlug(String(value ?? ""));
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    result[normalizedKey] = normalizedValue;
  }
  return result;
}

export function normalizeDemandTypes(
  input: unknown
): { prefix: string; commitPrefix: string }[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const result: { prefix: string; commitPrefix: string }[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const raw = item as Record<string, unknown>;
    const prefix = toBranchSlug(String(raw.prefix ?? ""));
    if (!prefix || seen.has(prefix)) {
      continue;
    }
    const commitPrefix = toBranchSlug(
      String(raw.commitPrefix ?? raw.prefix ?? "")
    );
    seen.add(prefix);
    result.push({
      prefix,
      commitPrefix: commitPrefix || prefix,
    });
  }
  return result;
}

export function extractReleaseDate(
  branch: string,
  releasePrefix: string
): string | null {
  const prefix = `${releasePrefix}_`;
  const name = branch.split("/").pop() || branch;
  if (!name.startsWith(prefix)) {
    return null;
  }
  const suffix = name.slice(prefix.length);
  if (!/^\d{8}$/.test(suffix)) {
    return null;
  }
  return suffix;
}

export function findLatestReleaseBranch(
  branches: string[],
  releasePrefix: string
): string | null {
  let latestBranch: string | null = null;
  let latestDate = "";
  for (const branch of branches) {
    const date = extractReleaseDate(branch, releasePrefix);
    if (!date) {
      continue;
    }
    if (!latestDate || date > latestDate) {
      latestDate = date;
      latestBranch = branch;
    }
  }
  return latestBranch;
}

export function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

export function pickBaseCommitMessage(
  lastCommitMessage: string,
  storedDemandMessage: string
): string {
  const trimmedLast = (lastCommitMessage ?? "").trim();
  if (trimmedLast) {
    return trimmedLast;
  }
  return (storedDemandMessage ?? "").trim();
}

export function formatDemandMessage(message: string, prefix: string): string {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const normalizedPrefix = (prefix ?? "").trim();
  if (!normalizedPrefix) {
    return trimmed;
  }
  if (hasCommitPrefix(trimmed, normalizedPrefix)) {
    return trimmed;
  }
  return `${normalizedPrefix}: ${trimmed}`;
}

export function hasCommitPrefix(message: string, prefix: string): boolean {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return false;
  }
  const lowerMessage = trimmed.toLowerCase();
  const lowerPrefix = (prefix ?? "").trim().toLowerCase();
  if (!lowerPrefix) {
    return false;
  }
  if (!lowerMessage.startsWith(lowerPrefix)) {
    return false;
  }
  const rest = trimmed.slice(lowerPrefix.length);
  return rest.length === 0 || /^[\s:：-]/.test(rest);
}

export function extractCommitPrefix(message: string): string {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const match = trimmed.match(/^([^:：\s]+)[:：]/);
  return match ? match[1] : "";
}

export function buildNextCommitMessage(lastMessage: string): string {
  const normalized = lastMessage.trim();
  if (!normalized) {
    return "";
  }
  const match = normalized.match(/^(.*?)(\d+)$/);
  if (match) {
    const base = match[1];
    const number = Number(match[2]);
    if (Number.isFinite(number)) {
      return `${base}${number + 1}`;
    }
  }
  return `${normalized}1`;
}

export function isNoUpstreamError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no tracking information") ||
    normalized.includes("set-upstream-to") ||
    message.includes("没有跟踪") ||
    message.includes("未设置上游")
  );
}

export function isRootResetError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("ambiguous argument") ||
    normalized.includes("unknown revision") ||
    normalized.includes("bad revision") ||
    normalized.includes("needed a single revision")
  );
}
