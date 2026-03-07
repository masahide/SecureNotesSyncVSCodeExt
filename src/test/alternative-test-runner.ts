import { launchVsCodeTests } from "./launch-vscode-tests";

async function main() {
  try {
    await launchVsCodeTests("SyncService.test.js");
    console.log("SyncService tests completed successfully");
  } catch (err) {
    console.error("SyncService tests failed:", err);
    process.exit(1);
  }
}

void main();
