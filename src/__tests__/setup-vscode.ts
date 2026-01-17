import * as path from "node:path";
import { Module } from "node:module";

const testModulesPath = __dirname;
const existing = process.env.NODE_PATH
  ? process.env.NODE_PATH.split(path.delimiter).filter(Boolean)
  : [];
if (!existing.includes(testModulesPath)) {
  process.env.NODE_PATH = [testModulesPath, ...existing].join(path.delimiter);
  (Module as any)._initPaths();
}
