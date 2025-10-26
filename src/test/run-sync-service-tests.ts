import { getVscode } from "./helpers/getVscode";

// Ensure vscode (real or stub) is loaded before executing tests.
getVscode();

(async () => {
  await import("./SyncService.test");
})();
