export interface WebviewMessageHandlerDeps {
  postState: (options?: { loadConfig?: boolean }) => Promise<void>;
  handleDeployTest: (message: any) => Promise<void>;
  handleDeployProd: (repoRoot?: string) => Promise<void>;
  handleSquashDeployProd: (repoRoot?: string) => Promise<void>;
  confirmDeployTest: (message: any) => Promise<void>;
  commitDemandCode: (repoRoot?: string) => Promise<void>;
  checkoutOriginal: () => Promise<void>;
  openConflictFiles: () => Promise<void>;
  openMergeEditor: () => Promise<void>;
  openConfig: (repoRoot?: string) => Promise<void>;
  confirmCommitAndDeploy: (repoRoot?: string) => Promise<void>;
  handleRebaseSquashWithPrompt: (repoRoot?: string) => Promise<void>;
  createDemandBranch: (repoRoot?: string) => Promise<void>;
}

export async function handleWebviewMessage(
  message: any,
  deps: WebviewMessageHandlerDeps
): Promise<void> {
  const type = message?.type;
  if (!type) {
    return;
  }
  if (type === "requestState") {
    const loadConfig = Boolean(message?.loadConfig);
    await deps.postState({ loadConfig });
    return;
  }
  if (type === "deployTest") {
    await deps.handleDeployTest(message);
    return;
  }
  if (type === "deployProd") {
    await deps.handleDeployProd(extractRepoRoot(message));
    return;
  }
  if (type === "squashDeployProd") {
    await deps.handleSquashDeployProd(extractRepoRoot(message));
    return;
  }
  if (type === "confirmDeployTest") {
    await deps.confirmDeployTest(message);
    return;
  }
  if (type === "commitDemand") {
    await deps.commitDemandCode(extractRepoRoot(message));
    return;
  }
  if (type === "checkoutOriginal") {
    await deps.checkoutOriginal();
    return;
  }
  if (type === "openConflictFiles") {
    await deps.openConflictFiles();
    return;
  }
  if (type === "openMergeEditor") {
    await deps.openMergeEditor();
    return;
  }
  if (type === "openConfig") {
    await deps.openConfig(extractRepoRoot(message));
    return;
  }
  if (type === "confirmCommitAndDeploy") {
    await deps.confirmCommitAndDeploy(extractRepoRoot(message));
    return;
  }
  if (type === "rebaseSquash") {
    await deps.handleRebaseSquashWithPrompt(extractRepoRoot(message));
    return;
  }
  if (type === "createDemandBranch") {
    await deps.createDemandBranch(extractRepoRoot(message));
  }
}

function extractRepoRoot(message: any): string | undefined {
  return typeof message?.repoRoot === "string" ? message.repoRoot : undefined;
}
