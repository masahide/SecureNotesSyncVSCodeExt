import * as path from "path";

import { runTests } from "@vscode/test-electron";

export async function launchVsCodeTests(testFilter?: string): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../../");
  const extensionTestsPath = path.resolve(
    __dirname,
    "../../out/test/extension-host-runner.js",
  );

  if (testFilter) {
    process.env.SECURE_NOTES_TEST_FILTER = testFilter;
  } else {
    delete process.env.SECURE_NOTES_TEST_FILTER;
  }

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      "--disable-extensions",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
}
