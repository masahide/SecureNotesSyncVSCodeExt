// VSCode Extension Skeleton for Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { setSecret } from "./secretManager";
import { LocalObjectManager } from "./storage/LocalObjectManager";
import { getOrCreateEnvironmentId } from "./envUtils";
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
      // 1. S3クライアント準備
      const encryptKey = await context.secrets.get(aesEncryptionKey);
      if (!encryptKey) {
        showError("AES Key not set");
        return false;
      }
      const config = vscode.workspace.getConfiguration("encryptSync");
      const options = { environmentId, encryptionKey: encryptKey };
      // const awsAccessKeyId = config.get<string>("awsAccessKeyId");
      // const awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");
      // const s3Bucket = config.get<string>("s3Bucket");
      // const s3Region = config.get<string>("s3Region");
      // if (!awsAccessKeyId || !awsSecretAccessKey || !s3Bucket || !s3Region) {
      //   showError("S3 config incomplete");
      //   return;
      // }

      // TODO: 2. S3 とローカルを同期する
      // const s3Client = new S3Client({ region: s3Region, credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey } });
      // const provider: IStorageProvider = new S3StorageProvider(s3Client, s3Bucket, "files");
      // await provider.sync();
      // showInfo("Rsync-like sync completed.");

      // 3. インデックスファイルを更新したい場合 (例):
      //    例として「ローカルにある最新Indexに変更があれば、新しいindex-xxx.jsonを作る」
      const latestIndex = await LocalObjectManager.loadLatestLocalIndex(options);
      const previousIndex = await LocalObjectManager.loadPreviousIndex(options);
      const localIndex = await LocalObjectManager.generateLocalIndexFile(previousIndex, options);
      const conflicts = LocalObjectManager.detectConflicts(localIndex, latestIndex);
      if (conflicts.length > 0) {
        const conflictsResolved = await LocalObjectManager.resolveConflicts(conflicts, options);
        if (!conflictsResolved) {
          showInfo("Sync aborted due to unresolved conflicts.");
          return true;
        }
      }

      // 7. 新規または変更されたファイルを S3 にアップロード
      const updated = await LocalObjectManager.saveEncryptedObject(localIndex.files, latestIndex, options);

      if (!updated) {
        showInfo("There are no update files.");
        return;
      }

      // 8. ローカルインデックスファイルを更新
      const newIndex = LocalObjectManager.createNewIndexFile(localIndex, previousIndex);
      showInfo("New local index file created.");
      LocalObjectManager.saveLocalIndexFile(newIndex);
    } catch (error: any) {
      showError(`Sync failed: ${error.message}`);
    }
    return true;
  });

  context.subscriptions.push(syncCommand, setAESKeyCommand, generateAESKeyCommand);
  outputChannel.show(true);
}

export function deactivate() {
  logMessage(`${appName} Extension Deactivated.`);
}