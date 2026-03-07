import { launchVsCodeTests } from "./launch-vscode-tests";

async function main(): Promise<void> {
  try {
    await launchVsCodeTests();
    console.log("All VS Code tests completed successfully");
  } catch (error) {
    console.error("VS Code tests failed:", error);
    process.exit(1);
  }
}

void main();
