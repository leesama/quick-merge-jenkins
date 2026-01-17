import { state } from "../../state";

export function resetExtensionState(): void {
  state.lastFailureContext = null;
  state.lastConflictFiles = [];
  state.lastWorkspaceRoot = null;
  state.lastConfigRootsKey = "";
  state.lastConfigGroups = [];
  state.lastConfigError = "";
  state.lastConfigLoaded = false;
  state.lastDemandMessages = {};
}
