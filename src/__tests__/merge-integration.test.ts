import assert from "node:assert/strict";
import { test } from "node:test";

import { performMerge } from "../merge";
import { runGit } from "../git";
import type { ResolvedMergePlan } from "../types";
import {
  commitFile,
  createTempRepo,
  getCurrentBranch,
} from "./helpers/git-test-utils";

test("performMerge succeeds on fast-forward merge", async (t) => {
  const cwd = await createTempRepo(t);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);

  await runGit(["checkout", "-b", "feature/ff"], cwd);
  await commitFile(cwd, "file.txt", "base\nfeature\n", "feat: update");

  await runGit(["checkout", baseBranch], cwd);
  await runGit(["checkout", "-b", "pre-test"], cwd);
  await runGit(["checkout", baseBranch], cwd);

  const plan: ResolvedMergePlan = {
    currentBranch: baseBranch,
    sourceBranch: "feature/ff",
    targetBranch: "pre-test",
    strategyFlag: "",
    strategyLabel: "default",
    pushAfterMerge: false,
    pushRemote: null,
    jenkins: undefined,
  };

  const result = await performMerge(cwd, plan);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.targetBranch, "pre-test");
    assert.equal(result.pushStatus, "skipped");
    assert.ok(result.files.includes("file.txt"));
  }
});

test("performMerge reports conflicts when merge fails", async (t) => {
  const cwd = await createTempRepo(t);
  await commitFile(cwd, "conflict.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);

  await runGit(["checkout", "-b", "feature/conflict"], cwd);
  await commitFile(cwd, "conflict.txt", "feature\n", "feat: change");

  await runGit(["checkout", baseBranch], cwd);
  await runGit(["checkout", "-b", "pre-test"], cwd);
  await commitFile(cwd, "conflict.txt", "target\n", "chore: target change");
  await runGit(["checkout", baseBranch], cwd);

  const plan: ResolvedMergePlan = {
    currentBranch: baseBranch,
    sourceBranch: "feature/conflict",
    targetBranch: "pre-test",
    strategyFlag: "",
    strategyLabel: "default",
    pushAfterMerge: false,
    pushRemote: null,
    jenkins: undefined,
  };

  const result = await performMerge(cwd, plan);
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.ok(result.conflicts.includes("conflict.txt"));
  }
});
