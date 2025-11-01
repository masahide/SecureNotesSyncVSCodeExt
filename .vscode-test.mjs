import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.js",
  workspaceFolder: "./test-workspace",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
  launchArgs: [
    "--disable-extensions",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});
