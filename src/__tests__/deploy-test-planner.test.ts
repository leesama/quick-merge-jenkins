import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeployTestPlan } from "../deploy-test-planner";

test("buildDeployTestPlan returns error when config missing", () => {
  const result = buildDeployTestPlan({
    configFile: null,
    currentBranch: "feat/a",
    remotes: ["origin"],
  });
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.reason, "missing-config");
  }
});

test("buildDeployTestPlan returns error when branch missing", () => {
  const result = buildDeployTestPlan({
    configFile: {
      deployToTest: {
        targetBranch: "pre-test",
        jenkins: { url: "http://jenkins", job: "test" },
      },
    },
    currentBranch: " ",
    remotes: ["origin"],
  });
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.reason, "missing-branch");
  }
});

test("buildDeployTestPlan returns error when jenkins missing", () => {
  const result = buildDeployTestPlan({
    configFile: {
      deployToTest: {
        targetBranch: "pre-test",
      },
    },
    currentBranch: "feat/a",
    remotes: ["origin"],
  });
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.reason, "missing-jenkins");
  }
});

test("buildDeployTestPlan builds merge plan and push intent", () => {
  const result = buildDeployTestPlan({
    configFile: {
      deployToTest: {
        jenkins: { url: "http://jenkins", job: "test" },
      },
    },
    currentBranch: "feature/login",
    remotes: ["origin"],
  });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.plan.currentBranch, "feature/login");
    assert.equal(result.plan.targetBranch, "pre-test");
    assert.equal(result.plan.pushAfterMerge, true);
    assert.equal(result.jenkins.job, "test");
  }
});
