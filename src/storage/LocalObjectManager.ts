// src/LocalObjectManager.ts
import * as vscode from "vscode";
import * as crypto from "crypto";
import { logMessage } from "../logger";
import { IndexFile, FileEntry, Conflict, LocalObjectManagerOptions } from "../types";
import { v7 as uuidv7 } from 'uuid';

const secureNotesDir = ".secureNotes";
const objectDirName = "objects";
const indexDirName = "indexes";
const filesDirName = "files";
const previousIndexIDFilename = "index";
const rootUri = getRootUri();
export const secureNootesUri = vscode.Uri.joinPath(rootUri, secureNotesDir);
export const objectDirUri = vscode.Uri.joinPath(secureNootesUri, objectDirName);
const previousIndexIDUri = vscode.Uri.joinPath(secureNootesUri, previousIndexIDFilename);
const indexDirUri = vscode.Uri.joinPath(objectDirUri, indexDirName);
const filesDirUri = vscode.Uri.joinPath(objectDirUri, filesDirName);

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
            const { dirName, fileName } = this.getHashPathParts(file.hash);
            const encryptedFileName = vscode.Uri.joinPath(filesDirUri, dirName, fileName);
            await vscode.workspace.fs.writeFile(encryptedFileName, encryptedContent);
            logMessage(`save file:${file.path}, to:${encryptedFileName.path}`);
            updated = true;
        }
        return updated;
    }

    private static getUUIDPathParts(uuid: string): { dirName: string; fileName: string } {
        const dirName = uuid.substring(0, 6);
        const fileName = uuid.substring(6);
        return { dirName, fileName };
    }
    private static getHashPathParts(uuid: string): { dirName: string; fileName: string } {
        const dirName = uuid.substring(0, 2);
        const fileName = uuid.substring(2);
        return { dirName, fileName };
    }

    /**
     * uri にあるすべての fileのパス一覧
     */
    private static async listFiles(uri: vscode.Uri): Promise<string[]> {
        // .secureNotes/indexes ディレクトリが存在しない場合は空配列を返す
        try {
            await vscode.workspace.fs.stat(uri);
        } catch (error) {
            return [];
        }
        const dirs = await vscode.workspace.fs.readDirectory(uri);
        return dirs.filter((f) => f[1] === vscode.FileType.File).map((f) => f[0]);
    }
    /**
     * uri にあるすべてのdirのパス一覧
     */
    private static async listDirs(uri: vscode.Uri): Promise<string[]> {
        // .secureNotes/indexes ディレクトリが存在しない場合は空配列を返す
        try {
            await vscode.workspace.fs.stat(uri);
        } catch (error) {
            return [];
        }
        const dirs = await vscode.workspace.fs.readDirectory(uri);
        return dirs.filter((f) => f[1] === vscode.FileType.Directory).map((f) => f[0]);
    }


    public static latestString(strings: string[]): string {
        if (strings.length === 0) { return ""; }
        return strings.reduce((a, b) => (a > b ? a : b));
    }
    /**
     * ローカルにあるうち、もっとも新しいインデックスファイルを読み込む
     */
    public static async loadLatestLocalIndex(options: LocalObjectManagerOptions): Promise<IndexFile> {
        const latestDir = this.latestString(await this.listDirs(indexDirUri));
        const dir = vscode.Uri.joinPath(indexDirUri, latestDir);
        const latestFilePath = this.latestString(await this.listFiles(dir));
        const latestIndexFileUri = vscode.Uri.joinPath(indexDirUri, latestDir, latestFilePath);
        if (latestFilePath.length === 0) {
            // インデックスファイルが存在しない場合は新規作成
            logMessage(`Latest index file not found. Creating new index`);
            return {
                uuid: "",
                parentUuids: [],
                environmentId: options.environmentId,
                files: [],
                timestamp: 0,
            };
        }

        const encryptContent = await vscode.workspace.fs.readFile(latestIndexFileUri);
        const content = this.decryptContent(Buffer.from(encryptContent), options.encryptionKey);
        return JSON.parse(content.toString()) as IndexFile;
    }

    // 前回のインデックスファイルを読み込む関数
    public static async loadPreviousIndex(options: LocalObjectManagerOptions): Promise<IndexFile> {
        try {
            const indexContent = await vscode.workspace.fs.readFile(previousIndexIDUri);
            const uuidparts = this.getUUIDPathParts(indexContent.toString());
            const encryptedIndex = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(indexDirUri, uuidparts.dirName, uuidparts.fileName));
            const index = this.decryptContent(Buffer.from(encryptedIndex), options.encryptionKey);
            return JSON.parse(index.toString());
        } catch (error) {
            logMessage(`Previous index file not found. Creating new index`);
            return {
                uuid: "",
                parentUuids: [],
                environmentId: options.environmentId,
                files: [],
                timestamp: 0,
            };
        }
    }

    /**
     * 新しい <UUID> を作成し保存
     */
    public static createNewIndexFile(localIndex: IndexFile, parentIndexes: IndexFile[]): IndexFile {
        const newUUID = uuidv7();
        const newIndexFile: IndexFile = {
            uuid: newUUID,
            parentUuids: parentIndexes.map((index) => index.uuid),
            environmentId: localIndex.environmentId,
            files: localIndex.files,
            timestamp: Date.now(),
        };

        return newIndexFile;
    }

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
        const { dirName, fileName } = this.getHashPathParts(fileHash);
        const filePath = vscode.Uri.joinPath(filesDirUri, dirName, fileName);
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
        if (localIndex.parentUuids.includes(remoteIndex.uuid)) {
            // リモートに変更がないため、競合なし
            return [];
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

        const parentUuids = (previousIndex.uuid !== "") ? [previousIndex.uuid] : [];
        const indexFile: IndexFile = {
            uuid: uuidv7(),
            parentUuids: parentUuids, // ここでリモートのインデックス UUID を設定
            environmentId: options.environmentId,
            files: files,
            timestamp: Date.now(),
        };


        return indexFile;
    }
    // 新しいインデックスファイルをローカルに保存する関数
    public static async saveLocalIndexFile(indexFile: IndexFile, options: LocalObjectManagerOptions): Promise<void> {
        const { dirName, fileName } = this.getUUIDPathParts(indexFile.uuid);
        const dirPath = vscode.Uri.joinPath(indexDirUri, dirName);
        await vscode.workspace.fs.createDirectory(dirPath);
        const indexContent = Buffer.from(JSON.stringify(indexFile, null, 2), "utf-8");
        const indexFileName = indexFile.uuid;
        const indexFilePath = vscode.Uri.joinPath(indexDirUri, dirName, fileName);
        const encryptedIndex = this.encryptContent(indexContent, options.encryptionKey);
        await vscode.workspace.fs.writeFile(indexFilePath, encryptedIndex);
        await vscode.workspace.fs.writeFile(previousIndexIDUri, Buffer.from(indexFileName));
    }

    /**
   * すべてのインデックスファイルを走査して、変更履歴ツリーを1つのテキストファイルに出力する
   */
    public static async exportIndexHistory(options: LocalObjectManagerOptions): Promise<void> {
        // 1) .secureNotes/objects/indexes配下のディレクトリ + ファイルをすべて取得し、名前ソート
        const indexFiles = await this.loadAllIndexFiles(options);

        // 2) 得られた indexFiles を使って、親UUID からツリー構造を作り、テキスト化
        const textTree = this.buildIndexTreeText(indexFiles);

        // 3) テキストを .secureNotes/ChangeHistory.txt に書き出し
        const changeHistoryUri = vscode.Uri.joinPath(secureNootesUri, "ChangeHistory.txt");
        await vscode.workspace.fs.writeFile(changeHistoryUri, Buffer.from(textTree, "utf-8"));

        logMessage("Exported index history.");
    }

    /**
     * .secureNotes/objects/indexes配下のインデックスファイルをすべて読み込み、UUIDと時系列順に返す
     *  - ディレクトリ名 + ファイル名が 16進timestamp のため、文字列ソートだけで時系列順が得られる
     */
    private static async loadAllIndexFiles(options: LocalObjectManagerOptions): Promise<IndexFile[]> {
        const allIndexFiles: IndexFile[] = [];
        try {
            // indexDirUri (.secureNotes/objects/indexes)
            // まずサブディレクトリ一覧を取得
            const dirs = await vscode.workspace.fs.readDirectory(indexDirUri);
            // ディレクトリだけフィルタ
            const dirNames = dirs
                .filter(([_, fileType]) => fileType === vscode.FileType.Directory)
                .map(([name]) => name)
                .sort(); // 文字列昇順

            for (const dirName of dirNames) {
                const dirUri = vscode.Uri.joinPath(indexDirUri, dirName);
                const files = await vscode.workspace.fs.readDirectory(dirUri);
                // ファイルだけを取り出してソート
                const fileNames = files
                    .filter(([_, fileType]) => fileType === vscode.FileType.File)
                    .map(([name]) => name)
                    .sort();

                // ディレクトリ名 + ファイル名の昇順に読み込む
                for (const fileName of fileNames) {
                    // indexファイルを複合 & JSONパース
                    const indexUri = vscode.Uri.joinPath(dirUri, fileName);
                    const indexFile = await this.decryptIndexFile(indexUri, options.encryptionKey);
                    if (indexFile) {
                        allIndexFiles.push(indexFile);
                    }
                }
            }
        } catch (err) {
            // 存在しないなどのエラーは無視
            logMessage(`loadAllIndexFiles error: ${String(err)}`);
        }

        // 文字列ソートに基づく読み込み順が既に時系列順になっている想定だが、
        // 念のため「IndexFile.timestamp」の昇順でも並べ替えておきたい場合は以下を使用
        // allIndexFiles.sort((a, b) => a.timestamp - b.timestamp);

        return allIndexFiles;
    }

    /**
     * 個別の index ファイルを読み込み、複合して IndexFile オブジェクトを返す
     */
    private static async decryptIndexFile(indexUri: vscode.Uri, encryptionKey: string): Promise<IndexFile | null> {
        try {
            const encryptedContent = await vscode.workspace.fs.readFile(indexUri);
            const content = this.decryptContent(Buffer.from(encryptedContent), encryptionKey);
            const index = JSON.parse(content.toString()) as IndexFile;
            return index;
        } catch (error: any) {
            logMessage(`Failed to decrypt index file '${indexUri.path}': ${error.message}`);
            return null;
        }
    }

    /**
     * 親UUIDを辿って履歴ツリーを構築し、テキストとして整形する
     *  - 同じUUIDが複数のインデックスで参照される場合があるため、DAG構造の簡易的なテキスト表示を行う
     *  - 例として各IndexFileを「UUID, parentUuids, timestamp」などをインデント付きで表示する
     */
    private static buildIndexTreeText(indexFiles: IndexFile[]): string {
        // uuid -> IndexFile へのマップ
        const mapByUuid = new Map<string, IndexFile>();
        for (const idxFile of indexFiles) {
            mapByUuid.set(idxFile.uuid, idxFile);
        }

        // まず子リストを作っておく (uuid -> children[])
        const childrenMap = new Map<string, string[]>();
        for (const idxFile of indexFiles) {
            // 親リストの中に自分(idxFile.uuid) を child として登録
            for (const parentUuid of idxFile.parentUuids) {
                if (!childrenMap.has(parentUuid)) {
                    childrenMap.set(parentUuid, []);
                }
                childrenMap.get(parentUuid)!.push(idxFile.uuid);
            }
        }

        // ルート（ = 親を持たない = parentUuids.length === 0）のもの、もしくは親UUIDが見つからないものを探す
        // ただしインデックスが分岐マージしている場合、複数ルートがある可能性もある
        const rootUuids: string[] = [];
        for (const idxFile of indexFiles) {
            if (idxFile.parentUuids.length === 0) {
                // 親が無い
                rootUuids.push(idxFile.uuid);
            } else {
                // 親がある場合でも、「古いインデックスファイルが無くなってしまった」ケースで
                // parentUuid が mapByUuid に無い場合はここをルート扱いにする
                let allParentsExist = true;
                for (const p of idxFile.parentUuids) {
                    if (!mapByUuid.has(p)) {
                        allParentsExist = false;
                        break;
                    }
                }
                if (!allParentsExist) {
                    rootUuids.push(idxFile.uuid);
                }
            }
        }

        // 重複排除しておく
        const uniqueRoots = Array.from(new Set(rootUuids));

        // ツリー表示を DFS で構築
        const lines: string[] = [];
        for (const rootUuid of uniqueRoots) {
            this.dfsIndexTree(rootUuid, mapByUuid, childrenMap, 0, lines);
        }

        // lines を結合して返す
        return lines.join("\n");
    }

    /**
     * DFS しながら適当にインデントを付けて文字列を整形
     */
    private static dfsIndexTree(
        currentUuid: string,
        mapByUuid: Map<string, IndexFile>,
        childrenMap: Map<string, string[]>,
        depth: number,
        lines: string[],
        visited = new Set<string>()
    ) {
        // 再訪問によるループを防止
        if (visited.has(currentUuid)) {
            lines.push(`${"  ".repeat(depth)}* ${currentUuid} (already shown above)`);
            return;
        }
        visited.add(currentUuid);

        const idxFile = mapByUuid.get(currentUuid);
        if (!idxFile) {
            // 万一マップに無ければ情報なし
            lines.push(`${"  ".repeat(depth)}* ${currentUuid} (missing)`);
            return;
        }

        // 表示内容を組み立て（最低限、UUIDとtimestamp、親の列くらい）
        // 必要に応じて environmentId やファイル数などを表示してもOK
        const indent = "  ".repeat(depth);
        lines.push(`${indent}* UUID: ${idxFile.uuid}`);
        lines.push(`${indent}  Parents: ${idxFile.parentUuids.join(", ") || "(none)"}`);
        lines.push(`${indent}  Environment: ${idxFile.environmentId}`);
        lines.push(`${indent}  Timestamp: ${new Date(idxFile.timestamp).toISOString()}`);
        lines.push(`${indent}  Files: ${idxFile.files.length} file(s)`);
        lines.push(`${indent}  ------`);

        // 子に進む
        const children = childrenMap.get(currentUuid) || [];
        for (const childUuid of children) {
            this.dfsIndexTree(childUuid, mapByUuid, childrenMap, depth + 1, lines, visited);
        }
    }
}
