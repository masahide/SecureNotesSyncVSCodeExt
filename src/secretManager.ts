import * as vscode from "vscode";
import { showInfo, showError } from "./logger";
import { Config } from "./dotdir/config";

// Command to set secrets (AES Key or AWS Secret Access Key)
export async function setSecret(
  context: vscode.ExtensionContext,
  config: Config,
  prompt: string,
  validate?: (value: string) => string | null
) {
  const password = true;
  const secretValue = await vscode.window.showInputBox({
    prompt,
    password,
    validateInput: validate,
  });

  if (secretValue) {
    await storeSecret(context, config, secretValue);
    showInfo(`Secret vaule saved successfully.`);
  } else {
    showError(`No value provided for Secret value`);
  }
}

export async function storeSecret(context: vscode.ExtensionContext, config: Config, secretValue: string) {
  const key = SecretKey(config);
  if (secretValue) {
    await context.secrets.store(key, secretValue);
    showInfo(`${key} saved successfully.`);
  } else {
    showError(`No value provided for ${key}.`);
  }
}

export function SecretKey(config: Config): string {
  return `aesSecret.${config.core.localID}`;
}

export async function getSecret(context: vscode.ExtensionContext, secretKey: string): Promise<string | undefined> {
  return context.secrets.get(secretKey);
}
