import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleWebviewMessage,
  WebviewMessageHandlerDeps,
} from "../message-router";

function createAsyncSpy() {
  const calls: unknown[][] = [];
  const fn = async (...args: unknown[]) => {
    calls.push(args);
  };
  return { fn, calls };
}

function createDeps(): {
  deps: WebviewMessageHandlerDeps;
  spies: Record<string, ReturnType<typeof createAsyncSpy>>;
} {
  const spies = {
    postState: createAsyncSpy(),
    handleDeployTest: createAsyncSpy(),
    handleMergeToTest: createAsyncSpy(),
    handleDeployProd: createAsyncSpy(),
    handleSquashDeployProd: createAsyncSpy(),
    confirmDeployTest: createAsyncSpy(),
    confirmDeployProdEnv: createAsyncSpy(),
    commitDemandCode: createAsyncSpy(),
    checkoutOriginal: createAsyncSpy(),
    openConflictFiles: createAsyncSpy(),
    openMergeEditor: createAsyncSpy(),
    openConfig: createAsyncSpy(),
    confirmCommitAndDeploy: createAsyncSpy(),
    handleRebaseSquashWithPrompt: createAsyncSpy(),
    createDemandBranch: createAsyncSpy(),
  };
  const deps: WebviewMessageHandlerDeps = {
    postState: spies.postState.fn,
    handleDeployTest: spies.handleDeployTest.fn,
    handleMergeToTest: spies.handleMergeToTest.fn,
    handleDeployProd: spies.handleDeployProd.fn,
    handleSquashDeployProd: spies.handleSquashDeployProd.fn,
    confirmDeployTest: spies.confirmDeployTest.fn,
    confirmDeployProdEnv: spies.confirmDeployProdEnv.fn,
    commitDemandCode: spies.commitDemandCode.fn,
    checkoutOriginal: spies.checkoutOriginal.fn,
    openConflictFiles: spies.openConflictFiles.fn,
    openMergeEditor: spies.openMergeEditor.fn,
    openConfig: spies.openConfig.fn,
    confirmCommitAndDeploy: spies.confirmCommitAndDeploy.fn,
    handleRebaseSquashWithPrompt: spies.handleRebaseSquashWithPrompt.fn,
    createDemandBranch: spies.createDemandBranch.fn,
  };
  return { deps, spies };
}

test("handleWebviewMessage routes requestState to postState", async () => {
  const { deps, spies } = createDeps();
  await handleWebviewMessage({ type: "requestState", loadConfig: true }, deps);
  assert.equal(spies.postState.calls.length, 1);
  assert.deepEqual(spies.postState.calls[0], [{ loadConfig: true }]);
  assert.equal(spies.handleDeployTest.calls.length, 0);
});

test("handleWebviewMessage routes deployProd with repoRoot", async () => {
  const { deps, spies } = createDeps();
  await handleWebviewMessage(
    { type: "deployProd", repoRoot: "/tmp/repo" },
    deps
  );
  assert.equal(spies.handleDeployProd.calls.length, 1);
  assert.deepEqual(spies.handleDeployProd.calls[0], ["/tmp/repo"]);
});

test("handleWebviewMessage routes confirmDeployProdEnv with repoRoot", async () => {
  const { deps, spies } = createDeps();
  await handleWebviewMessage(
    { type: "confirmDeployProdEnv", repoRoot: "/tmp/repo" },
    deps
  );
  assert.equal(spies.confirmDeployProdEnv.calls.length, 1);
  assert.deepEqual(spies.confirmDeployProdEnv.calls[0], ["/tmp/repo"]);
});

test("handleWebviewMessage routes mergeToTest", async () => {
  const { deps, spies } = createDeps();
  await handleWebviewMessage({ type: "mergeToTest", repoRoot: "/tmp/repo" }, deps);
  assert.equal(spies.handleMergeToTest.calls.length, 1);
  assert.deepEqual(spies.handleMergeToTest.calls[0], [
    { type: "mergeToTest", repoRoot: "/tmp/repo" },
  ]);
});

test("handleWebviewMessage routes openConfig without repoRoot", async () => {
  const { deps, spies } = createDeps();
  await handleWebviewMessage({ type: "openConfig", repoRoot: 123 }, deps);
  assert.equal(spies.openConfig.calls.length, 1);
  assert.deepEqual(spies.openConfig.calls[0], [undefined]);
});

test("handleWebviewMessage ignores unknown type", async () => {
  const { deps, spies } = createDeps();
  await handleWebviewMessage({ type: "unknown" }, deps);
  const totalCalls = Object.values(spies).reduce(
    (sum, spy) => sum + spy.calls.length,
    0
  );
  assert.equal(totalCalls, 0);
});
