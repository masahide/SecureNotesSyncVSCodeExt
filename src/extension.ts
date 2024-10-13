// VSCode Extension Skeleton for Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as crypto from "crypto";

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("EncryptSyncS3 Extension Activated");

  // Command to Set AES Key
  let setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKeyCommand", async () => {
    const aesEncryptionKey = await vscode.window.showInputBox({
      prompt: "Enter AES Encryption Key (32 characters)",
      password: true,
      validateInput: (value) => (value.length === 32 ? null : "AES Encryption Key must be 32 characters long"),
    });

    if (aesEncryptionKey) {
      await context.secrets.store("aesEncryptionKey", aesEncryptionKey);
      vscode.window.showInformationMessage("AES Encryption Key saved successfully.");
    } else {
      vscode.window.showErrorMessage("Encryption key is required to save credentials.");
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
    } else {
      vscode.window.showErrorMessage("Both AWS Access Key ID and Secret Access Key are required.");
    }
  });

  // Command to Sync Notes with S3
  let syncNotesCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    try {
      const { awsAccessKeyId, awsSecretAccessKey, s3Bucket, s3Region, s3Endpoint, s3PrefixPath, aesEncryptionKey } =
        await getConfigAndSecrets(context);

      if (!s3Bucket || !s3Region || !aesEncryptionKey) {
        vscode.window.showErrorMessage("S3 bucket, region, or AES key not set. Please configure the extension settings and credentials.");
        return;
      }

      const s3 = createS3Client(awsAccessKeyId, awsSecretAccessKey, s3Region, s3Endpoint);

      // Upload all files in the workspace to S3
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"));
          for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            const encryptedContent = encryptContent(document.getText(), aesEncryptionKey);
            const relativeFilePath = vscode.workspace.asRelativePath(file, false);
            const uploadParams = {
              Bucket: s3Bucket,
              Key: `${s3PrefixPath}/${relativeFilePath}`,
              Body: encryptedContent,
            };
            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3.send(uploadCommand);
          }
        }
      }

      vscode.window.showInformationMessage("Notes synced with S3 successfully.");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error syncing notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Download and Decrypt Notes from S3
  let downloadNotesCommand = vscode.commands.registerCommand("extension.downloadNotes", async () => {
    try {
      const { awsAccessKeyId, awsSecretAccessKey, s3Bucket, s3Region, s3Endpoint, s3PrefixPath, aesEncryptionKey } =
        await getConfigAndSecrets(context);

      if (!s3Bucket || !s3Region || !aesEncryptionKey) {
        vscode.window.showErrorMessage("S3 bucket, region, or AES key not set. Please configure the extension settings and credentials.");
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
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error downloading notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Generate 32-Byte Encrypted Text
  let generateEncryptedTextCommand = vscode.commands.registerCommand("extension.generateEncryptedText", async () => {
    try {
      const randomBytes = crypto.randomBytes(32);
      const encryptedText = randomBytes.toString("hex");
      await context.secrets.store("aesEncryptionKey", encryptedText);
      vscode.window.showInformationMessage(`Generated and stored 32-byte encrypted text as AES key: ${encryptedText}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(setAWSSecretCommand);
  context.subscriptions.push(setAESKeyCommand);
  context.subscriptions.push(syncNotesCommand);
  context.subscriptions.push(downloadNotesCommand);
  context.subscriptions.push(generateEncryptedTextCommand);
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
        await downloadAndDecryptItem(folder, item, s3, aesEncryptionKey, s3Bucket);
      }
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error in downloading folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function downloadAndDecryptItem(folder: vscode.WorkspaceFolder, item: any, s3: S3Client, aesEncryptionKey: string, s3Bucket: string) {
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
      const localFilePath = vscode.Uri.joinPath(folder.uri, item.Key || "");
      await vscode.workspace.fs.writeFile(localFilePath, Buffer.from(decryptedContent, "utf-8"));
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error in downloading item: ${error instanceof Error ? error.message : String(error)}`);
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
function encryptContent(content: string, key: string): Buffer {
  const iv = crypto.randomBytes(16);
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 characters long for AES-256-CBC.");
  }
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
  let encrypted = cipher.update(content);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return Buffer.concat([iv, encrypted]); // Prepend IV for decryption
}

// Decrypt content using AES
function decryptContent(encryptedContent: Buffer, key: string): string {
  const iv = encryptedContent.subarray(0, 16);
  const encryptedText = encryptedContent.subarray(16);
  if (key.length !== 32) {
    throw new Error("Decryption key must be 32 characters long for AES-256-CBC.");
  }
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export function deactivate() {}
