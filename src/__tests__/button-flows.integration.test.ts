import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, test } from "node:test";

import * as vscode from "vscode";

import type { ActionDeps } from "../actions/action-types";
import {
  confirmDeployTest,
  handleDeployProd,
  handleDeployTest,
  handleMergeToTest,
  handleSquashDeployProd,
} from "../actions/deploy-actions";
import {
  commitDemandCode,
  confirmCommitAndDeploy,
  createDemandBranch,
  saveDemandMessage,
} from "../actions/demand-actions";
import { handleRebaseSquashWithPrompt } from "../actions/rebase-actions";
import {
  checkoutOriginal,
  openConfig as openConfigAction,
  openConflictFiles as openConflictFilesAction,
  openMergeEditor as openMergeEditorAction,
} from "../actions/view-actions";
import { formatDateStamp } from "../extension-utils";
import { runGit } from "../git";
import {
  handleWebviewMessage,
} from "../message-router";
import type { WebviewMessageHandlerDeps } from "../message-router";
import { state } from "../state";
import {
  commitFile,
  createBareRemote,
  createBranch,
  createTempRepo,
  getCurrentBranch,
  setRemoteAndPush,
} from "./helpers/git-test-utils";
import { resetExtensionState } from "./helpers/state-test-utils";

type VscodeMock = {
  reset: () => void;
  setLanguage: (lang: string) => void;
  setWorkspaceFolders: (paths: string[]) => void;
  setConfiguration: (values: Record<string, string>) => void;
  queueQuickPick: (value: any) => void;
  queueInputBox: (value: any) => void;
  queueInfoMessage: (value: any) => void;
  state: {
    showTextDocumentCalls: any[];
    executeCommandCalls: any[];
    openTextDocumentCalls: any[];
    showInformationMessageCalls: any[];
  };
};

const vscodeMock = (vscode as any).__mock as VscodeMock;

beforeEach(() => {
  vscodeMock.reset();
  vscodeMock.setLanguage("en");
  vscodeMock.setConfiguration({});
  resetExtensionState();
});

function createActionDeps(extensionPath?: string) {
  const resolvedExtensionPath =
    extensionPath ?? path.resolve(__dirname, "..", "..");
  const messages: unknown[] = [];
  const postStateCalls: Array<{ loadConfig?: boolean } | undefined> = [];
  const store = new Map<string, any>();
  const deps: ActionDeps = {
    context: {
      extensionPath: resolvedExtensionPath,
      workspaceState: {
        get: (key: string) => store.get(key),
        update: async (key: string, value: any) => {
          store.set(key, value);
        },
      },
    } as any,
    postMessage: (message: unknown) => {
      messages.push(message);
    },
    postState: async (options?: { loadConfig?: boolean }) => {
      postStateCalls.push(options);
    },
  };
  return { deps, messages, postStateCalls, store };
}

function createMessageDeps(deps: ActionDeps): WebviewMessageHandlerDeps {
  return {
    postState: deps.postState,
    handleDeployTest: (message) => handleDeployTest(deps, message),
    handleMergeToTest: (message) => handleMergeToTest(deps, message),
    handleDeployProd: (repoRoot) => handleDeployProd(deps, repoRoot),
    handleSquashDeployProd: (repoRoot) => handleSquashDeployProd(deps, repoRoot),
    confirmDeployTest: (message) => confirmDeployTest(deps, message),
    commitDemandCode: (repoRoot) => commitDemandCode(deps, repoRoot),
    checkoutOriginal: () => checkoutOriginal(deps),
    openConflictFiles: () => openConflictFilesAction(),
    openMergeEditor: () => openMergeEditorAction(),
    openConfig: (repoRoot) => openConfigAction(deps, repoRoot),
    confirmCommitAndDeploy: (repoRoot) => confirmCommitAndDeploy(deps, repoRoot),
    handleRebaseSquashWithPrompt: (repoRoot) =>
      handleRebaseSquashWithPrompt(deps, repoRoot),
    createDemandBranch: (repoRoot) => createDemandBranch(deps, repoRoot),
  };
}

async function writeConfig(
  cwd: string,
  config: Record<string, unknown>
): Promise<void> {
  const content = JSON.stringify(config, null, 2);
  await fs.writeFile(path.join(cwd, ".quick-merge.jsonc"), content, "utf8");
}

async function listBranches(cwd: string): Promise<string[]> {
  const result = await runGit(["branch", "--format=%(refname:short)"], cwd);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function setupWorkspace(cwd: string) {
  vscodeMock.setWorkspaceFolders([cwd]);
}

test("button: openConfig creates config and opens document", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  const configPath = path.join(cwd, ".quick-merge.jsonc");
  await fs.rm(configPath, { force: true });

  await handleWebviewMessage({ type: "openConfig", repoRoot: cwd }, handlerDeps);

  const exists = await fs
    .stat(configPath)
    .then(() => true)
    .catch(() => false);
  assert.equal(exists, true);
  assert.equal(vscodeMock.state.openTextDocumentCalls.length, 1);
});

test("button: openConflictFiles opens selected conflict file", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await fs.writeFile(path.join(cwd, "conflict.txt"), "conflict", "utf8");
  state.lastWorkspaceRoot = cwd;
  state.lastConflictFiles = ["conflict.txt"];
  vscodeMock.queueQuickPick((items: any[]) => items[0]);

  await handleWebviewMessage({ type: "openConflictFiles" }, handlerDeps);

  assert.equal(vscodeMock.state.showTextDocumentCalls.length, 1);
});

test("button: openMergeEditor uses merge editor command", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await fs.writeFile(path.join(cwd, "conflict.txt"), "conflict", "utf8");
  state.lastWorkspaceRoot = cwd;
  state.lastConflictFiles = ["conflict.txt"];

  await handleWebviewMessage({ type: "openMergeEditor" }, handlerDeps);

  assert.equal(vscodeMock.state.executeCommandCalls.length, 1);
  assert.equal(vscodeMock.state.executeCommandCalls[0][0], "vscode.openWith");
});

test("button: checkoutOriginal switches back to original branch", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps, messages } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);
  await createBranch(cwd, "feature/checkout");
  state.lastFailureContext = {
    originalBranch: baseBranch,
    targetBranch: "pre-test",
    cwd,
  };
  state.lastConflictFiles = ["conflict.txt"];

  await handleWebviewMessage({ type: "checkoutOriginal" }, handlerDeps);

  const current = await getCurrentBranch(cwd);
  assert.equal(current, baseBranch);
  assert.equal(state.lastFailureContext, null);
  assert.equal(state.lastConflictFiles.length, 0);
  assert.ok(messages.some((msg: any) => msg?.type === "info"));
});

test("button: createDemandBranch creates branch and empty commit", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  await runGit(["branch", "release_20240101"], cwd);
  await writeConfig(cwd, {
    demandBranch: {
      types: [{ prefix: "feature", commitPrefix: "feat" }],
      releasePrefix: "release",
      deepseekApiKey: "test-key",
      deepseekBaseUrl: "http://localhost",
      deepseekModel: "test-model",
    },
  });

  const deepseek = require("../deepseek") as {
    translateToEnglish: (input: string) => Promise<string>;
  };
  const originalTranslate = deepseek.translateToEnglish;
  deepseek.translateToEnglish = async () => "login page";
  t.after(() => {
    deepseek.translateToEnglish = originalTranslate;
  });

  vscodeMock.queueInputBox("优化登录");

  const dateStamp = formatDateStamp(new Date());
  await handleWebviewMessage(
    { type: "createDemandBranch", repoRoot: cwd },
    handlerDeps
  );

  const branches = await listBranches(cwd);
  const expectedBranch = `feature_login_page_${dateStamp}`;
  assert.ok(branches.includes(expectedBranch));
  const lastMessage = await runGit(["log", "-1", "--pretty=%B"], cwd);
  assert.equal(lastMessage.stdout.trim(), "feat: 优化登录");
  assert.equal(state.lastDemandMessages[cwd], "feat: 优化登录");
});

test("button: commitDemand commits staged changes", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  await saveDemandMessage(deps, cwd, "feat: add login");
  await fs.writeFile(path.join(cwd, "file.txt"), "base\nchange\n", "utf8");
  vscodeMock.queueInputBox("feat: add login1");

  await handleWebviewMessage(
    { type: "commitDemand", repoRoot: cwd },
    handlerDeps
  );

  const lastMessage = await runGit(["log", "-1", "--pretty=%B"], cwd);
  assert.equal(lastMessage.stdout.trim(), "feat: add login1");
});

test("button: deployTest merges and triggers jenkins", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);
  await runGit(["checkout", "-b", "pre-test"], cwd);
  await runGit(["checkout", baseBranch], cwd);
  await createBranch(cwd, "feature/deploy");
  await commitFile(cwd, "file.txt", "base\nfeature\n", "feat: update");

  await writeConfig(cwd, {
    deployToTest: {
      targetBranch: "pre-test",
      jenkins: { url: "http://jenkins", job: "test-job" },
    },
  });

  const jenkins = require("../jenkins") as {
    triggerJenkinsBuild: (...args: any[]) => Promise<void>;
  };
  const originalTrigger = jenkins.triggerJenkinsBuild;
  const calls: any[] = [];
  jenkins.triggerJenkinsBuild = async (...args: any[]) => {
    calls.push(args);
  };
  t.after(() => {
    jenkins.triggerJenkinsBuild = originalTrigger;
  });

  await handleWebviewMessage(
    { type: "deployTest", repoRoot: cwd },
    handlerDeps
  );

  assert.equal(calls.length, 1);
  const context = calls[0][1];
  assert.equal(context.targetBranch, "pre-test");
  const message = await runGit(["log", "-1", "--pretty=%B", "pre-test"], cwd);
  assert.equal(message.stdout.trim(), "feat: update");
});

test("button: mergeToTest merges and pushes", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);
  await runGit(["checkout", "-b", "pre-test"], cwd);
  await runGit(["checkout", baseBranch], cwd);
  await commitFile(cwd, "file.txt", "base\nfeature\n", "feat: merge-to-test");

  const remote = await createBareRemote(t);
  await setRemoteAndPush(cwd, remote, baseBranch);

  await writeConfig(cwd, {
    deployToTest: {
      targetBranch: "pre-test",
    },
  });

  await handleWebviewMessage(
    { type: "mergeToTest", repoRoot: cwd },
    handlerDeps
  );

  const message = await runGit(["log", "-1", "--pretty=%B", "pre-test"], cwd);
  assert.equal(message.stdout.trim(), "feat: merge-to-test");
  const remoteHead = await runGit(
    ["ls-remote", "--heads", "origin", "pre-test"],
    cwd
  );
  assert.ok(remoteHead.stdout.includes("pre-test"));
});

test("button: confirmDeployTest confirms then deploys", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);
  await runGit(["checkout", "-b", "pre-test"], cwd);
  await runGit(["checkout", baseBranch], cwd);
  await createBranch(cwd, "feature/confirm");
  await commitFile(cwd, "file.txt", "base\nconfirm\n", "feat: confirm");

  await writeConfig(cwd, {
    deployToTest: {
      targetBranch: "pre-test",
      jenkins: { url: "http://jenkins", job: "test-job" },
    },
  });

  const jenkins = require("../jenkins") as {
    triggerJenkinsBuild: (...args: any[]) => Promise<void>;
  };
  const originalTrigger = jenkins.triggerJenkinsBuild;
  const calls: any[] = [];
  jenkins.triggerJenkinsBuild = async (...args: any[]) => {
    calls.push(args);
  };
  t.after(() => {
    jenkins.triggerJenkinsBuild = originalTrigger;
  });

  await handleWebviewMessage(
    { type: "confirmDeployTest", repoRoot: cwd, label: "Confirm" },
    handlerDeps
  );

  assert.equal(calls.length, 1);
  assert.ok(vscodeMock.state.showInformationMessageCalls.length > 0);
});

test("button: deployProd creates prod branch and merges", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  await runGit(["branch", "prod_20240101"], cwd);
  await createBranch(cwd, "feat/deploy-prod");
  await commitFile(cwd, "file.txt", "base\nprod\n", "feat: prod");

  await writeConfig(cwd, {
    deployToProd: {
      prodPrefix: ["prod"],
    },
  });

  vscodeMock.queueQuickPick((items: any[]) => items.slice(0, 1));
  vscodeMock.queueQuickPick((items: any[]) => items.slice(0, 1));

  await handleWebviewMessage(
    { type: "deployProd", repoRoot: cwd },
    handlerDeps
  );

  const dateStamp = formatDateStamp(new Date());
  const targetBranch = `prod_${dateStamp}`;
  const branches = await listBranches(cwd);
  assert.ok(branches.includes(targetBranch));
  const message = await runGit(["log", "-1", "--pretty=%B", targetBranch], cwd);
  assert.equal(message.stdout.trim(), "feat: prod");
});

test("button: rebaseSquash squashes selected commits", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  await commitFile(cwd, "file.txt", "base\none\n", "feat: add");
  await commitFile(cwd, "file.txt", "base\ntwo\n", "feat: add1");
  const branch = await getCurrentBranch(cwd);
  const remote = await createBareRemote(t);
  await setRemoteAndPush(cwd, remote, branch);

  vscodeMock.queueQuickPick((items: any[]) => items.slice(0, 2));

  await handleWebviewMessage(
    { type: "rebaseSquash", repoRoot: cwd },
    handlerDeps
  );

  const count = await runGit(["rev-list", "--count", "HEAD"], cwd);
  assert.equal(Number(count.stdout.trim()), 2);
});

test("button: squashDeployProd squashes then deploys", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  await runGit(["branch", "prod_20240101"], cwd);
  await createBranch(cwd, "feat/squash-prod");
  await commitFile(cwd, "file.txt", "base\none\n", "feat: add");
  await commitFile(cwd, "file.txt", "base\ntwo\n", "feat: add1");
  const branch = await getCurrentBranch(cwd);
  const remote = await createBareRemote(t);
  await setRemoteAndPush(cwd, remote, branch);

  await writeConfig(cwd, {
    deployToProd: {
      prodPrefix: ["prod"],
    },
  });

  vscodeMock.queueQuickPick((items: any[]) => items.slice(0, 2));
  vscodeMock.queueQuickPick((items: any[]) => items.slice(0, 1));
  vscodeMock.queueQuickPick((items: any[]) => items.slice(0, 1));

  await handleWebviewMessage(
    { type: "squashDeployProd", repoRoot: cwd },
    handlerDeps
  );

  const dateStamp = formatDateStamp(new Date());
  const targetBranch = `prod_${dateStamp}`;
  const branches = await listBranches(cwd);
  assert.ok(branches.includes(targetBranch));
});

test("button: confirmCommitAndDeploy commits then deploys", async (t) => {
  const cwd = await createTempRepo(t);
  setupWorkspace(cwd);
  const { deps } = createActionDeps();
  const handlerDeps = createMessageDeps(deps);
  await commitFile(cwd, "file.txt", "base\n", "chore: init");
  const baseBranch = await getCurrentBranch(cwd);
  await runGit(["checkout", "-b", "pre-test"], cwd);
  await runGit(["checkout", baseBranch], cwd);
  await createBranch(cwd, "feature/commit-deploy");
  await fs.writeFile(path.join(cwd, "file.txt"), "base\nchange\n", "utf8");
  await saveDemandMessage(deps, cwd, "feat: add login");

  await writeConfig(cwd, {
    deployToTest: {
      targetBranch: "pre-test",
      jenkins: { url: "http://jenkins", job: "test-job" },
    },
  });

  const jenkins = require("../jenkins") as {
    triggerJenkinsBuild: (...args: any[]) => Promise<void>;
  };
  const originalTrigger = jenkins.triggerJenkinsBuild;
  const calls: any[] = [];
  jenkins.triggerJenkinsBuild = async (...args: any[]) => {
    calls.push(args);
  };
  t.after(() => {
    jenkins.triggerJenkinsBuild = originalTrigger;
  });

  vscodeMock.queueInputBox("feat: add login1");

  await handleWebviewMessage(
    { type: "confirmCommitAndDeploy", repoRoot: cwd },
    handlerDeps
  );

  const lastMessage = await runGit(["log", "-1", "--pretty=%B"], cwd);
  assert.equal(lastMessage.stdout.trim(), "feat: add login1");
  assert.equal(calls.length, 1);
  const message = await runGit(["log", "-1", "--pretty=%B", "pre-test"], cwd);
  assert.equal(message.stdout.trim(), "feat: add login1");
});
