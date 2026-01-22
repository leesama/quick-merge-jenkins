import * as fs from "node:fs/promises";
import * as path from "node:path";

type MockUri = { fsPath: string; path: string; scheme: string };
type WorkspaceFolder = { uri: MockUri };

interface MockState {
  language: string;
  workspaceFolders: WorkspaceFolder[];
  activeTextEditor: { document: { uri: MockUri } } | null;
  configuration: Record<string, string>;
  quickPickQueue: Array<any>;
  inputBoxQueue: Array<any>;
  infoMessageQueue: Array<any>;
  errorMessageQueue: Array<any>;
  showTextDocumentCalls: any[];
  executeCommandCalls: any[];
  openTextDocumentCalls: any[];
  showInformationMessageCalls: any[];
  showErrorMessageCalls: any[];
  showQuickPickCalls: any[];
  showInputBoxCalls: any[];
  writeFileCalls: any[];
  readFileCalls: any[];
  statCalls: any[];
  openExternalCalls: any[];
  openExternalQueue: Array<any>;
}

const mockState: MockState = {
  language: "en",
  workspaceFolders: [],
  activeTextEditor: null,
  configuration: {},
  quickPickQueue: [],
  inputBoxQueue: [],
  infoMessageQueue: [],
  errorMessageQueue: [],
  showTextDocumentCalls: [],
  executeCommandCalls: [],
  openTextDocumentCalls: [],
  showInformationMessageCalls: [],
  showErrorMessageCalls: [],
  showQuickPickCalls: [],
  showInputBoxCalls: [],
  writeFileCalls: [],
  readFileCalls: [],
  statCalls: [],
  openExternalCalls: [],
  openExternalQueue: [],
};

export const __mock = {
  state: mockState,
  reset() {
    mockState.language = "en";
    mockState.workspaceFolders = [];
    mockState.activeTextEditor = null;
    mockState.configuration = {};
    mockState.quickPickQueue = [];
    mockState.inputBoxQueue = [];
    mockState.infoMessageQueue = [];
    mockState.errorMessageQueue = [];
    mockState.showTextDocumentCalls = [];
    mockState.executeCommandCalls = [];
    mockState.openTextDocumentCalls = [];
    mockState.showInformationMessageCalls = [];
    mockState.showErrorMessageCalls = [];
    mockState.showQuickPickCalls = [];
    mockState.showInputBoxCalls = [];
    mockState.writeFileCalls = [];
    mockState.readFileCalls = [];
    mockState.statCalls = [];
    mockState.openExternalCalls = [];
    mockState.openExternalQueue = [];
  },
  setLanguage(language: string) {
    mockState.language = language;
  },
  setWorkspaceFolders(paths: string[]) {
    mockState.workspaceFolders = paths.map((folderPath) => ({
      uri: Uri.file(folderPath),
    }));
  },
  setActiveTextEditorPath(filePath: string | null) {
    if (!filePath) {
      mockState.activeTextEditor = null;
      return;
    }
    mockState.activeTextEditor = { document: { uri: Uri.file(filePath) } };
  },
  setConfiguration(values: Record<string, string>) {
    mockState.configuration = { ...values };
  },
  queueQuickPick(result: any) {
    mockState.quickPickQueue.push(result);
  },
  queueInputBox(result: any) {
    mockState.inputBoxQueue.push(result);
  },
  queueInfoMessage(result: any) {
    mockState.infoMessageQueue.push(result);
  },
  queueErrorMessage(result: any) {
    mockState.errorMessageQueue.push(result);
  },
  queueOpenExternal(result: any) {
    mockState.openExternalQueue.push(result);
  },
};

export const env = {
  get language() {
    return mockState.language;
  },
  set language(value: string) {
    mockState.language = value;
  },
  async openExternal(uri: MockUri) {
    mockState.openExternalCalls.push([uri]);
    const next = mockState.openExternalQueue.shift();
    if (next !== undefined) {
      return next;
    }
    return true;
  },
};

export const window = {
  get activeTextEditor() {
    return mockState.activeTextEditor;
  },
  set activeTextEditor(value: { document: { uri: MockUri } } | null) {
    mockState.activeTextEditor = value;
  },
  async showErrorMessage(message: string, ...items: string[]) {
    mockState.showErrorMessageCalls.push([message, ...items]);
    const next = mockState.errorMessageQueue.shift();
    if (next !== undefined) {
      return next;
    }
    return items[0];
  },
  async showInformationMessage(message: string, ...rest: any[]) {
    mockState.showInformationMessageCalls.push([message, ...rest]);
    const items = rest.filter((item) => typeof item === "string");
    const next = mockState.infoMessageQueue.shift();
    if (next !== undefined) {
      return next;
    }
    return items[0];
  },
  async showQuickPick(items: any[], options?: any) {
    mockState.showQuickPickCalls.push([items, options]);
    const next = mockState.quickPickQueue.shift();
    if (typeof next === "function") {
      return next(items, options);
    }
    if (next !== undefined) {
      return next;
    }
    if (options?.canPickMany) {
      return items.length > 0 ? [items[0]] : [];
    }
    return items[0];
  },
  createQuickPick<T>() {
    const acceptListeners: Array<() => void> = [];
    const hideListeners: Array<() => void> = [];
    const quickPick = {
      items: [] as T[],
      selectedItems: [] as T[],
      canSelectMany: false,
      placeholder: "",
      onDidAccept(callback: () => void) {
        acceptListeners.push(callback);
        return { dispose() {} };
      },
      onDidHide(callback: () => void) {
        hideListeners.push(callback);
        return { dispose() {} };
      },
      show() {
        const next = mockState.quickPickQueue.shift();
        if (typeof next === "function") {
          const result = next(quickPick.items, {
            canPickMany: quickPick.canSelectMany,
          });
          applyQuickPickResult(result);
          return;
        }
        if (next !== undefined) {
          applyQuickPickResult(next);
          return;
        }
        if (quickPick.canSelectMany) {
          quickPick.selectedItems =
            quickPick.selectedItems.length > 0
              ? quickPick.selectedItems
              : quickPick.items.slice();
        } else {
          quickPick.selectedItems =
            quickPick.items.length > 0 ? [quickPick.items[0]] : [];
        }
        acceptListeners.forEach((listener) => listener());
      },
      hide() {
        hideListeners.forEach((listener) => listener());
      },
      dispose() {},
    };
    const applyQuickPickResult = (result: any) => {
      if (result === undefined) {
        quickPick.hide();
        return;
      }
      if (Array.isArray(result)) {
        quickPick.selectedItems = result;
      } else {
        quickPick.selectedItems = [result];
      }
      acceptListeners.forEach((listener) => listener());
    };
    return quickPick;
  },
  async showInputBox(options?: { value?: string }) {
    mockState.showInputBoxCalls.push([options]);
    const next = mockState.inputBoxQueue.shift();
    if (typeof next === "function") {
      return next(options);
    }
    if (next !== undefined) {
      return next;
    }
    return options?.value;
  },
  async showTextDocument(doc: any, options?: any) {
    mockState.showTextDocumentCalls.push([doc, options]);
    return doc;
  },
};

export const workspace = {
  get workspaceFolders() {
    return mockState.workspaceFolders;
  },
  set workspaceFolders(value: WorkspaceFolder[]) {
    mockState.workspaceFolders = value;
  },
  fs: {
    async stat(target: MockUri | string) {
      const filePath = typeof target === "string" ? target : target.fsPath;
      mockState.statCalls.push([filePath]);
      const stat = await fs.stat(filePath);
      const type = stat.isDirectory() ? FileType.Directory : FileType.File;
      return { type };
    },
    async readFile(target: MockUri | string) {
      const filePath = typeof target === "string" ? target : target.fsPath;
      mockState.readFileCalls.push([filePath]);
      return fs.readFile(filePath);
    },
    async writeFile(target: MockUri | string, content: Uint8Array) {
      const filePath = typeof target === "string" ? target : target.fsPath;
      mockState.writeFileCalls.push([filePath]);
      await fs.writeFile(filePath, content);
    },
  },
  async openTextDocument(target: MockUri | string) {
    const uri = typeof target === "string" ? Uri.file(target) : target;
    mockState.openTextDocumentCalls.push([uri]);
    return { uri };
  },
  asRelativePath(target: string, includeWorkspaceFolder?: boolean) {
    const root = mockState.workspaceFolders[0]?.uri.fsPath;
    if (!root) {
      return target;
    }
    const relative = path.relative(root, target);
    if (includeWorkspaceFolder) {
      return relative || path.basename(root);
    }
    return relative;
  },
  getWorkspaceFolder(uri: MockUri) {
    return (
      mockState.workspaceFolders.find((folder) =>
        uri.fsPath.startsWith(folder.uri.fsPath)
      ) ?? null
    );
  },
  getConfiguration() {
    return {
      get: (key: string) => mockState.configuration[key],
    };
  },
};

export const commands = {
  async executeCommand(...args: any[]) {
    mockState.executeCommandCalls.push(args);
    return undefined;
  },
};

export const FileType = {
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
};

export const Uri = {
  file(filePath: string): MockUri {
    return {
      fsPath: filePath,
      path: filePath,
      scheme: "file",
    };
  },
  parse(value: string): MockUri {
    const match = value.match(/^([a-zA-Z][\w+.-]*):/);
    return {
      fsPath: value,
      path: value,
      scheme: match ? match[1] : "",
    };
  },
};
