import { getConfigGroups } from "../config-groups";
import { getCurrentBranch } from "../git";
import { t } from "../i18n";
import { resolveRepoRoot, resolveRepoRoots } from "../repo";
import { state } from "../state";
import { getErrorMessage } from "../utils";

export async function postState(
  postMessage: (message: unknown) => void,
  options?: { loadConfig?: boolean }
): Promise<void> {
  const activeRepoRoot = await resolveRepoRoot();
  const loadConfig = options?.loadConfig ?? false;
  if (!activeRepoRoot) {
    state.lastConfigRootsKey = "";
    state.lastConfigGroups = [];
    state.lastConfigError = "";
    state.lastConfigLoaded = false;
    postMessage({
      type: "state",
      currentBranch: "",
      configGroups: [],
      configError: t("workspaceNotFound"),
      configLoaded: false,
    });
    return;
  }
  state.lastWorkspaceRoot = activeRepoRoot;
  const repoRoots = await resolveRepoRoots(activeRepoRoot);
  const repoRootsKey = repoRoots.join("|");
  if (state.lastConfigRootsKey !== repoRootsKey) {
    state.lastConfigRootsKey = repoRootsKey;
    state.lastConfigGroups = [];
    state.lastConfigError = "";
    state.lastConfigLoaded = false;
  }
  try {
    const currentBranch = activeRepoRoot
      ? await getCurrentBranch(activeRepoRoot).catch(() => "")
      : "";
    if (loadConfig) {
      const { groups, error } = await getConfigGroups(repoRoots);
      state.lastConfigGroups = groups;
      state.lastConfigError = error;
      state.lastConfigLoaded = true;
    }
    postMessage({
      type: "state",
      currentBranch,
      configGroups: state.lastConfigGroups,
      configError: state.lastConfigError,
      configLoaded: state.lastConfigLoaded,
    });
  } catch (error) {
    postMessage({
      type: "error",
      message: getErrorMessage(error),
    });
  }
}
