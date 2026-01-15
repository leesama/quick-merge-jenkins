import { DEFAULT_UI_LABELS } from "./constants";
import { ConfigGroup, UiLabels } from "./types";

export interface FailureContext {
  originalBranch: string;
  targetBranch: string;
  cwd: string;
}

export interface ExtensionState {
  lastFailureContext: FailureContext | null;
  lastConflictFiles: string[];
  lastWorkspaceRoot: string | null;
  lastConfigRootsKey: string;
  lastConfigGroups: ConfigGroup[];
  lastConfigError: string;
  lastUiLabels: UiLabels;
  lastConfigLoaded: boolean;
  lastHasMissingConfig: boolean;
}

export const state: ExtensionState = {
  lastFailureContext: null,
  lastConflictFiles: [],
  lastWorkspaceRoot: null,
  lastConfigRootsKey: "",
  lastConfigGroups: [],
  lastConfigError: "",
  lastUiLabels: DEFAULT_UI_LABELS,
  lastConfigLoaded: false,
  lastHasMissingConfig: false,
};
