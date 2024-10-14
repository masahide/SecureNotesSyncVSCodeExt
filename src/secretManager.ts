import * as vscode from "vscode";
import { showInfo, showError } from "./logger";

// Command to set secrets (AES Key or AWS Secret Access Key)
export async function setSecret(
  context: vscode.ExtensionContext,
  secretName: string,
  prompt: string,
  password: boolean = false,
  validate?: (value: string) => string | null
) {
  const secretValue = await vscode.window.showInputBox({
    prompt,
    password,
    validateInput: validate,
  });

  if (secretValue) {
    await context.secrets.store(secretName, secretValue);
    showInfo(`${secretName} saved successfully.`);
  } else {
    showError(`${secretName} is required.`);
  }
}
