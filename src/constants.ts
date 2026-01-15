import { UiLabels } from "./types";

export const CONFIG_FILE_NAME = ".quick-merge.json";

export const DEFAULT_UI_LABELS: UiLabels = {
  refreshLabel: "⟳",
  openConfigLabel: "打开配置文件",
};

export const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  ".vscode",
  ".idea",
]);
