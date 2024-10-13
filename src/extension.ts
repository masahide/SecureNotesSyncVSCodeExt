// VSCode Extension Skeleton for Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as crypto from "crypto";

let outputChannel: vscode.OutputChannel;

// Log message to output channel
function logMessage(message: string) {
  outputChannel.appendLine(message);
}

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("EncryptSyncS3 Extension Activated");

  // Create output channel
  outputChannel = vscode.window.createOutputChannel("EncryptSyncS3");

  // Command to Set AES Key
  let setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKeyCommand", async () => {
    const aesEncryptionKey = await vscode.window.showInputBox({
      prompt: "Enter AES Encryption Key (64 hex characters representing 32 bytes)",
      password: true,
      validateInput: (value) => (value.length === 64 ? null : "AES Encryption Key must be 64 hex characters long"),
    });

    if (aesEncryptionKey) {
      await context.secrets.store("aesEncryptionKey", aesEncryptionKey);
      vscode.window.showInformationMessage("AES Encryption Key saved successfully.");
      logMessage("AES Encryption Key saved successfully.");
    } else {
      vscode.window.showErrorMessage("Encryption key is required to save credentials.");
      logMessage("Encryption key not provided. Failed to save credentials.");
    }
  });

  // Command to Set AWS Credentials
  let setAWSSecretCommand = vscode.commands.registerCommand("extension.setAWSSecretCommand", async () => {
    const awsAccessKeyId = await vscode.window.showInputBox({ prompt: "Enter AWS Access Key ID" });
    const awsSecretAccessKey = await vscode.window.showInputBox({ prompt: "Enter AWS Secret Access Key", password: true });

    if (awsAccessKeyId && awsSecretAccessKey) {
      const config = vscode.workspace.getConfiguration("encryptSyncS3");
      await config.update("awsAccessKeyId", awsAccessKeyId, vscode.ConfigurationTarget.Global);
      await context.secrets.store("awsSecretAccessKey", awsSecretAccessKey);

      vscode.window.showInformationMessage("AWS Credentials saved successfully.");
      logMessage("AWS Credentials saved successfully.");
    } else {
      vscode.window.showErrorMessage("Both AWS Access Key ID and Secret Access Key are required.");
      logMessage("Failed to save AWS Credentials: Missing Access Key ID or Secret Access Key.");
    }
  });

  // Command to Sync Notes with S3
  let syncNotesCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    logMessage("Starting note sync with S3...");
    try {
      const { awsAccessKeyId, awsSecretAccessKey, s3Bucket, s3Region, s3Endpoint, s3PrefixPath, aesEncryptionKey } =
        await getConfigAndSecrets(context);

      if (!s3Bucket || !s3Region || !aesEncryptionKey) {
        vscode.window.showErrorMessage("S3 bucket, region, or AES key not set. Please configure the extension settings and credentials.");
        logMessage("Sync failed: Missing S3 bucket, region, or AES key.");
        return;
      }

      const s3 = createS3Client(awsAccessKeyId, awsSecretAccessKey, s3Region, s3Endpoint);

      // Upload all files in the workspace to S3
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
            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3.send(uploadCommand);
            logMessage(`File ${relativeFilePath} synced to S3 successfully.`);
          }
        }
      }

      vscode.window.showInformationMessage("Notes synced with S3 successfully.");
      logMessage("All notes synced with S3 successfully.");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error syncing notes: ${error instanceof Error ? error.message : String(error)}`);
      logMessage(`Error syncing notes: ${error.message}`);
    }
  });

  // Command to Download and Decrypt Notes from S3
  let downloadNotesCommand = vscode.commands.registerCommand("extension.downloadNotes", async () => {
    logMessage("Starting download and decryption of notes from S3...");
    try {
      const { awsAccessKeyId, awsSecretAccessKey, s3Bucket, s3Region, s3Endpoint, s3PrefixPath, aesEncryptionKey } =
        await getConfigAndSecrets(context);

      if (!s3Bucket || !s3Region || !aesEncryptionKey) {
        vscode.window.showErrorMessage("S3 bucket, region, or AES key not set. Please configure the extension settings and credentials.");
        logMessage("Download failed: Missing S3 bucket, region, or AES key.");
        return;
      }

      const s3 = createS3Client(awsAccessKeyId, awsSecretAccessKey, s3Region, s3Endpoint);

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          await downloadAndDecryptFolder(folder, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
        }
      }

      vscode.window.showInformationMessage("Notes downloaded and decrypted from S3 successfully.");
      logMessage("All notes downloaded and decrypted from S3 successfully.");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error downloading notes: ${error instanceof Error ? error.message : String(error)}`);
      logMessage(`Error downloading notes: ${error.message}`);
    }
  });

  // Command to Generate 32-Byte Encrypted Text
  let generateEncryptedTextCommand = vscode.commands.registerCommand("extension.generateEncryptedText", async () => {
    try {
      logMessage("Generating 32-byte AES encryption key...");
      const randomBytes = crypto.randomBytes(32); // 32 bytes
      const encryptedText = randomBytes.toString("hex"); // Convert to hex string (64 characters)
      await context.secrets.store("aesEncryptionKey", encryptedText);
      vscode.window.showInformationMessage(`Generated and stored 32-byte encrypted text as AES key: ${encryptedText}`);
      logMessage(`Generated AES key and stored successfully: ${encryptedText}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
      logMessage(`Error generating AES key: ${error.message}`);
    }
  });

  context.subscriptions.push(setAWSSecretCommand);
  context.subscriptions.push(setAESKeyCommand);
  context.subscriptions.push(syncNotesCommand);
  context.subscriptions.push(downloadNotesCommand);
  context.subscriptions.push(generateEncryptedTextCommand);

  // Show the output channel when the extension is activated
  outputChannel.show(true);
}

async function getConfigAndSecrets(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("encryptSyncS3");
  const awsAccessKeyId = config.get<string>("awsAccessKeyId");
  const awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");
  const s3Bucket = config.get<string>("s3Bucket");
  const s3Region = config.get<string>("s3Region");
  const s3Endpoint = config.get<string>("s3Endpoint");
  const s3PrefixPath = config.get<string>("s3PrefixPath") || "";
  const aesEncryptionKey = await context.secrets.get("aesEncryptionKey");

  return {
    awsAccessKeyId,
    awsSecretAccessKey,
    s3Bucket,
    s3Region,
    s3Endpoint,
    s3PrefixPath,
    aesEncryptionKey,
  };
}

function createS3Client(
  awsAccessKeyId: string | undefined,
  awsSecretAccessKey: string | undefined,
  s3Region: string | undefined,
  s3Endpoint: string | undefined
) {
  if (!s3Region) {
    throw new Error("S3 region is required");
  }

  return new S3Client(
    awsAccessKeyId && awsSecretAccessKey
      ? {
          region: s3Region,
          endpoint: s3Endpoint,
          credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          },
        }
      : { region: s3Region, endpoint: s3Endpoint }
  );
}

async function downloadAndDecryptFolder(
  folder: vscode.WorkspaceFolder,
  s3: S3Client,
  aesEncryptionKey: string,
  s3Bucket: string,
  s3PrefixPath: string
) {
  try {
    const params = {
      Bucket: s3Bucket,
      Prefix: s3PrefixPath,
    };
    const listCommand = new ListObjectsV2Command(params);
    const data = await s3.send(listCommand);
    if (data.Contents) {
      for (const item of data.Contents) {
        await downloadAndDecryptItem(folder, item, s3, aesEncryptionKey, s3Bucket, s3PrefixPath);
        logMessage(`Downloaded and decrypted item: ${item.Key}`);
      }
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error in downloading folder: ${error instanceof Error ? error.message : String(error)}`);
    logMessage(`Error in downloading folder: ${error.message}`);
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
  try {
    const getObjectParams = {
      Bucket: s3Bucket,
      Key: item.Key || "",
    };
    const getObjectCommand = new GetObjectCommand(getObjectParams);
    const objectData = await s3.send(getObjectCommand);
    if (objectData.Body) {
      const bodyBuffer = await streamToBuffer(objectData.Body as NodeJS.ReadableStream);
      const decryptedContent = decryptContent(bodyBuffer, aesEncryptionKey);

      // S3のキーからprefixPathを削除
      const relativeFilePath = item.Key.replace(s3PrefixPath, "");

      // ローカルのファイルパスを作成
      const localFilePath = vscode.Uri.joinPath(folder.uri, relativeFilePath);
      await vscode.workspace.fs.writeFile(localFilePath, decryptedContent);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error in downloading item: ${error instanceof Error ? error.message : String(error)}`);
    logMessage(`Error in downloading item: ${error.message}`);
  }
}

// Convert stream to buffer
async function streamToBuffer(stream: Blob | ReadableStream | NodeJS.ReadableStream): Promise<Buffer> {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) {
        done = true;
      } else if (value) {
        chunks.push(value);
      }
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  } else if (stream instanceof Blob) {
    return Buffer.from(await stream.arrayBuffer());
  } else {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: any[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }
}

// Encrypt content using AES
function encryptContent(content: Uint8Array, key: string): Buffer {
  const iv = crypto.randomBytes(16);
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error("Encryption key must be 32 bytes long for AES-256-CBC.");
  }
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  let encrypted = cipher.update(content);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return Buffer.concat([iv, encrypted]); // Prepend IV for decryption
}

// Decrypt content using AES
function decryptContent(encryptedContent: Buffer, key: string): Uint8Array {
  const iv = encryptedContent.subarray(0, 16);
  const encryptedText = encryptedContent.subarray(16);
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error("Decryption key must be 32 bytes long for AES-256-CBC.");
  }
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}

export function deactivate() {
  logMessage("EncryptSyncS3 Extension Deactivated.");
}
