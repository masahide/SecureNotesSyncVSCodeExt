// VSCode Extension Skeleton for Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as crypto from "crypto";

let outputChannel: vscode.OutputChannel;

// Log message to output channel
function logMessage(message: string) {
  outputChannel.appendLine(message);
}

// Show error message and log
function showError(message: string) {
  vscode.window.showErrorMessage(message);
  logMessage(message);
}

// Show info message and log
function showInfo(message: string) {
  vscode.window.showInformationMessage(message);
  logMessage(message);
}

// Command to set secrets (AES Key or AWS Secret Access Key)
async function setSecret(
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

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel("secureNotesSync");
  showInfo("secureNotesSync Extension Activated");

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
      const config = vscode.workspace.getConfiguration("secureNotesSync");
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
    try {
      logMessage("Generating 32-byte AES encryption key...");
      const randomBytes = crypto.randomBytes(32); // 32 bytes
      const encryptedText = randomBytes.toString("hex"); // 64 hex characters
      await context.secrets.store("aesEncryptionKey", encryptedText);
      showInfo(`Generated and stored AES key: ${encryptedText}`);
    } catch (error: any) {
      showError(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(setAWSSecretCommand, setAESKeyCommand, syncNotesCommand, downloadNotesCommand, generateEncryptedTextCommand);

  // Show the output channel when the extension is activated
  outputChannel.show(true);
}

async function initializeS3(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("secureNotesSync");
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
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return Buffer.concat([iv, encrypted]); // Prepend IV for decryption
}

// Decrypt content using AES
function decryptContent(encryptedContent: Buffer, key: string): Uint8Array {
  const iv = encryptedContent.subarray(0, 16);
  const encryptedText = encryptedContent.subarray(16);
  const keyBuffer = Buffer.from(key, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted;
}

export function deactivate() {
  logMessage("secureNotesSync Extension Deactivated.");
}
