// VSCode Extension Skeleton for Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  initializeS3,
  getHeadIndexUUID,
  detectConflicts,
  generateLocalIndexFile,
  uploadFilesToS3,
  getIndexFile,
  resolveConflicts,
  createNewIndexFile,
  encryptAndUploadIndexFile,
  updateHeadFile,
} from "./s3Utils";
import { streamToBuffer } from "./streamUtils";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { encryptContent, decryptContent } from "./cryptoUtils";
import { setSecret } from "./secretManager";
import * as crypto from "crypto";

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  const outputChannel = vscode.window.createOutputChannel("EncryptSyncS3");
  setOutputChannel(outputChannel);
  showInfo("EncryptSyncS3 Extension Activated");

  // Command to Set AES Key
  let setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKeyCommand", () =>
    setSecret(context, "aesEncryptionKey", "Enter AES Encryption Key (64 hex characters representing 32 bytes)", true, (value) =>
      value.length === 64 ? null : "AES Key must be 64 hex characters long"
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
      const config = vscode.workspace.getConfiguration("encryptSyncS3");
      await config.update("awsAccessKeyId", awsAccessKeyId, vscode.ConfigurationTarget.Global);
      await context.secrets.store("awsSecretAccessKey", awsSecretAccessKey);
      showInfo("AWS Credentials saved successfully.");
    } else {
      showError("Both AWS Access Key ID and Secret Access Key are required.");
    }
  });

  // Command to Sync Notes with S3
  let syncNotesCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    logMessage("Starting note sync with S3...");

    try {
      // 1. S3 クライアントと設定の初期化
      const s3 = await initializeS3(context);

      // 2. HEAD ファイルを取得・復号して最新のインデックスファイルの UUID を取得
      const remoteIndexUUID = await getHeadIndexUUID(s3);

      // 3. リモートの最新インデックスファイルを取得・復号
      const remoteIndex = await getIndexFile(s3, remoteIndexUUID);

      // 4. ローカルのインデックスファイルを生成
      const localIndex = await generateLocalIndexFile();

      // 5. 競合の検出
      const conflicts = detectConflicts(localIndex, remoteIndex);

      // 6. 競合がある場合、解決を試みる
      if (conflicts.length > 0) {
        const conflictsResolved = await resolveConflicts(conflicts, s3);
        if (!conflictsResolved) {
          showInfo("Sync aborted due to unresolved conflicts.");
          return;
        }
      }

      // 7. 新規または変更されたファイルを S3 にアップロード
      const uploaded = await uploadFilesToS3(localIndex.files, s3);

      if (!uploaded) {
        showInfo("There are no update files.");
        return;
      }

      // 8. 新しいインデックスファイルを作成し、アップロード
      const newIndex = createNewIndexFile(localIndex, remoteIndexUUID);
      const newIndexUUID = await encryptAndUploadIndexFile(newIndex, s3);

      // 9. HEAD ファイルを新しいインデックスファイルの UUID で更新
      await updateHeadFile(newIndexUUID, s3);

      showInfo("Notes synced with S3 successfully.");
    } catch (error: any) {
      showError(`Error syncing notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Sync Notes with S3
  let syncNotesCommandOld = vscode.commands.registerCommand("extension.syncNotes2", async () => {
    logMessage("Starting note sync with S3...");
    try {
      const { s3, s3Bucket, s3PrefixPath, aesEncryptionKey } = await initializeS3(context);

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"));
          for (const file of files) {
            const content = await vscode.workspace.fs.readFile(file);
            const encryptedContent = encryptContent(content, aesEncryptionKey);
            const relativeFilePath = vscode.workspace.asRelativePath(file, false);
            const uploadParams = {
              Bucket: s3Bucket,
              Key: `${s3PrefixPath}/${relativeFilePath}`,
              Body: encryptedContent,
            };
            await s3.send(new PutObjectCommand(uploadParams));
            logMessage(`File ${relativeFilePath} synced to S3 successfully.`);
          }
        }
      }

      showInfo("Notes synced with S3 successfully.");
    } catch (error: any) {
      showError(`Error syncing notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Download and Decrypt Notes from S3
  let downloadNotesCommand = vscode.commands.registerCommand("extension.downloadNotes", async () => {
    logMessage("Starting download and decryption of notes from S3...");
    try {
      const { s3, s3Bucket, s3PrefixPath, aesEncryptionKey } = await initializeS3(context);

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          await downloadAndDecryptFolder(folder, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
        }
      }

      showInfo("Notes downloaded and decrypted from S3 successfully.");
    } catch (error: any) {
      showError(`Error downloading notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Generate 32-Byte Encrypted Text
  let generateEncryptedTextCommand = vscode.commands.registerCommand("extension.generateEncryptedText", async () => {
    logMessage("Generating 32-byte AES encryption key...");
    const key = crypto.randomBytes(32).toString("hex"); // 32 bytes
    try {
      await context.secrets.store("aesEncryptionKey", key);
      showInfo(`Generated and stored AES key: ${key}`);
    } catch (error: any) {
      showError(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(setAWSSecretCommand, setAESKeyCommand, syncNotesCommand, downloadNotesCommand, generateEncryptedTextCommand);

  // Show the output channel when the extension is activated
  outputChannel.show(true);
}

type S3InitializationResult = {
  s3: S3Client;
  s3Bucket: string;
  s3PrefixPath: string;
  aesEncryptionKey: string;
};

/*
async function initializeS3(context: vscode.ExtensionContext): Promise<S3InitializationResult> {
  const config = vscode.workspace.getConfiguration("encryptSyncS3");
  const awsAccessKeyId = config.get<string>("awsAccessKeyId");
  const awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");
  const s3Bucket = config.get<string>("s3Bucket");
  const s3Region = config.get<string>("s3Region");
  const s3Endpoint = config.get<string>("s3Endpoint");
  const s3PrefixPath = config.get<string>("s3PrefixPath") || "";
  const aesEncryptionKey = (await context.secrets.get("aesEncryptionKey"))!;

  if (!s3Bucket || !s3Region || !aesEncryptionKey) {
    throw new Error("S3 bucket, region, or AES key not set. Please configure the extension settings and credentials.");
  }

  const s3 = new S3Client({
    region: s3Region,
    endpoint: s3Endpoint,
    credentials:
      awsAccessKeyId && awsSecretAccessKey
        ? {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          }
        : undefined,
  });

  return { s3, s3Bucket, s3PrefixPath, aesEncryptionKey };
}
*/

async function downloadAndDecryptFolder(
  folder: vscode.WorkspaceFolder,
  s3: S3Client,
  aesEncryptionKey: string,
  s3Bucket: string,
  s3PrefixPath: string
) {
  const params = {
    Bucket: s3Bucket,
    Prefix: s3PrefixPath,
  };
  const data = await s3.send(new ListObjectsV2Command(params));
  if (data.Contents) {
    for (const item of data.Contents) {
      await downloadAndDecryptItem(folder, item, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
    }
  }
}

async function downloadAndDecryptItem(
  folder: vscode.WorkspaceFolder,
  item: any,
  s3: S3Client,
  aesEncryptionKey: string,
  s3Bucket: string,
  s3PrefixPath: string
) {
  const getObjectParams = {
    Bucket: s3Bucket,
    Key: item.Key || "",
  };
  const objectData = await s3.send(new GetObjectCommand(getObjectParams));
  if (objectData.Body) {
    const bodyBuffer = await streamToBuffer(objectData.Body as NodeJS.ReadableStream);
    const decryptedContent = decryptContent(bodyBuffer, aesEncryptionKey);

    // Remove prefixPath from S3 key
    const relativeFilePath = item.Key.replace(s3PrefixPath + "/", "");

    // Create local file path
    const localFilePath = vscode.Uri.joinPath(folder.uri, relativeFilePath);
    await vscode.workspace.fs.writeFile(localFilePath, decryptedContent);
    logMessage(`Downloaded and decrypted item: ${relativeFilePath}`);
  }
}

export function deactivate() {
  logMessage("EncryptSyncS3 Extension Deactivated.");
}
