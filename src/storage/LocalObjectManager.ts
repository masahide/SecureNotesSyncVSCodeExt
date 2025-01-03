// src/LocalObjectManager.ts
import * as vscode from "vscode";
import * as crypto from "crypto";
import { logMessage } from "../logger";
import { IndexFile, FileEntry, Conflict, LocalObjectManagerOptions } from "../types";
import { v7 as uuidv7 } from 'uuid';

const secureNotesDir = ".secureNotes";
const indexDirName = "indexes";
const filesDirName = "files";
const previousIndexIDFilename = "index";
const rootUri = getRootUri();
const secureNootesUri = vscode.Uri.joinPath(rootUri, secureNotesDir);
const indexDirUri = vscode.Uri.joinPath(secureNootesUri, indexDirName);
const filesDirUri = vscode.Uri.joinPath(secureNootesUri, filesDirName);
const previousIndexIDUri = vscode.Uri.joinPath(secureNootesUri, previousIndexIDFilename);

interface FileIndex {
    originalFile: string;
    encryptedFile: string;
}

// ワークスペースフォルダを取得
function getRootUri(): vscode.Uri {
    const workspaceUri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
    if (!workspaceUri) {
        throw new Error("No workspace folder found.");
    }
    return workspaceUri;
}

export class LocalObjectManager {
    /**
     * ワークスペース内ファイルを暗号化し、.secureNotes に保存
     */
    public static async saveEncryptedObject(
        localFiles: FileEntry[],
        latestIndex: IndexFile,
        options: LocalObjectManagerOptions
    ): Promise<boolean> {
        // リモートのファイルハッシュ値のセットを作成
        const latestFileHashes = new Set(latestIndex.files.map((file) => file.hash));
        let updated = false;
        for (const file of localFiles) {
            // ファイルがリモートインデックスに存在するか確認
            if (latestFileHashes.has(file.hash)) {
                continue; // 既に存在する場合、アップロードをスキップ
            }
            // ファイルを読み込み
            const fileUri = vscode.Uri.joinPath(rootUri, file.path);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);

            // ファイルを暗号化
            const encryptedContent = this.encryptContent(Buffer.from(fileContent), options.encryptionKey);

            // objects directory に保存
            const encryptedFileName = vscode.Uri.joinPath(filesDirUri, file.hash);
            await vscode.workspace.fs.writeFile(encryptedFileName, encryptedContent);
            logMessage(`save file:${file.path}, to:${encryptedFileName.path}`);
            updated = true;
        }
        return updated;
    }

    /**
     * ローカル .secureNotes/indexes にあるすべての index-<UUID>.json のパス一覧
     */
    public static async listLocalIndexFiles(): Promise<string[]> {
        // .secureNotes/indexes ディレクトリが存在しない場合は空配列を返す
        try {
            await vscode.workspace.fs.stat(indexDirUri);
        } catch (error) {
            return [];
        }
        const dirs = await vscode.workspace.fs.readDirectory(indexDirUri);
        return dirs.filter(
            (f) => f[1] === vscode.FileType.File
                && f[0].startsWith("index-")
                && f[0].endsWith(".json")
        ).map((f) => f[0]);
    }

    /**
     * ローカルにあるうち、もっとも新しいインデックスファイルを読み込む
     */
    public static async loadLatestLocalIndex(options: LocalObjectManagerOptions): Promise<IndexFile> {
        const indexFiles = await this.listLocalIndexFiles();
        if (indexFiles.length === 0) {
            // インデックスファイルが存在しない場合は新規作成
            return {
                uuid: uuidv7(),
                parentUuid: "",
                environmentId: options.environmentId,
                files: [],
                timestamp: 0,
            };
        }

        // 1) ファイル名（basename）を抽出してソート（降順）
        //    "index-017f8d3f-e23c-7aa6-85f8-fc1855b36328.json" の比較で、
        //    UUIDv7部分を含む文字列を比較する
        indexFiles.sort((a, b) => {
            // 降順なのでB→Aの順で返す
            if (a < b) { return 1; }
            if (a > b) { return -1; }
            return 0;
        });

        // 2) 先頭(最も新しい=一番大きいUUIDv7)を読み込む
        const latestFilePath = indexFiles[0];
        const latestIndexFileUri = vscode.Uri.joinPath(indexDirUri, latestFilePath);
        const content = await vscode.workspace.fs.readFile(latestIndexFileUri);
        return JSON.parse(content.toString()) as IndexFile;
    }

    // 前回のインデックスファイルを読み込む関数
    public static async loadPreviousIndex(options: LocalObjectManagerOptions): Promise<IndexFile> {
        try {
            const indexContent = await vscode.workspace.fs.readFile(previousIndexIDUri);
            const index = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(indexDirUri, indexContent.toString()));
            return JSON.parse(index.toString());
        } catch (error) {
            // ファイルが存在しない場合や読み込みエラーの場合は新規作成
            return {
                uuid: uuidv7(),
                parentUuid: "",
                environmentId: options.environmentId,
                files: [],
                timestamp: 0,
            };
        }
    }

    /**
     * 新しい index-<UUID>.json を作成し保存
     */
    public static createNewIndexFile(localIndex: IndexFile, previousIndex: IndexFile): IndexFile {
        const newUUID = uuidv7();
        const newIndexFile: IndexFile = {
            uuid: newUUID,
            parentUuid: previousIndex.uuid,
            environmentId: localIndex.environmentId,
            files: localIndex.files,
            timestamp: Date.now(),
        };

        return newIndexFile;
    }
    /*
        vscode.workspace.fs.createDirectory(filesDirUri);
        const fileUri = vscode.Uri.joinPath(indexDirUri, `index-${newUUID}.json`);
        const encryptedIndex = this.encryptContent(Buffer.from(JSON.stringify(newIndex, null, 2)), options.encryptionKey);
        vscode.workspace.fs.writeFile(fileUri, encryptedIndex);
        */



    /**
     * AES-256-CBC で暗号化
     */
    private static encryptContent(content: Buffer, key: string): Buffer {
        const iv = crypto.randomBytes(16);
        const keyBuffer = Buffer.from(key, "hex");
        const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
        const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
        return Buffer.concat([iv, encrypted]);
    }

    /**
     * AES-256-CBC で復号
     */
    private static decryptContent(encryptedContent: Buffer, key: string): Buffer {
        const iv = encryptedContent.subarray(0, 16);
        const encryptedText = encryptedContent.subarray(16);
        const keyBuffer = Buffer.from(key, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
        return Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    }

    // 復号化した内容を返す共通関数
    private static async decryptFileFromLocalObject(fileHash: string, options: LocalObjectManagerOptions): Promise<Uint8Array> {
        const filePath = vscode.Uri.joinPath(filesDirUri, fileHash);
        const content = await vscode.workspace.fs.readFile(filePath);
        try {
            return this.decryptContent(Buffer.from(content), options.encryptionKey);
        } catch (error: any) {
            logMessage(`Failed to fetch or decrypt file: ${fileHash}.Error: ${error.message} `);
            throw error;
        }
    }
    // オブジェクトディレクトリからファイルを取得し、ワークスペースに保存する共通関数
    private static async fetchDecryptAndSaveFile(
        filePath: string,
        fileHash: string,
        options: LocalObjectManagerOptions,
        conflictFileName?: string,
    ): Promise<void> {
        try {
            const decryptedContent = await this.decryptFileFromLocalObject(fileHash, options);
            const savePath = conflictFileName ? conflictFileName : filePath;

            // ローカルファイルパスを取得
            const localUri = vscode.Uri.joinPath(vscode.Uri.file(rootUri.fsPath), savePath);

            // ローカルファイルに保存
            await vscode.workspace.fs.writeFile(localUri, decryptedContent);
            logMessage(`Saved remote file to local path: ${savePath} `);
        } catch (error: any) {
            logMessage(`Failed to save remote file to local path: ${filePath}.Error: ${error.message} `);
            throw error;
        }
    }
    // リモートのファイルでローカルを上書き
    private static async overwriteLocalFileWithRemote(
        filePath: string,
        fileHash: string,
        options: LocalObjectManagerOptions,
    ): Promise<void> {
        await this.fetchDecryptAndSaveFile(filePath, fileHash, options);
        logMessage(`Overwrote local file with remote content: ${filePath} `);
    }
    // リモートのファイルを別名で保存
    public static async saveRemoteFileAsConflict(
        filePath: string,
        fileHash: string,
        options: LocalObjectManagerOptions
    ): Promise<void> {
        // コンフリクト用のファイル名を生成（例: conflict-YYYYMMDD-HHmmss-ファイル名.ext）
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
        const conflictFileName = `conflict - ${timestamp} -${filePath} `;
        await this.fetchDecryptAndSaveFile(filePath, fileHash, options, conflictFileName);
        logMessage(`Saved remote file as conflict file: ${conflictFileName} `);
    }

    // 検出された競合をユーザーに通知し、解決します。
    public static async resolveConflicts(
        conflicts: Conflict[],
        options: LocalObjectManagerOptions
    ): Promise<boolean> {
        for (const conflict of conflicts) {
            if (conflict.localHash.length === 0) {
                logMessage(`Remote only file: ${conflict.filePath} `);
                await this.fetchDecryptAndSaveFile(conflict.filePath, conflict.remoteHash, options);
                continue;
            }
            const choice = await vscode.window.showQuickPick(
                ["Keep Local Version", "Keep Remote Version", "Save Remote as Conflict File", "Abort Sync"],
                {
                    placeHolder: `Conflict detected in file: ${conflict.filePath} `,
                }
            );

            if (choice === "Keep Local Version") {
                // ローカルの変更を適用（何もしない）
                continue;
            } else if (choice === "Keep Remote Version") {
                // リモートのファイルでローカルを上書き
                await this.overwriteLocalFileWithRemote(conflict.filePath, conflict.remoteHash, options);
            } else if (choice === "Save Remote as Conflict File") {
                // リモートのファイルを別名で保存
                await this.saveRemoteFileAsConflict(conflict.filePath, conflict.remoteHash, options);
            } else if (choice === "Abort Sync" || !choice) {
                // 同期を中止
                return false;
            }
        }
        return true;
    }
    // ローカルとリモートのインデックスファイルを比較し、競合を検出します。
    public static detectConflicts(localIndex: IndexFile, remoteIndex: IndexFile): Conflict[] {
        const conflicts: Conflict[] = [];

        // リモートのインデックス UUID とローカルの parentUuid を比較
        if (remoteIndex.uuid === localIndex.parentUuid) {
            // リモートに変更がないため、競合なし
            return conflicts;
        }

        // リモートに変更がある場合のみ競合を検出
        const remoteFileMap = new Map<string, FileEntry>();
        for (const file of remoteIndex.files) {
            remoteFileMap.set(file.path, file);
        }

        for (const localFile of localIndex.files) {
            const remoteFile = remoteFileMap.get(localFile.path);
            if (remoteFile) {
                if (localFile.hash !== remoteFile.hash) {
                    // ハッシュ値が異なる場合、競合と判断
                    conflicts.push({
                        filePath: localFile.path,
                        localHash: localFile.hash,
                        remoteHash: remoteFile.hash,
                        localTimestamp: localFile.timestamp,
                        remoteTimestamp: remoteFile.timestamp,
                    });
                }
                // 比較後に削除
                remoteFileMap.delete(localFile.path);
            }
        }

        // ローカルに存在せず、リモートに存在するファイルも考慮
        for (const remoteFile of remoteFileMap.values()) {
            conflicts.push({
                filePath: remoteFile.path,
                localHash: "",
                remoteHash: remoteFile.hash,
                localTimestamp: 0,
                remoteTimestamp: remoteFile.timestamp,
            });
        }

        return conflicts;
    }
    // ローカルのワークスペースからファイルリスト、ハッシュ値、タイムスタンプを取得し、インデックスファイルを生成します。
    static async generateLocalIndexFile(previousIndex: IndexFile, options: LocalObjectManagerOptions): Promise<IndexFile> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error("No workspace folders found.");
        }

        const files: FileEntry[] = [];
        const previousFileMap = new Map<string, FileEntry>();
        if (previousIndex) {
            // ファイルパスをキーにしてマップに保存
            for (const file of previousIndex.files) {
                previousFileMap.set(file.path, file);
            }
        }

        for (const folder of workspaceFolders) {
            const filesInFolder = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, "**/*"),
                `{**/node_modules/**,${secureNotesDir}/**}`
            );

            for (const fileUri of filesInFolder) {
                const stat = await vscode.workspace.fs.stat(fileUri);
                const relativePath = vscode.workspace.asRelativePath(fileUri, false);

                // 前回のインデックスに同じファイルがあるか確認
                const previousFileEntry = previousFileMap.get(relativePath);

                if (previousFileEntry && previousFileEntry.timestamp === stat.mtime) {
                    // タイムスタンプが同じ場合、ハッシュ値を再利用
                    files.push({
                        path: relativePath,
                        hash: previousFileEntry.hash,
                        timestamp: stat.mtime,
                    });
                } else {
                    // タイムスタンプが異なる場合、ハッシュ値を再計算
                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                    const hash = crypto.createHash("sha256").update(fileContent).digest("hex");

                    files.push({
                        path: relativePath,
                        hash: hash,
                        timestamp: stat.mtime,
                    });
                }
            }
        }

        const indexFile: IndexFile = {
            uuid: uuidv7(),
            parentUuid: previousIndex.uuid, // ここでリモートのインデックス UUID を設定
            environmentId: options.environmentId,
            files: files,
            timestamp: Date.now(),
        };


        return indexFile;
    }
    // 新しいインデックスファイルをローカルに保存する関数
    public static async saveLocalIndexFile(indexFile: IndexFile): Promise<void> {
        await vscode.workspace.fs.createDirectory(indexDirUri);
        const indexContent = Buffer.from(JSON.stringify(indexFile, null, 2), "utf-8");
        const indexFileName = `index-${indexFile.uuid}.json`;
        const indexFilePath = vscode.Uri.joinPath(indexDirUri, indexFileName);
        await vscode.workspace.fs.writeFile(indexFilePath, indexContent);
        await vscode.workspace.fs.writeFile(previousIndexIDUri, Buffer.from(indexFileName));
    }
}
