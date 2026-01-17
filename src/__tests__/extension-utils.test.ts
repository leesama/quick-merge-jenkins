import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNextCommitMessage,
  extractCommitPrefix,
  extractReleaseDate,
  findLatestReleaseBranch,
  formatDateStamp,
  formatDemandMessage,
  hasCommitPrefix,
  isNoUpstreamError,
  isRootResetError,
  normalizeCommitPrefixes,
  normalizeDemandTypes,
  normalizePrefixes,
  normalizeReleasePrefix,
  pickBaseCommitMessage,
  toBranchSlug,
} from "../extension-utils";

test("toBranchSlug handles normalization and trimming", () => {
  assert.equal(toBranchSlug("Feature ABC"), "feature_abc");
  assert.equal(toBranchSlug("  API/v2 "), "api_v2");
  assert.equal(toBranchSlug("---"), "");
});

test("normalizePrefixes filters invalid values and de-duplicates", () => {
  assert.deepEqual(normalizePrefixes(["Feature", "feature", "fix", "", null]), [
    "feature",
    "fix",
  ]);
  assert.deepEqual(normalizePrefixes("feature"), []);
});

test("normalizeDemandTypes builds commitPrefix defaults and removes duplicates", () => {
  const result = normalizeDemandTypes([
    { prefix: "Feature", commitPrefix: "Feat" },
    { prefix: "fix" },
    { prefix: "" },
    null,
    { prefix: "feature", commitPrefix: "feature" },
  ]);
  assert.deepEqual(result, [
    { prefix: "feature", commitPrefix: "feat" },
    { prefix: "fix", commitPrefix: "fix" },
  ]);
});

test("normalizeCommitPrefixes ignores empty keys or values", () => {
  const result = normalizeCommitPrefixes({
    Feat: "FEAT",
    fix: "",
    " ": "x",
  });
  assert.deepEqual(result, { feat: "feat" });
});

test("normalizeReleasePrefix falls back to default", () => {
  assert.equal(normalizeReleasePrefix(" Release "), "release");
  assert.equal(normalizeReleasePrefix(""), "release");
});

test("release branch helpers parse and select by date", () => {
  assert.equal(
    extractReleaseDate("origin/release_20240102", "release"),
    "20240102"
  );
  assert.equal(extractReleaseDate("release_2024010", "release"), null);
  assert.equal(
    findLatestReleaseBranch(
      ["origin/release_20240102", "release_20240101", "release_20240201"],
      "release"
    ),
    "release_20240201"
  );
});

test("formatDateStamp outputs yyyyMMdd", () => {
  assert.equal(formatDateStamp(new Date(2024, 0, 2)), "20240102");
});

test("commit message helpers normalize prefixes and defaults", () => {
  assert.equal(extractCommitPrefix("feat: add login"), "feat");
  assert.equal(extractCommitPrefix("no prefix"), "");
  assert.equal(hasCommitPrefix("feat: add", "feat"), true);
  assert.equal(hasCommitPrefix("feature: add", "feat"), false);
  assert.equal(formatDemandMessage("add login", "feat"), "feat: add login");
  assert.equal(
    formatDemandMessage("feat: add login", "feat"),
    "feat: add login"
  );
  assert.equal(
    pickBaseCommitMessage("chore: update", "feat: add"),
    "feat: add"
  );
  assert.equal(
    pickBaseCommitMessage("feat: add", "feat: add"),
    "feat: add"
  );
  assert.equal(buildNextCommitMessage("feat: add"), "feat: add1");
  assert.equal(buildNextCommitMessage("feat: add2"), "feat: add3");
  assert.equal(buildNextCommitMessage(""), "");
});

test("git error helpers match expected patterns", () => {
  assert.equal(
    isNoUpstreamError(
      "There is no tracking information for the current branch."
    ),
    true
  );
  assert.equal(isNoUpstreamError("set-upstream-to"), true);
  assert.equal(isNoUpstreamError("other error"), false);
  assert.equal(
    isRootResetError("unknown revision or path not in the working tree."),
    true
  );
  assert.equal(isRootResetError("random failure"), false);
});
