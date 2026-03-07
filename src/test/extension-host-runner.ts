import * as fs from "fs";
import * as path from "path";

import { getVscode } from "./helpers/getVscode";
import {
  installTestGlobals,
  resetTestRegistry,
  runRegisteredTests,
} from "./framework";

function collectTestFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (!entry.name.endsWith(".test.js")) {
      continue;
    }

    files.push(fullPath);
  }

  return files.sort();
}

function shouldRunTestFile(filePath: string): boolean {
  const requestedFilter = process.env.SECURE_NOTES_TEST_FILTER;
  if (!requestedFilter) {
    return true;
  }

  return filePath.includes(requestedFilter);
}

export async function run(): Promise<void> {
  getVscode();
  resetTestRegistry();
  installTestGlobals();

  const testDir = __dirname;
  const testFiles = collectTestFiles(testDir).filter(shouldRunTestFile);

  if (testFiles.length === 0) {
    throw new Error("No test files matched the requested filter");
  }

  for (const testFile of testFiles) {
    require(testFile);
  }

  await runRegisteredTests();
}
