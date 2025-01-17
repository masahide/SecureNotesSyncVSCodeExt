// src/LocalObjectManager.ts
import * as vscode from "vscode";
import * as crypto from "crypto";
import { logMessage } from "../logger";
import {
  IndexFile,
  FileEntry,
  Conflict,
  LocalObjectManagerOptions,
} from "../types";
import { v7 as uuidv7 } from "uuid";

const secureNotesDir = ".secureNotes";
const objectDirName = "objects";
const remotesDirName = "remotes";
const indexDirName = "indexes";
const filesDirName = "files";
const refsDirName = "refs";
const branchName = "main";
const wsIndexFilename = "wsIndex.json";
const rootUri = getRootUri();
export const secureNootesUri = vscode.Uri.joinPath(rootUri, secureNotesDir);
export const remotesDirUri = vscode.Uri.joinPath(
  secureNootesUri,
  remotesDirName
);
//export const objectDirUri = vscode.Uri.joinPath(secureNootesUri, objectDirName);
export const remoteRefsDirUri = vscode.Uri.joinPath(remotesDirUri, refsDirName);
export const remoteRefBranchUri = vscode.Uri.joinPath(
  remoteRefsDirUri,
  branchName
);
const wsIndexUri = vscode.Uri.joinPath(secureNootesUri, wsIndexFilename);

const indexDirUri = vscode.Uri.joinPath(remotesDirUri, indexDirName);
const filesDirUri = vscode.Uri.joinPath(remotesDirUri, filesDirName);

interface FileIndex {
  originalFile: string;
  encryptedFile: string;
}

// ワークスペースフォルダを取得
function getRootUri(): vscode.Uri {
  const workspaceUri = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;
  if (!workspaceUri) {
    throw new Error("No workspace folder found.");
  }
  return workspaceUri;
}

export class LocalObjectManager {
  /**
   * ワークスペース内ファイルを暗号化し、.secureNotes に保存
   */
  public static async saveEncryptedObjects(
    localFiles: FileEntry[],
    latestIndex: IndexFile,
    options: LocalObjectManagerOptions
  ): Promise<boolean> {
    // リモートのファイルハッシュ値のセットを作成
    const latestFileHashes = new Set(
      latestIndex.files.map((file) => file.hash)
    );
    let updated = false;
    for (const file of localFiles) {
      if (file.deleted) {
        continue; // 削除されたファイルはアップロードしない
      }
      if (latestFileHashes.has(file.hash)) {
        continue; // 既に存在する場合、アップロードをスキップ
      }
      // ファイルを読み込み
      const fileUri = vscode.Uri.joinPath(rootUri, file.path);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);

      // ファイルを暗号化
      const encryptedContent = this.encryptContent(
        Buffer.from(fileContent),
        options.encryptionKey
      );

      // objects directory に保存
      //const { dirName, fileName } = this.getHashPathParts(file.hash);
      //const encryptedFileName = vscode.Uri.joinPath(filesDirUri, dirName, fileName);
      const encryptedFileUri = this.getHashFilePathUri(file.hash);
      await vscode.workspace.fs.writeFile(encryptedFileUri, encryptedContent);
      logMessage(`save file:${file.path}, to:${encryptedFileUri.path}`);
      updated = true;
    }
    return updated;
  }

  private static getUUIDPathParts(uuid: string): {
    dirName: string;
    fileName: string;
  } {
    const dirName = uuid.substring(0, 6);
    const fileName = uuid.substring(6);
    return { dirName, fileName };
  }
  private static getHashPathParts(uuid: string): {
    dirName: string;
    fileName: string;
  } {
    const dirName = uuid.substring(0, 2);
    const fileName = uuid.substring(2);
    return { dirName, fileName };
  }

  private static getHashFilePathUri(hash: string): vscode.Uri {
    const { dirName, fileName } = this.getHashPathParts(hash);
    return vscode.Uri.joinPath(filesDirUri, dirName, fileName);
  }

  /**
   * wsIndexを読み込む関数
   */
  public static async loadWsIndex(
    options: LocalObjectManagerOptions
  ): Promise<IndexFile> {
    try {
      const content = await vscode.workspace.fs.readFile(wsIndexUri);
      return JSON.parse(content.toString()) as IndexFile;
    } catch (error) {
      logMessage(`Latest index file not found. Creating new index`);
      return {
        uuid: "",
        parentUuids: [],
        environmentId: options.environmentId,
        files: [],
        timestamp: 0,
      };
    }
  }

  // リモートインデックスファイルを読み込む関数
  public static async loadRemoteIndex(
    options: LocalObjectManagerOptions
  ): Promise<IndexFile> {
    try {
      const encrypedUuid = await vscode.workspace.fs.readFile(
        remoteRefBranchUri
      );
      const uuid = this.decryptContent(
        Buffer.from(encrypedUuid),
        options.encryptionKey
      );
      return this.loadIndex(uuid.toString(), options);
    } catch (error) {
      logMessage(`Remote index file not found. Creating new index`);
      return {
        uuid: "",
        parentUuids: [],
        environmentId: options.environmentId,
        files: [],
        timestamp: 0,
      };
    }
  }
  // インデックスファイルを読み込む関数
  public static async loadIndex(
    uuid: string,
    options: LocalObjectManagerOptions
  ): Promise<IndexFile> {
    const uuidparts = this.getUUIDPathParts(uuid);
    const encryptedIndex = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(indexDirUri, uuidparts.dirName, uuidparts.fileName)
    );
    const index = this.decryptContent(
      Buffer.from(encryptedIndex),
      options.encryptionKey
    );
    return JSON.parse(index.toString());
  }

  /**
   * 新しい <UUID> を作成し保存
   */
  public static createNewIndexFile(
    localIndex: IndexFile,
    parentIndexes: IndexFile[]
  ): IndexFile {
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
  private static async decryptFileFromLocalObject(
    fileHash: string,
    options: LocalObjectManagerOptions
  ): Promise<Uint8Array> {
    const { dirName, fileName } = this.getHashPathParts(fileHash);
    const filePath = vscode.Uri.joinPath(filesDirUri, dirName, fileName);
    const content = await vscode.workspace.fs.readFile(filePath);
    try {
      return this.decryptContent(Buffer.from(content), options.encryptionKey);
    } catch (error: any) {
      logMessage(
        `Failed to fetch or decrypt file: ${fileHash}.Error: ${error.message} `
      );
      throw error;
    }
  }
  // オブジェクトディレクトリからファイルを取得し、ワークスペースに保存する共通関数
  private static async fetchDecryptAndSaveFile(
    filePath: string,
    fileHash: string,
    options: LocalObjectManagerOptions,
    conflictFileName?: string
  ): Promise<void> {
    try {
      const decryptedContent = await this.decryptFileFromLocalObject(
        fileHash,
        options
      );
      const savePath = conflictFileName ? conflictFileName : filePath;

      // ローカルファイルパスを取得
      const localUri = vscode.Uri.joinPath(
        vscode.Uri.file(rootUri.fsPath),
        savePath
      );

      // ローカルファイルに保存
      await vscode.workspace.fs.writeFile(localUri, decryptedContent);
      logMessage(`Saved remote file to local path: ${savePath} `);
    } catch (error: any) {
      logMessage(
        `Failed to save remote file to local path: ${filePath}.Error: ${error.message} `
      );
      throw error;
    }
  }
  // リモートのファイルでローカルを上書き
  private static async overwriteLocalFileWithRemote(
    filePath: string,
    fileHash: string,
    options: LocalObjectManagerOptions
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
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];
    const conflictFileName = `conflict - ${timestamp} -${filePath} `;
    await this.fetchDecryptAndSaveFile(
      filePath,
      fileHash,
      options,
      conflictFileName
    );
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
        await this.fetchDecryptAndSaveFile(
          conflict.filePath,
          conflict.remoteHash,
          options
        );
        continue;
      }
      await this.saveRemoteFileAsConflict(
        conflict.filePath,
        conflict.remoteHash,
        options
      );
    }
    return true;
  }
  // ローカルとリモートのインデックスファイルを比較し、競合を検出します。
  public static detectConflicts(
    localIndex: IndexFile,
    remoteIndex: IndexFile
  ): Conflict[] {
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
  static async generateLocalIndexFile(
    previousIndex: IndexFile,
    options: LocalObjectManagerOptions
  ): Promise<IndexFile> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error("No workspace folders found.");
    }

    const files: FileEntry[] = [];
    const filesMap = new Map<string, FileEntry>();
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
          filesMap.set(relativePath, { ...previousFileEntry });
        } else {
          // タイムスタンプが異なる場合、ハッシュ値を再計算
          const fileContent = await vscode.workspace.fs.readFile(fileUri);
          const hash = crypto
            .createHash("sha256")
            .update(fileContent)
            .digest("hex");

          files.push({
            path: relativePath,
            hash: hash,
            timestamp: stat.mtime,
          });
        }
      }
      // ファイルの削除を検出し、files に追加
      for (const [path, fileEntry] of previousFileMap) {
        if (!filesMap.has(path)) {
          files.push({
            path: path,
            hash: fileEntry.hash, // 削除されたファイルのハッシュ値はそのまま
            timestamp: fileEntry.timestamp, // 削除されたファイルのタイムスタンプはそのまま
            deleted: true,
          });
        }
      }
    }

    const parentUuids = previousIndex.uuid !== "" ? [previousIndex.uuid] : [];
    const indexFile: IndexFile = {
      uuid: uuidv7(),
      parentUuids: parentUuids, // ここでリモートのインデックス UUID を設定
      environmentId: options.environmentId,
      files: files,
      timestamp: Date.now(),
    };

    return indexFile;
  }
  //wsIndexに保存する関数
  public static async saveWsIndexFile(
    indexFile: IndexFile,
    options: LocalObjectManagerOptions
  ): Promise<void> {
    const indexContent = Buffer.from(
      JSON.stringify(indexFile, null, 2),
      "utf-8"
    );
    await vscode.workspace.fs.writeFile(wsIndexUri, indexContent);
  }

  // 新しいインデックスファイルをgit:localブランチに保存する関数
  public static async saveIndexFile(
    indexFile: IndexFile,
    branchName: string,
    encryptionKey: string
  ): Promise<void> {
    const { dirName, fileName } = this.getUUIDPathParts(indexFile.uuid);
    const dirPath = vscode.Uri.joinPath(indexDirUri, dirName);
    await vscode.workspace.fs.createDirectory(dirPath);

    const indexContent = Buffer.from(
      JSON.stringify(indexFile, null, 2),
      "utf-8"
    );
    const encryptedIndex = this.encryptContent(indexContent, encryptionKey);
    const indexFilePath = vscode.Uri.joinPath(indexDirUri, dirName, fileName);
    await vscode.workspace.fs.writeFile(indexFilePath, encryptedIndex);

    // Update the ref for this branch
    await this.saveBranchRef(branchName, indexFile.uuid, encryptionKey);
  }

  public static mergeIndexes(
    localIndex: IndexFile,
    remoteIndex: IndexFile
  ): IndexFile {
    // 新しいUUIDを作成
    const newUUID = uuidv7();
    // ファイルを一括管理する Map (key=ファイルパス, value=FileEntry)
    const mergedFileMap = new Map<string, FileEntry>();

    // まずローカル側のファイルを登録
    for (const lf of localIndex.files) {
      mergedFileMap.set(lf.path, { ...lf });
    }

    // 続いてリモート側のファイルをマージ
    for (const rf of remoteIndex.files) {
      const existing = mergedFileMap.get(rf.path);
      if (!existing) {
        // ローカルになければそのまま登録
        mergedFileMap.set(rf.path, { ...rf });
      } else {
        // もし両方にあって、かつ timestamp が異なる場合は新しい方を優先
        if (rf.timestamp > existing.timestamp) {
          mergedFileMap.set(rf.path, { ...rf });
        }
      }
    }

    // マージ後のファイル一覧を生成
    const mergedFiles = Array.from(mergedFileMap.values());

    // 新インデックスを作成
    const newIndex: IndexFile = {
      uuid: newUUID,
      environmentId: localIndex.environmentId,
      // 両方のuuidをparentUuidsに入れておく
      parentUuids: [localIndex.uuid, remoteIndex.uuid].filter((u) => u !== ""),
      files: mergedFiles,
      timestamp: Date.now(),
    };
    return newIndex;
  }

  // 新旧インデックスを比較し、追加されたファイルをローカルへ復元、削除されたファイルをローカルから削除する
  public static async reflectFileChanges(
    oldIndex: IndexFile,
    newIndex: IndexFile,
    options: LocalObjectManagerOptions
  ): Promise<void> {
    const rootUri = getRootUri();

    // oldIndex のファイルをMap化
    const oldMap = new Map<string, FileEntry>();
    for (const fileEntry of oldIndex.files) {
      oldMap.set(fileEntry.path, fileEntry);
    }

    // newIndex のファイルをMap化
    const newMap = new Map<string, FileEntry>();
    for (const fileEntry of newIndex.files) {
      newMap.set(fileEntry.path, fileEntry);
    }

    // 1) 追加 or 更新されたファイルの反映
    //   「newIndex にはあるが oldIndex にはない」＝新規追加されたファイル
    for (const [filePath, newFileEntry] of newMap.entries()) {
      if (!oldMap.has(filePath)) {
        // 新規ファイルをローカルへ復元
        // まだローカルに実ファイルが無い場合、.secureNotes/remotes/... から復号して作成する
        logMessage(`reflectFileChanges: File added -> ${filePath}`);
        await LocalObjectManager.fetchDecryptAndSaveFile(
          filePath,
          newFileEntry.hash,
          options
        );
      }
    }

    // 2) 削除されたファイルの反映
    // oldIndex にはあるが newIndex では削除フラグがあるファイル
    for (const [filePath, oldFileEntry] of oldMap.entries()) {
      if (newMap.get(filePath)?.deleted) {
        // ローカルワークスペースから削除
        logMessage(`reflectFileChanges: File removed -> ${filePath}`);
        const localUri = vscode.Uri.joinPath(rootUri, filePath);
        try {
          // VSCodeのworkspace.fs.deleteで削除実行
          await vscode.workspace.fs.delete(localUri, {
            recursive: false,
            useTrash: false,
          });
        } catch (error: any) {
          // 存在しない場合などは単にログ出力
          logMessage(`Error deleting file: ${filePath}. ${error.message}`);
        }
      }
    }
  }
  public static getRefsDirUri(): vscode.Uri {
    return remoteRefsDirUri; // .secureNotes/remotes/refs
  }

  // Save the indexFile.uuid as the "latest" for the given branch
  public static async saveBranchRef(
    branchName: string,
    indexFileUuid: string,
    encryptionKey: string
  ): Promise<void> {
    const refUri = vscode.Uri.joinPath(remoteRefsDirUri, branchName);
    const encryptedUuid = this.encryptContent(
      Buffer.from(indexFileUuid),
      encryptionKey
    );
    await vscode.workspace.fs.writeFile(refUri, encryptedUuid);
  }

  // Read the "latest" indexFile.uuid in the given branch
  public static async readBranchRef(
    branchName: string,
    encryptionKey: string
  ): Promise<string | undefined> {
    const refUri = vscode.Uri.joinPath(remoteRefsDirUri, branchName);
    try {
      const data = await vscode.workspace.fs.readFile(refUri);
      const decrypted = this.decryptContent(Buffer.from(data), encryptionKey);
      return decrypted.toString();
    } catch {
      return undefined;
    }
  }
}
