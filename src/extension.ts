// VSCode Extension Skeleton for Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as crypto from "crypto";

export async function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("S3 File Sync Extension Activated");
  // AWS S3 Client Initialization
  const awsAccessKeyId = await context.secrets.get("awsAccessKeyId");
  const awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");

  // Use default AWS credentials if not set in secrets
  if (!awsAccessKeyId || !awsSecretAccessKey) {
    vscode.window.showWarningMessage("Using default AWS credentials from ~/.aws/credentials");
  }

  const s3 = new S3Client(
    awsAccessKeyId && awsSecretAccessKey
      ? {
          credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          },
        }
      : {}
  );

  // Command to Set AWS Credentials and AES Key
  let setCredentialsCommand = vscode.commands.registerCommand("extension.setCredentials", async () => {
    const awsAccessKeyId = await vscode.window.showInputBox({ prompt: "Enter AWS Access Key ID" });
    const awsSecretAccessKey = await vscode.window.showInputBox({ prompt: "Enter AWS Secret Access Key", password: true });
    const aesEncryptionKey = await vscode.window.showInputBox({
      prompt: "Enter AES Encryption Key (32 characters)",
      password: true,
      validateInput: (value) => (value.length === 32 ? null : "AES Encryption Key must be 32 characters long"),
    });

    if (awsAccessKeyId && awsSecretAccessKey && aesEncryptionKey) {
      await context.secrets.store("awsAccessKeyId", awsAccessKeyId);
      await context.secrets.store("awsSecretAccessKey", awsSecretAccessKey);
      await context.secrets.store("aesEncryptionKey", aesEncryptionKey);
      vscode.window.showInformationMessage("Credentials and AES Key saved successfully.");
    } else {
      vscode.window.showErrorMessage("All fields are required to save credentials.");
    }
  });

  // Command to Sync Notes with S3
  let syncNotesCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    try {
      let awsAccessKeyId = await context.secrets.get("awsAccessKeyId");
      let awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");

      // Use default AWS credentials if not set in secrets
      if (!awsAccessKeyId || !awsSecretAccessKey) {
        vscode.window.showWarningMessage("Using default AWS credentials from ~/.aws/credentials");
      }
      const aesEncryptionKey = await context.secrets.get("aesEncryptionKey");

      if (!awsAccessKeyId || !awsSecretAccessKey || !aesEncryptionKey) {
        vscode.window.showErrorMessage("AWS credentials or AES key not set. Please run the setCredentials command.");
        return;
      }

      // Example: Upload all files in the workspace to S3
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"));
          for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            const encryptedContent = encryptContent(document.getText(), aesEncryptionKey);
            const uploadParams = {
              Bucket: folder.name,
              Key: file.path,
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
      const awsAccessKeyId = await context.secrets.get("awsAccessKeyId");
      const awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");
      const aesEncryptionKey = await context.secrets.get("aesEncryptionKey");

      if (!awsAccessKeyId || !awsSecretAccessKey || !aesEncryptionKey) {
        vscode.window.showErrorMessage("AWS credentials or AES key not set. Please run the setCredentials command.");
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          const params = {
            Bucket: folder.name,
            Prefix: "",
          };
          const listCommand = new ListObjectsV2Command(params);
          const data = await s3.send(listCommand);
          if (data.Contents) {
            for (const item of data.Contents) {
              const getObjectParams = {
                Bucket: folder.name,
                Key: item.Key || "",
              };
              const getObjectCommand = new GetObjectCommand(getObjectParams);
              const objectData = await s3.send(getObjectCommand);
              if (objectData.Body) {
                const streamToBuffer = async (stream: Blob | ReadableStream | NodeJS.ReadableStream): Promise<Buffer> => {
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
                };
                const bodyBuffer = await streamToBuffer(objectData.Body as NodeJS.ReadableStream);
                const decryptedContent = decryptContent(bodyBuffer, aesEncryptionKey);
                const localFilePath = vscode.Uri.joinPath(folder.uri, item.Key || "");
                await vscode.workspace.fs.writeFile(localFilePath, Buffer.from(decryptedContent, "utf-8"));
              }
            }
          }
        }
      }

      vscode.window.showInformationMessage("Notes downloaded and decrypted from S3 successfully.");
    } catch (error) {
      vscode.window.showErrorMessage(`Error downloading notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(setCredentialsCommand);
  context.subscriptions.push(syncNotesCommand);
  context.subscriptions.push(downloadNotesCommand);
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
  const iv = encryptedContent.slice(0, 16);
  const encryptedText = encryptedContent.slice(16);
  if (key.length !== 32) {
    throw new Error("Decryption key must be 32 characters long for AES-256-CBC.");
  }
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export function deactivate() {}
