import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findConsecutiveCommitGroup,
  parseCommitLog,
} from "../rebase-squash-utils";

test("parseCommitLog preserves message segments", () => {
  const commits = parseCommitLog(
    "hash1|feat: add login\nhash2|fix: pipe | in message\n"
  );
  assert.equal(commits.length, 2);
  assert.equal(commits[0].hash, "hash1");
  assert.equal(commits[1].message, "fix: pipe | in message");
});

test("findConsecutiveCommitGroup returns recent consecutive group", () => {
  const indices = findConsecutiveCommitGroup([
    { hash: "a", message: "feat: add1" },
    { hash: "b", message: "feat: add2" },
    { hash: "c", message: "fix: bug" },
  ]);
  assert.deepEqual(indices, [0, 1]);
});

test("findConsecutiveCommitGroup skips singletons", () => {
  const indices = findConsecutiveCommitGroup([
    { hash: "a", message: "feat: add1" },
    { hash: "b", message: "fix: bug1" },
    { hash: "c", message: "fix: bug2" },
  ]);
  assert.deepEqual(indices, [1, 2]);
});
