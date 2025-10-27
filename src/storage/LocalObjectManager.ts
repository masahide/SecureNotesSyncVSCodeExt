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

/**
 * ファイルパスを正規化してUnix形式（/区切り）に統一する
 * Windows環境でも常に/区切りを使用することで、クロスプラットフォーム互換性を確保
 */
function normalizeFilePath(filePath: string): string {
  // Windows形式のパス区切り文字（\）をUnix形式（/）に変換
  return filePath.replace(/\\/g, '/');
}

/**
 * ワークスペースからの相対パスを取得し、正規化する
 */
function getRelativePath(workspaceUri: vscode.Uri, fileUri: vscode.Uri): string {
  const relativePath = path.relative(workspaceUri.fsPath, fileUri.fsPath);
  return normalizeFilePath(relativePath);
}

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
// 旧実装のための関数群はフェーズ7で撤去予定（本クラス内では使用しない）
// getRootUri/getSecureNotesUri 等のグローバル関数依存は排除する

export class LocalObjectManager {
  private workspaceDir: string;
  private environmentId: string;

  // workspaceUri のみを必須とし、鍵は各メソッド呼び出しの options で受け取る
  constructor(workspaceUri: vscode.Uri, environmentId?: string) {
    this.workspaceDir = workspaceUri.fsPath;
    this.environmentId = environmentId || 'default';
  }

  // インスタンスベースのパスユーティリティ
  private getRootUri(): vscode.Uri {
    return vscode.Uri.file(this.workspaceDir);
  }
  private toRelPath(uri: vscode.Uri): string {
    const rel = path.relative(this.workspaceDir, uri.fsPath);
    return normalizeFilePath(rel || uri.fsPath);
  }
  private getSecureNotesUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getRootUri(), secureNotesDir);
  }
  private getRemotesDirUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getSecureNotesUri(), remotesDirName);
  }
  private getRemoteRefsDirUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getRemotesDirUri(), refsDirName);
  }
  private getRemoteRefBranchUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getRemoteRefsDirUri(), branchName);
  }
  private getWsIndexUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getSecureNotesUri(), wsIndexFilename);
  }
  private getIndexDirUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getRemotesDirUri(), indexDirName);
  }
  private getFilesDirUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.getRemotesDirUri(), filesDirName);
  }
  // refs ディレクトリURIの公開アクセサ（TreeView等から参照）
  public getRefsDirUri(): vscode.Uri {
    return this.getRemoteRefsDirUri();
  }

  /**
   * デフォルトオプションとオーバーライドオプションをマージ
   */
  private getEffectiveOptions(overrideOptions?: Partial<LocalObjectManagerOptions>): LocalObjectManagerOptions {
    return {
      encryptionKey: overrideOptions?.encryptionKey ?? "",
      environmentId: overrideOptions?.environmentId ?? this.environmentId,
    };
  }

  /**
   * ワークスペースファイルの暗号化・保存（新規リポジトリ用）
   */
  public async encryptAndSaveWorkspaceFiles(branchName: string = 'main', overrideOptions?: Partial<LocalObjectManagerOptions>): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
    // 空のインデックスから開始
    const emptyIndex: IndexFile = {
      uuid: "",
      parentUuids: [],
      environmentId: options.environmentId,
      files: [],
      timestamp: 0,
    };

    // ワークスペースファイルをスキャンしてインデックスを作成
    const localIndex = await this.generateLocalIndexFile(emptyIndex, options);

    // ファイルを暗号化して保存
    await this.saveEncryptedObjects(localIndex.files, emptyIndex, options);

    // インデックスファイルを保存
    await this.saveIndexFile(localIndex, branchName, options);

    // ワークスペースインデックスを保存
    await this.saveWsIndexFile(localIndex, options);

    return localIndex;
  }

  /**
   * 個別ファイルの復号化・復元
   */
  public async decryptAndRestoreFile(fileEntry: FileEntry, overrideOptions?: Partial<LocalObjectManagerOptions>): Promise<void> {
    await this.fetchDecryptAndSaveFile(
      fileEntry.path,
      fileEntry.hash,
      undefined,
      overrideOptions
    );
  }

  /**
   * リモートインデックスファイル読み込み
   */
  public async loadRemoteIndexes(overrideOptions?: Partial<LocalObjectManagerOptions>): Promise<IndexFile[]> {
    logMessage('LocalObjectManager: loadRemoteIndexes called');

    const indexes: IndexFile[] = [];
    const indexDirUri = this.getIndexDirUri();

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
                const index = await this.loadIndex(uuid, overrideOptions);
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
    await this.saveWsIndexFile(indexFile);
  }

  /**
   * ワークスペース内ファイルを暗号化し、.secureNotes に保存
   */
  public async saveEncryptedObjects(
    localFiles: FileEntry[],
    latestIndex: IndexFile,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<boolean> {
    const options = this.getEffectiveOptions(overrideOptions);
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
      const rootUri = this.getRootUri();
      const fileUri = vscode.Uri.joinPath(rootUri, file.path);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);

      // ファイルを暗号化
      const encryptedContent = this.encryptContent(
        Buffer.from(fileContent),
        options.encryptionKey
      );

      // objects directory に保存
      const encryptedFileUri = this.getHashFilePathUri(file.hash);
      await vscode.workspace.fs.writeFile(encryptedFileUri, encryptedContent);
      logMessage(`save file:${file.path}, to:${this.toRelPath(encryptedFileUri)}`);
      updated = true;
    }
    return updated;
  }

  private getUUIDPathParts(uuid: string): {
    dirName: string;
    fileName: string;
  } {
    const dirName = uuid.substring(0, 6);
    const fileName = uuid.substring(6);
    return { dirName, fileName };
  }
  private getHashPathParts(uuid: string): {
    dirName: string;
    fileName: string;
  } {
    const dirName = uuid.substring(0, 2);
    const fileName = uuid.substring(2);
    return { dirName, fileName };
  }

  private getHashFilePathUri(hash: string): vscode.Uri {
    const filesDirUri = this.getFilesDirUri();
    const { dirName, fileName } = this.getHashPathParts(hash);
    return vscode.Uri.joinPath(filesDirUri, dirName, fileName);
  }

  /**
   * インデックスファイル内のパス正規化とソートを一括で行うユーティリティ。
   * duplicated 正規化処理をここに集約する。
   */
  protected normalizeIndexFile(indexFile: IndexFile): IndexFile {
    indexFile.files = indexFile.files
      .map(file => ({
        ...file,
        path: normalizeFilePath(file.path)
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    return indexFile;
  }

  /**
   * コンフリクトファイル名を生成する共通ヘルパー。
   */
  protected buildConflictFilePath(prefix: string, filePath: string, timestamp: Date): string {
    const time = timestamp
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];
    return `${prefix}-${time}/${filePath}`;
  }

  /**
   * wsIndexを読み込む関数
   */
  public async loadWsIndex(
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
    try {
      const wsIndexUri = this.getWsIndexUri();
      const content = await vscode.workspace.fs.readFile(wsIndexUri);
      const indexFile = JSON.parse(content.toString()) as IndexFile;

      return this.normalizeIndexFile(indexFile);
    } catch (error) {
      logMessage(`Latest index file not found at: ${this.toRelPath(this.getWsIndexUri())}. Creating new index`);
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
  public async loadRemoteIndex(
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
    try {
      const remoteRefBranchUri = this.getRemoteRefBranchUri();
      const encrypedUuid = await vscode.workspace.fs.readFile(
        remoteRefBranchUri
      );
      const uuid = this.decryptContent(
        Buffer.from(encrypedUuid),
        options.encryptionKey
      );
      return await this.loadIndex(uuid.toString(), options);
    } catch (error) {
      logMessage(`Remote ref not found at: ${this.toRelPath(this.getRemoteRefBranchUri())}. Creating new index`);
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
  public async loadIndex(
    uuid: string,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
    const indexDirUri = this.getIndexDirUri();
    const uuidparts = this.getUUIDPathParts(uuid);
    const encryptedIndex = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(indexDirUri, uuidparts.dirName, uuidparts.fileName)
    );
    const index = this.decryptContent(
      Buffer.from(encryptedIndex),
      options.encryptionKey
    );
    const indexFile: IndexFile = JSON.parse(index.toString());
    return this.normalizeIndexFile(indexFile);
  }

  /**
   * 新しい <UUID> を作成し保存
   */
  public createNewIndexFile(
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
  private encryptContent(content: Buffer, encryptionKey: string): Buffer {
    const iv = crypto.randomBytes(16);
    const keyBuffer = Buffer.from(encryptionKey, "hex");
    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * AES-256-CBC で復号
   */
  private decryptContent(encryptedContent: Buffer, encryptionKey: string): Buffer {
    const iv = encryptedContent.subarray(0, 16);
    const encryptedText = encryptedContent.subarray(16);
    const keyBuffer = Buffer.from(encryptionKey, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
    return Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  }

  // 復号化した内容を返す共通関数
  private async decryptFileFromLocalObject(
    fileHash: string,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<Uint8Array> {
    const options = this.getEffectiveOptions(overrideOptions);
    const filesDirUri = this.getFilesDirUri();
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
  private async fetchDecryptAndSaveFile(
    filePath: string,
    fileHash: string,
    conflictFileName?: string,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    const options = this.getEffectiveOptions(overrideOptions);
    try {
      const savePath = conflictFileName ? conflictFileName : filePath;

      // ignorePathに含まれるファイルは復元しない
      if (isIgnoredPath(savePath)) {
        logMessage(`Skipped restoring ignored file: ${savePath}`);
        return;
      }

      const decryptedContent = await this.decryptFileFromLocalObject(
        fileHash,
        overrideOptions
      );

      // ローカルファイルパスを取得（正規化されたパスをローカルシステム用に変換）
      const rootUri = this.getRootUri();
      const localUri = vscode.Uri.joinPath(rootUri, savePath);

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
  public async localFileToConflictAndSaveRemote(
    filePath: string,
    fileHash: string,
    timestamp: Date,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    // コンフリクト用のファイル名を生成（例: conflict-local-YYYYMMDD-HHmmss-ファイル名.ext）
    const conflictFileName = this.buildConflictFilePath("conflict-local", filePath, timestamp);

    // ローカルファイルのURIを取得
    const rootUri = this.getRootUri();
    const localUri = vscode.Uri.joinPath(rootUri, filePath);
    const conflictUri = vscode.Uri.joinPath(rootUri, conflictFileName);

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
      await this.fetchDecryptAndSaveFile(filePath, fileHash, undefined, overrideOptions);
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
  public async saveRemoteFileAsConflict(
    filePath: string,
    fileHash: string,
    timestamp: Date,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    // コンフリクト用のファイル名を生成（例: conflict-remote-YYYYMMDD-HHmmss-ファイル名.ext）
    //const timestamp = new Date()
    const conflictFileName = this.buildConflictFilePath("conflict-remote", filePath, timestamp);
    await this.fetchDecryptAndSaveFile(
      filePath,
      fileHash,
      conflictFileName,
      overrideOptions
    );
    logMessage(`Saved remote file as conflict file: ${conflictFileName} `);
  }

  // 検出された競合をユーザーに通知し、解決します。
  public async resolveConflicts(
    conflicts: UpdateFiles[],
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<boolean> {
    for (const conflict of conflicts) {
      switch (conflict.UpdateType) {
        case "remoteUpdate":
        case "remoteAdd":
          // リモートの更新または追加の場合、リモートファイルを採用
          await this.fetchDecryptAndSaveFile(
            conflict.filePath,
            conflict.remoteHash,
            undefined,
            overrideOptions
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
              overrideOptions
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
            const rootUri = this.getRootUri();
            const localUri = vscode.Uri.joinPath(rootUri, conflict.filePath);
            const deletedUri = vscode.Uri.joinPath(rootUri, deletedFileName);

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
  public detectConflicts(
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
  public async generateInitialIndex(
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
    const emptyIndex: IndexFile = {
      uuid: uuidv7(),
      environmentId: options.environmentId,
      parentUuids: [],
      files: [],
      timestamp: Date.now(),
    };
    return await this.generateLocalIndexFile(emptyIndex, overrideOptions);
  }

  /**
   * 空のインデックスファイルを生成する（既存リポジトリ取り込み用）
   */
  public async generateEmptyIndex(
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
    return {
      uuid: uuidv7(),
      environmentId: options.environmentId,
      parentUuids: [],
      files: [],
      timestamp: Date.now(),
    };
  }

  // ローカルのワークスペースからファイルリスト、ハッシュ値、タイムスタンプを取得し、インデックスファイルを生成します。
  public async generateLocalIndexFile(
    previousIndex: IndexFile,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<IndexFile> {
    const options = this.getEffectiveOptions(overrideOptions);
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
        // ワークスペースフォルダからの相対パスを正規化して取得
        const relativePath = getRelativePath(folder.uri, fileUri);

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
  public async saveWsIndexFile(
    indexFile: IndexFile,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    const wsIndexUri = this.getWsIndexUri();
    const indexContent = Buffer.from(
      JSON.stringify(indexFile, null, 2),
      "utf-8"
    );
    await vscode.workspace.fs.writeFile(wsIndexUri, indexContent);
  }

  // 新しいインデックスファイルをgit:localブランチに保存する関数
  public async saveIndexFile(
    indexFile: IndexFile,
    branchName: string,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    const options = this.getEffectiveOptions(overrideOptions);
    const indexDirUri = this.getIndexDirUri();
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
    const encryptedIndex = this.encryptContent(indexContent, options.encryptionKey);
    const indexFilePath = vscode.Uri.joinPath(indexDirUri, dirName, fileName);
    await vscode.workspace.fs.writeFile(indexFilePath, encryptedIndex);

    // Update the ref for this branch
    await this.saveBranchRef(branchName, indexFile.uuid, options);
  }

  public mergeIndexes(
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
  public async reflectFileChanges(
    oldIndex: IndexFile,
    newIndex: IndexFile,
    forceCheckout: boolean,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    logMessage(
      `reflectFileChanges: Start. forceCheckout:${forceCheckout} oldIndex:${oldIndex.uuid}, newIndex:${newIndex.uuid}`
    );
    const rootUri = this.getRootUri();

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
        await this.fetchDecryptAndSaveFile(
          filePath,
          newFileEntry.hash,
          undefined,
          overrideOptions
        );
      }
      // ファイルが更新された場合（ハッシュ値が異なる場合）のみ復元
      else if (oldFileEntry.hash !== newFileEntry.hash) {
        logMessage(`reflectFileChanges: File updated -> ${filePath} (hash changed)`);
        await this.fetchDecryptAndSaveFile(
          filePath,
          newFileEntry.hash,
          undefined,
          overrideOptions
        );
      }
      /*else {
        // ハッシュ値が同じ場合は復元をスキップ
        logMessage(`reflectFileChanges: File unchanged -> ${filePath} (hash match, skipping restore)`);
      }*/
    }

    // 2) 削除されたファイルの反映
    // oldIndex にはあるが newIndex では削除フラグがあるファイル
    let forceCheckoutDeletions = 0;
    let normalDeletions = 0;
    let missingButNotDeleting = 0;
    let deletedTimestampMismatch = 0;

    for (const [filePath, oldFileEntry] of oldMap.entries()) {
      const newfile = newMap.get(filePath);
      if (forceCheckout) {
        if (!newfile || newfile.deleted) {
          // 強制チェックアウトの場合、newIndexに存在しないファイルは削除
          forceCheckoutDeletions++;
          this.removeFile(filePath);
        }
      } else {
        if (
          newfile &&
          newfile.deleted &&
          newfile.timestamp === oldFileEntry.timestamp // 削除フラグが立っているがタイムスタンプが同じ場合
        ) {
          normalDeletions++;
          this.removeFile(filePath);
        } else if (!newfile) {
          missingButNotDeleting++;
        } else if (newfile.deleted) {
          deletedTimestampMismatch++;
        }
      }
    }

    // 削除統計をログ出力
    if (forceCheckoutDeletions > 0) {
      logMessage(`reflectFileChanges: Force checkout deletions: ${forceCheckoutDeletions} files`);
    }
    if (normalDeletions > 0) {
      logMessage(`reflectFileChanges: Normal deletions: ${normalDeletions} files`);
    }
    if (missingButNotDeleting > 0) {
      logMessage(`reflectFileChanges: Files missing in newIndex but not deleting: ${missingButNotDeleting} files`);
    }
    if (deletedTimestampMismatch > 0) {
      logMessage(`reflectFileChanges: Files marked as deleted but timestamp mismatch: ${deletedTimestampMismatch} files`);
    }
  }
  private async removeFile(filePath: string): Promise<void> {
    // ignorePathに含まれるファイルは削除しない
    if (isIgnoredPath(filePath)) {
      logMessage(`reflectFileChanges: Skipped removing ignored file -> ${filePath}`);
      return;
    }

    // ローカルワークスペースから削除
    const rootUri = this.getRootUri();
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
      // 個別の削除ログは削除（統計で表示するため）
    } catch (error: any) {
      // エラーの場合のみログ出力
      logMessage(`warning: deleting file: ${filePath}. ${error.message}`);
    }
  }
  // 旧APIの静的アクセサは撤去（不要）

  // Save the indexFile.uuid as the "latest" for the given branch
  public async saveBranchRef(
    branchName: string,
    indexFileUuid: string,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<void> {
    const options = this.getEffectiveOptions(overrideOptions);
    const remoteRefsDirUri = this.getRemoteRefsDirUri();
    const refUri = vscode.Uri.joinPath(remoteRefsDirUri, branchName);
    const encryptedUuid = this.encryptContent(
      Buffer.from(indexFileUuid),
      options.encryptionKey
    );
    await vscode.workspace.fs.writeFile(refUri, encryptedUuid);
  }

  // Read the "latest" indexFile.uuid in the given branch
  public async readBranchRef(
    branchName: string,
    overrideOptions?: Partial<LocalObjectManagerOptions>
  ): Promise<string | undefined> {
    const options = this.getEffectiveOptions(overrideOptions);
    const remoteRefsDirUri = this.getRemoteRefsDirUri();
    const refUri = vscode.Uri.joinPath(remoteRefsDirUri, branchName);
    try {
      const data = await vscode.workspace.fs.readFile(refUri);
      const decrypted = this.decryptContent(Buffer.from(data), options.encryptionKey);
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
  const rootUri = vscode.workspace.workspaceFolders?.[0].uri;
  if (!rootUri) {
    throw new Error("No workspace found to set branch name");
    }
  const headUri = vscode.Uri.joinPath(rootUri, ".secureNotes", HEAD_FILE_NAME);
  await vscode.workspace.fs.writeFile(headUri, Buffer.from(branchName, "utf8"));
}
