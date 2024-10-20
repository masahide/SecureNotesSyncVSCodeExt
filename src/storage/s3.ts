import * as vscode from "vscode";
import { RemoteStorage, IndexFile } from "./storage";
import { fromIni } from "@aws-sdk/credential-providers";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { decryptContent, encryptContent } from "../cryptoUtils";
import { logMessage } from "../logger";
import { streamToBuffer } from "../streamUtils";
import { Config, S3Config } from "../dotdir/config";
import { getSecret, SecretKey } from "../secretManager";

export class S3Storage implements RemoteStorage {
  private s3!: S3Client;
  private conf!: S3Config;
  private aesEncryptionKey!: string;

  async initialize(context: vscode.ExtensionContext, config: Config): Promise<void> {
    this.conf = config.S3;
    const aesEncryptionKey = await getSecret(context, SecretKey(config));
    if (this.conf.profile) {
      this.s3 = new S3Client({ credentials: fromIni({ profile: this.conf.profile }) });
    } else {
      this.s3 = new S3Client();
    }
  }

  async uploadFile(filePath: string, content: Uint8Array): Promise<void> {
    const s3Key = joinS3Path(this.conf.prefixPath, "files", filePath);
    const encryptedContent = encryptContent(content, this.aesEncryptionKey);
    const putObjectParams = {
      Bucket: this.conf.bucket,
      Key: s3Key,
      Body: encryptedContent,
    };
    await this.s3.send(new PutObjectCommand(putObjectParams));
    logMessage(`Uploaded file to S3: ${filePath}`);
  }

  async downloadFile(filePath: string): Promise<Uint8Array> {
    const s3Key = joinS3Path(this.conf.prefixPath, "files", filePath);
    const getObjectParams = {
      Bucket: this.conf.bucket,
      Key: s3Key,
    };
    const data = await this.s3.send(new GetObjectCommand(getObjectParams));
    const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
    return decryptContent(encryptedContent, this.aesEncryptionKey);
  }

  async uploadIndexFile(indexFile: IndexFile): Promise<boolean> {
    const indexContent = Buffer.from(JSON.stringify(indexFile), "utf-8");
    const encryptedContent = encryptContent(indexContent, this.aesEncryptionKey);
    const indexKey = joinS3Path(this.conf.prefixPath, "indexes", indexFile.uuid);
    const putObjectParams = {
      Bucket: this.conf.bucket,
      Key: indexKey,
      Body: encryptedContent,
      //TODO: 条件付きPut
    };
    await this.s3.send(new PutObjectCommand(putObjectParams));
    logMessage(`Uploaded index file to S3: ${indexFile.uuid}`);
    return true;
  }

  async downloadIndexFile(indexUuid: string): Promise<IndexFile | null> {
    if (!indexUuid) {
      return null;
    }

    const indexKey = joinS3Path(this.conf.prefixPath, "indexes", indexUuid);
    const getObjectParams = {
      Bucket: this.conf.bucket,
      Key: indexKey,
    };
    const data = await this.s3.send(new GetObjectCommand(getObjectParams));
    const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
    const decryptedContent = decryptContent(encryptedContent, this.aesEncryptionKey);
    return JSON.parse(decryptedContent.toString());
  }

  async updateHeadFile(newIndexUuid: string): Promise<void> {
    const headKey = joinS3Path(this.conf.prefixPath, "HEAD");
    const content = Buffer.from(newIndexUuid, "utf-8");
    const encryptedContent = encryptContent(content, this.aesEncryptionKey);
    const putObjectParams = {
      Bucket: this.conf.bucket,
      Key: headKey,
      Body: encryptedContent,
    };
    await this.s3.send(new PutObjectCommand(putObjectParams));
    logMessage(`Updated HEAD file with new index UUID: ${newIndexUuid}`);
  }

  async getHeadIndexUuid(): Promise<string | null> {
    const headKey = joinS3Path(this.conf.prefixPath, "HEAD");
    try {
      const getObjectParams = {
        Bucket: this.conf.bucket,
        Key: headKey,
      };
      const data = await this.s3.send(new GetObjectCommand(getObjectParams));
      const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
      const decryptedContent = decryptContent(encryptedContent, this.aesEncryptionKey);
      return decryptedContent.toString().trim();
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        return null;
      }
      throw error;
    }
  }
  async testS3Access(): Promise<boolean> {
    const testKey = joinS3Path(this.conf.prefixPath, "test");
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.conf.bucket,
          Key: testKey,
          Body: "test",
        })
      );
      const response = await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.conf.bucket,
          Key: testKey,
        })
      );
      // 成功した場合、S3へのアクセスが可能
      vscode.window.showInformationMessage("S3 access test succeeded.");
      console.log("S3 response:", response);
      return true;
    } catch (error) {
      // エラーが発生した場合、S3へのアクセスに失敗
      vscode.window.showErrorMessage("Failed to access S3. Please check your configuration.");
      console.error("S3 access error:", error);
      return false;
    }
  }
}

// S3 パスを安全に結合するユーティリティ関数
function joinS3Path(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, "")) // 各パートの前後にあるスラッシュを削除
    .filter((part) => part.length > 0) // 空文字列を無視
    .join("/");
}
