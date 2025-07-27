// src/LocalObjectManager.ts
import * as vscode from "vscode";
import * as crypto from "crypto";
import { logMessage } from "../logger";
import {
  IndexFile,
  FileEntry,
  UpdateFiles,
  LocalObjectManagerOptions,
} from "../types";
import { v7 as uuidv7 } from "uuid";
import * as path from "path";

const secureNotesDir = ".secureNotes";
const ignorePath = [`${secureNotesDir}/**`, `**/node_modules/**`, `.vscode/**`];

/**
 * ファイルパスがignorePathに含まれるかどうかをチェックする関数
 */
function isIgnoredPath(filePath: string): boolean {
  const patterns = [
    secureNotesDir,
    'node_modules',
    '.vscode'
  ];

  return patterns.some(pattern => {
    // パターンがファイルパスに含まれているかチェック
    return filePath.includes(pattern) || filePath.startsWith(pattern + '/');
  });
}
const remotesDirName = "remotes";
const indexDirName = "indexes";
const filesDirName = "files";
const refsDirName = "refs";
const branchName = "main";
const wsIndexFilename = "wsIndex.json";
const HEAD_FILE_NAME = "HEAD"; // .secureNotes/HEAD というファイルにブランチ名を保存
// 動的にrootUriを取得するように変更
function getSecureNotesUri(): vscode.Uri {
  const rootUri = getRootUri();
  return vscode.Uri.joinPath(rootUri, secureNotesDir);
}

function getRemotesDirUri(): vscode.Uri {
  return vscode.Uri.joinPath(getSecureNotesUri(), remotesDirName);
}

// 後方互換性のためのexport（非推奨）
export const secureNootesUri = getSecureNotesUri();
export const remotesDirUri = getRemotesDirUri();
// 動的にURIを取得する関数群
function getRemoteRefsDirUri(): vscode.Uri {
  return vscode.Uri.joinPath(getRemotesDirUri(), refsDirName);
}

function getRemoteRefBranchUri(): vscode.Uri {
  return vscode.Uri.joinPath(getRemoteRefsDirUri(), branchName);
}

function getWsIndexUri(): vscode.Uri {
  return vscode.Uri.joinPath(getSecureNotesUri(), wsIndexFilename);
}

function getIndexDirUri(): vscode.Uri {
  return vscode.Uri.joinPath(getRemotesDirUri(), indexDirName);
}

function getFilesDirUri(): vscode.Uri {
  return vscode.Uri.joinPath(getRemotesDirUri(), filesDirName);
}

// 後方互換性のためのexport（非推奨）
export const remoteRefsDirUri = getRemoteRefsDirUri();
export const remoteRefBranchUri = getRemoteRefBranchUri();
const wsIndexUri = getWsIndexUri();
const indexDirUri = getIndexDirUri();
const filesDirUri = getFilesDirUri();

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
    // テスト環境でワークスペースが設定されていない場合のフォールバック
    const path = require('path');
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), 'test-workspace');
    return vscode.Uri.file(tempDir);
  }
  return workspaceUri;
}

export class LocalObjectManager {
  private workspaceDir: string;
  private context: vscode.ExtensionContext;

  constructor(workspaceDir: string, context: vscode.ExtensionContext) {
    this.workspaceDir = workspaceDir;
    this.context = context;
  }

  /**
   * ワークスペースファイルの暗号化・保存（新規リポジトリ用）
   */
  public async encryptAndSaveWorkspaceFiles(): Promise<IndexFile> {
    const encryptionKey = await this.context.secrets.get('aesEncryptionKey');
    if (!encryptionKey) {
      throw new Error('AES encryption key not found');
    }

    const options: LocalObjectManagerOptions = {
      encryptionKey,
      environmentId: 'default'
    };

    // 空のインデックスから開始
    const emptyIndex: IndexFile = {
      uuid: "",
      parentUuids: [],
      environmentId: options.environmentId,
      files: [],
      timestamp: 0,
    };

    // ワークスペースファイルをスキャンしてインデックスを作成
    const localIndex = await LocalObjectManager.generateLocalIndexFile(emptyIndex, options);

    // ファイルを暗号化して保存
    await LocalObjectManager.saveEncryptedObjects(localIndex.files, emptyIndex, options);

    // インデックスファイルを保存
    await LocalObjectManager.saveIndexFile(localIndex, 'main', encryptionKey);

    // ワークスペースインデックスを保存
    await LocalObjectManager.saveWsIndexFile(localIndex, options);

    return localIndex;
  }

  /**
   * 個別ファイルの復号化・復元
   */
  public async decryptAndRestoreFile(fileEntry: FileEntry): Promise<void> {
    const encryptionKey = await this.context.secrets.get('aesEncryptionKey');
    if (!encryptionKey) {
      throw new Error('AES encryption key not found');
    }

    await LocalObjectManager.fetchDecryptAndSaveFile(
      fileEntry.path,
      fileEntry.hash,
      { encryptionKey, environmentId: 'default' },
    );
  }

  /**
   * リモートインデックスファイル読み込み
   */
  public async loadRemoteIndexes(): Promise<IndexFile[]> {
    logMessage('LocalObjectManager: loadRemoteIndexes called');
    const encryptionKey = await this.context.secrets.get('aesEncryptionKey');
    if (!encryptionKey) {
      logMessage('LocalObjectManager: AES encryption key not found in loadRemoteIndexes');
      throw new Error('AES encryption key not found');
    }
    logMessage('LocalObjectManager: AES encryption key loaded successfully in loadRemoteIndexes');

    const options: LocalObjectManagerOptions = {
      encryptionKey,
      environmentId: 'default'
    };

    const indexes: IndexFile[] = [];
    const indexDirUri = getIndexDirUri();

    try {
      // インデックスディレクトリ内のすべてのサブディレクトリを取得
      const indexDirs = await vscode.workspace.fs.readDirectory(indexDirUri);

      for (const [dirName, fileType] of indexDirs) {
        if (fileType === vscode.FileType.Directory) {
          const subDirUri = vscode.Uri.joinPath(indexDirUri, dirName);
          const files = await vscode.workspace.fs.readDirectory(subDirUri);

          for (const [fileName, fileType] of files) {
            if (fileType === vscode.FileType.File) {
              const uuid = dirName + fileName;
              try {
                const index = await LocalObjectManager.loadIndex(uuid, options);
                indexes.push(index);
              } catch (error) {
                logMessage(`Failed to load index ${uuid}: ${error}`);
              }
            }
          }
        }
      }
    } catch (error) {
      logMessage(`No remote indexes found: ${error}`);
    }

    return indexes;
  }

  /**
   * 最新インデックス特定
   */
  public async findLatestIndex(indexes: IndexFile[]): Promise<IndexFile> {
    if (indexes.length === 0) {
      throw new Error('No indexes provided');
    }

    // タイムスタンプで最新のインデックスを特定
    let latestIndex = indexes[0];
    for (const index of indexes) {
      if (index.timestamp > latestIndex.timestamp) {
        latestIndex = index;
      }
    }

    return latestIndex;
  }

  /**
   * ワークスペースインデックス更新
   */
  public async updateWorkspaceIndex(indexFile: IndexFile): Promise<void> {
    const encryptionKey = await this.context.secrets.get('aesEncryptionKey');
    if (!encryptionKey) {
      throw new Error('AES encryption key not found');
    }

    await LocalObjectManager.saveWsIndexFile(indexFile, {
      encryptionKey,
      environmentId: 'default'
    });
  }

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
      const rootUri = getRootUri();
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
    const filesDirUri = getFilesDirUri();
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
      const wsIndexUri = getWsIndexUri();
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
      const remoteRefBranchUri = getRemoteRefBranchUri();
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
    const indexDirUri = getIndexDirUri();
    const uuidparts = this.getUUIDPathParts(uuid);
    const encryptedIndex = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(indexDirUri, uuidparts.dirName, uuidparts.fileName)
    );
    const index = this.decryptContent(
      Buffer.from(encryptedIndex),
      options.encryptionKey
    );
    const indexFile: IndexFile = JSON.parse(index.toString());

    // files配列をpath順にソート
    indexFile.files.sort((a, b) => a.path.localeCompare(b.path));

    return indexFile;
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
    const filesDirUri = getFilesDirUri();
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
      const savePath = conflictFileName ? conflictFileName : filePath;

      // ignorePathに含まれるファイルは復元しない
      if (isIgnoredPath(savePath)) {
        logMessage(`Skipped restoring ignored file: ${savePath}`);
        return;
      }

      const decryptedContent = await this.decryptFileFromLocalObject(
        fileHash,
        options
      );

      // ローカルファイルパスを取得
      const rootUri = getRootUri();
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

  // ローカルファイルをコンフリクトファイルとしてリネームし、リモートファイルをローカルに保存
  public static async localFileToConflictAndSaveRemote(
    filePath: string,
    fileHash: string,
    timestamp: Date,
    options: LocalObjectManagerOptions
  ): Promise<void> {
    // コンフリクト用のファイル名を生成（例: conflict-local-YYYYMMDD-HHmmss-ファイル名.ext）
    const time = timestamp
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];
    const conflictFileName = `conflict-local-${time}/${filePath}`;

    // ローカルファイルのURIを取得
    const rootUri = getRootUri();
    const localUri = vscode.Uri.joinPath(
      vscode.Uri.file(rootUri.fsPath),
      filePath
    );
    const conflictUri = vscode.Uri.joinPath(
      vscode.Uri.file(rootUri.fsPath),
      conflictFileName
    );

    try {
      // コンフリクトファイルのディレクトリを作成
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.joinPath(conflictUri, "..")
      );

      // ローカルファイルをコンフリクトファイル名にリネーム
      const content = await vscode.workspace.fs.readFile(localUri);
      await vscode.workspace.fs.writeFile(conflictUri, content);
      await vscode.workspace.fs.delete(localUri, { useTrash: false });

      // リモートファイルをローカルに保存
      await this.fetchDecryptAndSaveFile(filePath, fileHash, options);
      logMessage(
        `Moved local file to conflict file: ${conflictFileName} and saved remote file to ${filePath}`
      );
    } catch (error: any) {
      logMessage(
        `Failed to move local file and save remote: ${filePath}. Error: ${error.message}`
      );
      throw error;
    }
  }

  // リモートのファイルを別名で保存
  public static async saveRemoteFileAsConflict(
    filePath: string,
    fileHash: string,
    timestamp: Date,
    options: LocalObjectManagerOptions
  ): Promise<void> {
    // コンフリクト用のファイル名を生成（例: conflict-remote-YYYYMMDD-HHmmss-ファイル名.ext）
    //const timestamp = new Date()
    const time = timestamp
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];
    const conflictFileName = `conflict-remote-${time}/${filePath}`;
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
    conflicts: UpdateFiles[],
    options: LocalObjectManagerOptions
  ): Promise<boolean> {
    for (const conflict of conflicts) {
      switch (conflict.UpdateType) {
        case "remoteUpdate":
        case "remoteAdd":
          // リモートの更新または追加の場合、リモートファイルを採用
          await this.fetchDecryptAndSaveFile(
            conflict.filePath,
            conflict.remoteHash,
            options
          );
          logMessage(
            `Applied remote ${conflict.UpdateType} for: ${conflict.filePath}`
          );
          break;

        case "localUpdate":
        case "localDelete":
          // ローカルの変更がある場合、ローカルファイルをコンフリクトとして保存し、リモートを採用
          if (conflict.localHash.length > 0) {
            const now = new Date();
            await this.localFileToConflictAndSaveRemote(
              conflict.filePath,
              conflict.remoteHash,
              now,
              options
            );
            logMessage(
              `Saved local as conflict and applied remote for: ${conflict.filePath}`
            );
          }
          break;

        case "remoteDelete":
          // リモートで削除された場合の処理
          if (conflict.localHash.length > 0) {
            // ローカルに変更がある場合は、deleted-{日付} ディレクトリに移動
            const now = new Date();
            const time = now
              .toISOString()
              .replace(/[:.]/g, "-")
              .replace("T", "_")
              .split("Z")[0];
            const deletedFileName = `deleted-${time}/${conflict.filePath}`;

            // ローカルファイルのURIを取得
            const rootUri = getRootUri();
            const localUri = vscode.Uri.joinPath(
              vscode.Uri.file(rootUri.fsPath),
              conflict.filePath
            );
            const deletedUri = vscode.Uri.joinPath(
              vscode.Uri.file(rootUri.fsPath),
              deletedFileName
            );

            try {
              // 削除済みファイルのディレクトリを作成
              //await vscode.workspace.fs.createDirectory(
              //  vscode.Uri.joinPath(deletedUri, "..")
              //);

              // ファイルを移動
              const content = await vscode.workspace.fs.readFile(localUri);
              await vscode.workspace.fs.writeFile(deletedUri, content);
              await vscode.workspace.fs.delete(localUri, { useTrash: false });
              logMessage(
                `Moved locally modified file to deleted directory: ${deletedFileName}`
              );
            } catch (error: any) {
              logMessage(
                `Failed to move file to deleted directory: ${error.message}`
              );
              throw error;
            }
          } else {
            // ローカルに変更がない場合は単純に削除
            await this.removeFile(conflict.filePath);
            logMessage(
              `Removed local file due to remote delete: ${conflict.filePath}`
            );
          }
          break;

        case "localAdd":
          // ローカルの新規追加の場合、そのまま残す
          logMessage(`Keeping locally added file: ${conflict.filePath}`);
          break;
      }
    }
    return true;
  }

  // ローカルとリモートのインデックスファイルを比較し、競合を検出します。
  public static detectConflicts(
    previousIndex: IndexFile,
    localIndex: IndexFile,
    remoteIndex: IndexFile
  ): UpdateFiles[] {
    const conflicts: UpdateFiles[] = [];

    // それぞれのインデックスからファイルマップを作成
    const previousFileMap = new Map<string, FileEntry>();
    const localFileMap = new Map<string, FileEntry>();
    const remoteFileMap = new Map<string, FileEntry>();

    for (const file of previousIndex.files) {
      previousFileMap.set(file.path, file);
    }
    for (const file of localIndex.files) {
      localFileMap.set(file.path, file);
    }
    for (const file of remoteIndex.files) {
      remoteFileMap.set(file.path, file);
    }

    // すべてのファイルパスの集合を作成
    const allPaths = new Set([
      ...previousFileMap.keys(),
      ...localFileMap.keys(),
      ...remoteFileMap.keys(),
    ]);

    for (const path of allPaths) {
      const prevFile = previousFileMap.get(path);
      const localFile = localFileMap.get(path);
      const remoteFile = remoteFileMap.get(path);

      // ファイルの状態を判定
      if (localFile && remoteFile) {
        // 両方に存在する場合
        if (localFile.hash !== remoteFile.hash) {
          const prevHash = prevFile?.hash || "";
          if (localFile.hash === prevHash) {
            // ローカルが変更されていない場合は remoteUpdate
            conflicts.push({
              UpdateType: "remoteUpdate",
              filePath: path,
              localHash: localFile.hash,
              remoteHash: remoteFile.hash,
              localTimestamp: localFile.timestamp,
              remoteTimestamp: remoteFile.timestamp,
            });
          } else if (remoteFile.hash === prevHash) {
            // リモートが変更されていない場合は localUpdate
            conflicts.push({
              UpdateType: "localUpdate",
              filePath: path,
              localHash: localFile.hash,
              remoteHash: remoteFile.hash,
              localTimestamp: localFile.timestamp,
              remoteTimestamp: remoteFile.timestamp,
            });
          } else {
            // 両方が変更されている場合は競合として扱う
            conflicts.push({
              UpdateType:
                localFile.timestamp > remoteFile.timestamp
                  ? "localUpdate"
                  : "remoteUpdate",
              filePath: path,
              localHash: localFile.hash,
              remoteHash: remoteFile.hash,
              localTimestamp: localFile.timestamp,
              remoteTimestamp: remoteFile.timestamp,
            });
          }
        }
      } else if (localFile && !remoteFile) {
        // ローカルにのみ存在する場合
        if (!prevFile) {
          // 新規追加
          conflicts.push({
            UpdateType: "localAdd",
            filePath: path,
            localHash: localFile.hash,
            remoteHash: "",
            localTimestamp: localFile.timestamp,
            remoteTimestamp: 0,
          });
        } else if (!localFile.deleted) {
          // リモートで削除された
          conflicts.push({
            UpdateType: "remoteDelete",
            filePath: path,
            localHash: localFile.hash,
            remoteHash: "",
            localTimestamp: localFile.timestamp,
            remoteTimestamp: 0,
          });
        }
      } else if (!localFile && remoteFile) {
        // リモートにのみ存在する場合
        if (!prevFile) {
          // 新規追加
          conflicts.push({
            UpdateType: "remoteAdd",
            filePath: path,
            localHash: "",
            remoteHash: remoteFile.hash,
            localTimestamp: 0,
            remoteTimestamp: remoteFile.timestamp,
          });
        } else if (!remoteFile.deleted) {
          // ローカルで削除された
          conflicts.push({
            UpdateType: "localDelete",
            filePath: path,
            localHash: "",
            remoteHash: remoteFile.hash,
            localTimestamp: 0,
            remoteTimestamp: remoteFile.timestamp,
          });
        }
      }
    }

    return conflicts;
  }
  /**
   * 初期インデックスファイルを生成する（新規リポジトリ用）
   */
  static async generateInitialIndex(
    options: LocalObjectManagerOptions
  ): Promise<IndexFile> {
    const emptyIndex: IndexFile = {
      uuid: uuidv7(),
      environmentId: options.environmentId,
      parentUuids: [],
      files: [],
      timestamp: Date.now(),
    };
    return await this.generateLocalIndexFile(emptyIndex, options);
  }

  /**
   * 空のインデックスファイルを生成する（既存リポジトリ取り込み用）
   */
  static async generateEmptyIndex(
    options: LocalObjectManagerOptions
  ): Promise<IndexFile> {
    return {
      uuid: uuidv7(),
      environmentId: options.environmentId,
      parentUuids: [],
      files: [],
      timestamp: Date.now(),
    };
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
        `{${ignorePath.join(",")}}`,
      );

      for (const fileUri of filesInFolder) {
        const stat = await vscode.workspace.fs.stat(fileUri);
        // ワークスペースフォルダからの相対パスを正しく取得
        const relativePath = path.relative(folder.uri.fsPath, fileUri.fsPath);

        filesMap.set(relativePath, {
          path: relativePath,
          hash: "",
          timestamp: stat.mtime,
        });

        // 前回のインデックスに同じファイルがあるか確認
        const previousFileEntry = previousFileMap.get(relativePath);

        let hash = "";
        if (previousFileEntry && previousFileEntry.timestamp === stat.mtime) {
          // タイムスタンプが同じ場合、ハッシュ値を再利用
          hash = previousFileEntry.hash;
        } else {
          // タイムスタンプが異なる場合、ハッシュ値を再計算
          const fileContent = await vscode.workspace.fs.readFile(fileUri);
          hash = crypto.createHash("sha256").update(fileContent).digest("hex");
        }
        files.push({ path: relativePath, hash: hash, timestamp: stat.mtime });
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
    const wsIndexUri = getWsIndexUri();
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
    const indexDirUri = getIndexDirUri();
    const { dirName, fileName } = this.getUUIDPathParts(indexFile.uuid);
    const dirPath = vscode.Uri.joinPath(indexDirUri, dirName);
    await vscode.workspace.fs.createDirectory(dirPath);

    // files配列をpath順にソートしてから保存
    const sortedIndexFile: IndexFile = {
      ...indexFile,
      files: [...indexFile.files].sort((a, b) => a.path.localeCompare(b.path))
    };

    const indexContent = Buffer.from(
      JSON.stringify(sortedIndexFile, null, 2),
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
    options: LocalObjectManagerOptions,
    forceCheckout: boolean
  ): Promise<void> {
    logMessage(
      `reflectFileChanges: Start. forceCheckout:${forceCheckout} oldIndex:${oldIndex.uuid}, newIndex:${newIndex.uuid}`
    );
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
      if (newFileEntry.deleted) {
        continue;
      }

      // ignorePathに含まれるファイルは復元しない
      if (isIgnoredPath(filePath)) {
        logMessage(`reflectFileChanges: Skipped ignored file -> ${filePath}`);
        continue;
      }

      const oldFileEntry = oldMap.get(filePath);

      // ファイルが新規追加された場合、または削除されていたファイルが復活した場合のみ復元
      if (!oldFileEntry || oldFileEntry.deleted) {
        logMessage(`reflectFileChanges: File added -> ${filePath}`);
        await LocalObjectManager.fetchDecryptAndSaveFile(
          filePath,
          newFileEntry.hash,
          options
        );
      }
      // ファイルが更新された場合（ハッシュ値が異なる場合）のみ復元
      else if (oldFileEntry.hash !== newFileEntry.hash) {
        logMessage(`reflectFileChanges: File updated -> ${filePath} (hash changed)`);
        await LocalObjectManager.fetchDecryptAndSaveFile(
          filePath,
          newFileEntry.hash,
          options
        );
      }
      /*else {
        // ハッシュ値が同じ場合は復元をスキップ
        logMessage(`reflectFileChanges: File unchanged -> ${filePath} (hash match, skipping restore)`);
      }*/
    }

    // 2) 削除されたファイルの反映
    // oldIndex にはあるが newIndex では削除フラグがあるファイル
    for (const [filePath, oldFileEntry] of oldMap.entries()) {
      const newfile = newMap.get(filePath);
      if (forceCheckout) {
        if (!newfile || newfile.deleted) {
          // 強制チェックアウトの場合、newIndexに存在しないファイルは削除
          this.removeFile(filePath);
        }
      } else {
        if (
          newfile &&
          newfile.deleted &&
          newfile.timestamp === oldFileEntry.timestamp // 削除フラグが立っているがタイムスタンプが同じ場合
        ) {
          this.removeFile(filePath);
        }
      }
    }
  }
  private static async removeFile(filePath: string): Promise<void> {
    // ignorePathに含まれるファイルは削除しない
    if (isIgnoredPath(filePath)) {
      logMessage(`reflectFileChanges: Skipped removing ignored file -> ${filePath}`);
      return;
    }

    // ローカルワークスペースから削除
    const rootUri = getRootUri();
    const localUri = vscode.Uri.joinPath(rootUri, filePath);
    try {
      try {
        const fsstat = await vscode.workspace.fs.stat(localUri);
        if (fsstat.type !== vscode.FileType.File) {
          return;
        }
      } catch {
        return;
      }
      // VSCodeのworkspace.fs.deleteで削除実行
      await vscode.workspace.fs.delete(localUri, {
        recursive: false,
        useTrash: false,
      });
      logMessage(`reflectFileChanges: File removed -> ${filePath}`);
    } catch (error: any) {
      // 存在しない場合などは単にログ出力
      logMessage(`warning: deleting file: ${filePath}. ${error.message}`);
    }
  }
  public static getRefsDirUri(): vscode.Uri {
    return getRemoteRefsDirUri(); // .secureNotes/remotes/refs
  }

  // Save the indexFile.uuid as the "latest" for the given branch
  public static async saveBranchRef(
    branchName: string,
    indexFileUuid: string,
    encryptionKey: string
  ): Promise<void> {
    const remoteRefsDirUri = getRemoteRefsDirUri();
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
    const remoteRefsDirUri = getRemoteRefsDirUri();
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

/**
 * 現在のブランチ名を読み込む。無い場合は "main" を返す
 */
export async function getCurrentBranchName(): Promise<string> {
  try {
    const rootUri = vscode.workspace.workspaceFolders?.[0].uri;
    if (!rootUri) {
      return "main";
    }
    const headUri = vscode.Uri.joinPath(
      rootUri,
      ".secureNotes",
      HEAD_FILE_NAME
    );
    const data = await vscode.workspace.fs.readFile(headUri);
    const branch = data.toString().trim();
    return branch || "main";
  } catch {
    // HEADファイルが存在しないなどの場合
    return "main";
  }
}

/**
 * 現在のブランチ名を .secureNotes/HEAD に書き込む
 */
export async function setCurrentBranchName(branchName: string): Promise<void> {
  const rootUri = getRootUri();
  const headUri = vscode.Uri.joinPath(rootUri, ".secureNotes", HEAD_FILE_NAME);
  await vscode.workspace.fs.writeFile(headUri, Buffer.from(branchName, "utf8"));
}
