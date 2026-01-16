import { ConfigGroup } from "./types";

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
  lastConfigLoaded: boolean;
  lastDemandMessages: Record<string, string>;
}

export const state: ExtensionState = {
  lastFailureContext: null,
  lastConflictFiles: [],
  lastWorkspaceRoot: null,
  lastConfigRootsKey: "",
  lastConfigGroups: [],
  lastConfigError: "",
  lastConfigLoaded: false,
  lastDemandMessages: {},
};
