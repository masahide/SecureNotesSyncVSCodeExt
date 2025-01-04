import * as vscode from "vscode";
import * as os from "os";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { setSecret } from "./secretManager";
import { LocalObjectManager } from "./storage/LocalObjectManager";
import { GitHubSyncProvider } from "./storage/GithubProvider";
import * as crypto from "crypto";


const aesEncryptionKey = "aesEncryptionKey";
const appName = "SecureNotesSync";

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  const outputChannel = vscode.window.createOutputChannel(appName);
  setOutputChannel(outputChannel);
  showInfo(`${appName} Extension Activated`);

  // 環境IDを生成or取得 (ホスト名 + UUID)
  const environmentId = await getOrCreateEnvironmentId(context);
  logMessage(`Current Environment ID: ${environmentId}`);

  // Command to Set AES Key
  let setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKey", () =>
    setSecret(context,
      aesEncryptionKey,
      "Enter AES Encryption Key (64 hex characters representing 32 bytes)",
      true,
      (value) => value.length === 64 ? null : "AES Key must be 64 hex characters long"
    )
  );

  /*
  // Command to Set AWS Credentials
  let setAWSSecretCommand = vscode.commands.registerCommand("extension.setAWSSecretCommand", async () => {
    const awsAccessKeyId = await vscode.window.showInputBox({
      prompt: "Enter AWS Access Key ID",
    });
    const awsSecretAccessKey = await vscode.window.showInputBox({
      prompt: "Enter AWS Secret Access Key",
      password: true,
    });

    if (awsAccessKeyId && awsSecretAccessKey) {
      const config = vscode.workspace.getConfiguration(appName);
      await config.update("awsAccessKeyId", awsAccessKeyId, vscode.ConfigurationTarget.Global);
      await context.secrets.store("awsSecretAccessKey", awsSecretAccessKey);
      showInfo("AWS Credentials saved successfully.");
    } else {
      showError("Both AWS Access Key ID and Secret Access Key are required.");
    }
  });
  */

  // Command to Generate 32-Byte Encrypted Text
  let generateAESKeyCommand = vscode.commands.registerCommand("extension.generateAESKey", async () => {
    logMessage("Generating 32-byte AES encryption key...");
    const key = crypto.randomBytes(32).toString("hex"); // 32 bytes
    try {
      await context.secrets.store("aesEncryptionKey", key);
      showInfo(`Generated and stored AES key: ${key}`);
    } catch (error: any) {
      showError(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  let syncCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    try {
      const encryptKey = await context.secrets.get(aesEncryptionKey);
      if (!encryptKey) {
        showError("AES Key not set");
        return false;
      }
      const config = vscode.workspace.getConfiguration(appName);
      const options = { environmentId: environmentId, encryptionKey: encryptKey };
      const latestIndex = await LocalObjectManager.loadLatestLocalIndex(options);
      const previousIndex = await LocalObjectManager.loadPreviousIndex(options);
      logMessage(`Loaded latest index file: ${latestIndex.uuid}\n previous index file: ${previousIndex.uuid}`);
      const localIndex = await LocalObjectManager.generateLocalIndexFile(previousIndex, options);
      const conflicts = LocalObjectManager.detectConflicts(localIndex, latestIndex);
      if (conflicts.length > 0) {
        const conflictsResolved = await LocalObjectManager.resolveConflicts(conflicts, options);
        if (!conflictsResolved) {
          showInfo("Sync aborted due to unresolved conflicts.");
          return true;
        }
      }

      const updated = await LocalObjectManager.saveEncryptedObject(localIndex.files, latestIndex, options);
      if (!updated) {
        showInfo("There are no update files.");
        return;
      }

      const newIndex = LocalObjectManager.createNewIndexFile(localIndex, previousIndex);
      showInfo("New local index file created.");
      LocalObjectManager.saveLocalIndexFile(newIndex, options);
    } catch (error: any) {
      showError(`Sync failed: ${error.message}`);
    }
    return true;
  });

  let syncWithGitHubCommand = vscode.commands.registerCommand("extension.syncWithGitHub", async () => {
    try {
      const gitRemoteUrl = vscode.workspace.getConfiguration(appName).get<string>('gitRemoteUrl');
      if (!gitRemoteUrl) {
        showError("設定でGitHubリポジトリURLを設定してください。");
        return;
      }
      const cloudStorageProvider = new GitHubSyncProvider(gitRemoteUrl);
      cloudStorageProvider.sync();
    } catch (error: any) {
      showError(`Cloud sync failed: ${error.message}`);
    }
  });

  context.subscriptions.push(syncCommand, setAESKeyCommand, generateAESKeyCommand, syncWithGitHubCommand);
  outputChannel.show(true);
}

export function deactivate() {
  logMessage(`${appName} Extension Deactivated.`);
}


const ENV_ID_KEY = "encryptSyncEnvironmentId";
async function getOrCreateEnvironmentId(context: vscode.ExtensionContext): Promise<string> {
  let envId = context.globalState.get<string>(ENV_ID_KEY);
  if (!envId) {
    const hostname = os.hostname();
    envId = `${hostname}-${crypto.randomUUID()}`;
    await context.globalState.update(ENV_ID_KEY, envId);
  }
  return envId;
}
