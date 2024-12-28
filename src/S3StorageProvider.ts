// S3StorageProvider.ts
import { IStorageProvider } from "./IStorageProvider";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import { LocalObjectManager } from "./LocalObjectManager";

export class S3StorageProvider implements IStorageProvider {
    private s3: S3Client;
    private bucket: string;
    private prefixPath: string;

    constructor(s3: S3Client, bucket: string, prefixPath: string) {
        this.s3 = s3;
        this.bucket = bucket;
        this.prefixPath = prefixPath;
    }

    public async uploadFiles(encryptedFilePaths: string[]): Promise<void> {
        for (const filePath of encryptedFilePaths) {
            const content = fs.readFileSync(filePath);
            const fileName = path.basename(filePath); // .enc ファイル名
            const uploadParams = {
                Bucket: this.bucket,
                Key: `${this.prefixPath}/${fileName}`,
                Body: content,
            };
            await this.s3.send(new PutObjectCommand(uploadParams));
        }
    }

    public async downloadFiles(): Promise<string[]> {
        const downloaded: string[] = [];

        const listParams = {
            Bucket: this.bucket,
            Prefix: this.prefixPath,
        };
        const data = await this.s3.send(new ListObjectsV2Command(listParams));

        if (data.Contents) {
            for (const item of data.Contents) {
                if (!item.Key) { continue; }
                const fileName = item.Key.replace(this.prefixPath + "/", "");
                const getObjectParams = {
                    Bucket: this.bucket,
                    Key: item.Key,
                };
                const getObjectData = await this.s3.send(new GetObjectCommand(getObjectParams));

                if (getObjectData.Body) {
                    // バイナリストリームをBufferに変換
                    const bodyBuffer = await streamToBuffer(getObjectData.Body as NodeJS.ReadableStream);
                    // ローカルに暗号化ファイルとして保存（復号はしない）
                    LocalObjectManager.storeEncryptedFile(fileName, bodyBuffer);
                    downloaded.push(LocalObjectManager.getLocalFilePath(fileName));
                }
            }
        }

        return downloaded;
    }
}

// バイナリストリーム → Buffer への変換
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}
