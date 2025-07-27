import * as vscode from "vscode";
import { logMessage, showInfo, showError } from "./logger";
import { LocalObjectManager, getCurrentBranchName } from "./storage/LocalObjectManager";
import { GitHubSyncProvider } from "./storage/GithubProvider";
import { IStorageProvider } from "./storage/IStorageProvider";
import { IndexFile } from "./types";
import { ISyncService, SyncOptions } from "./interfaces/ISyncService";

export interface SyncDependencies {
  localObjectManager: typeof LocalObjectManager;
  storageProvider: IStorageProvider;
  branchProvider?: any; // BranchTreeViewProvider
}

export class SyncService implements ISyncService {
  private dependencies: SyncDependencies;

  constructor(dependencies: SyncDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * リポジトリが初期化済みかを確認
   * @returns 初期化済みの場合はtrue
   */
  async isRepositoryInitialized(): Promise<boolean> {
    return await this.dependencies.storageProvider.isInitialized();
  }


  /**
   * 新規リモートリポジトリを作成して初期化する
   * @param options 同期オプション
   * @returns 初期化が成功した場合はtrue
   */
  async initializeNewRepository(options: SyncOptions): Promise<boolean> {
    try {
      logMessage('=== Starting new repository initialization ===');

      // リモートリポジトリが既に存在するかチェック
      if (await this.isRepositoryInitialized()) {
        const hasRemoteData = await (this.dependencies.storageProvider as GitHubSyncProvider).hasRemoteData();
        if (hasRemoteData) {
          showError("リモートリポジトリに既にデータが存在します。既存リポジトリを取り込む場合は 'Import Existing Repository' を使用してください。");
          return false;
        }
      }

      // 新規リポジトリとして初期化
      await this.dependencies.storageProvider.initialize();

      // ローカルファイルを暗号化してアップロード
      const currentBranch = await getCurrentBranchName() || 'main';
      const initialIndex = await this.dependencies.localObjectManager.generateInitialIndex(options);
      await this.dependencies.localObjectManager.saveIndexFile(initialIndex, currentBranch, options.encryptionKey);
      await this.dependencies.localObjectManager.saveWsIndexFile(initialIndex, options);
      await this.dependencies.storageProvider.upload(currentBranch);

      showInfo("新規リポジトリが正常に作成され、初期化されました。");
      return true;
    } catch (error: any) {
      showError(`New repository initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 既存のリモートリポジトリを取り込んで初期化する
   * @param options 同期オプション
   * @returns 初期化が成功した場合はtrue
   */
  async importExistingRepository(options: SyncOptions): Promise<boolean> {
    try {
      logMessage('=== Starting existing repository import ===');

      // リモートデータの存在確認
      const hasRemoteData = await (this.dependencies.storageProvider as GitHubSyncProvider).hasRemoteData();
      if (!hasRemoteData) {
        showError("リモートリポジトリにデータが存在しません。新規リポジトリを作成する場合は 'Initialize New Repository' を使用してください。");
        return false;
      }

      // 既存リモートリポジトリをクローン/更新
      await (this.dependencies.storageProvider as GitHubSyncProvider).cloneExistingRemoteRepository();

      // リモートデータを復号化・展開
      await (this.dependencies.storageProvider as GitHubSyncProvider).loadAndDecryptRemoteData();

      // リモートの最新インデックスを取得してローカルに設定
      const remoteIndex = await this.dependencies.localObjectManager.loadRemoteIndex(options);
      await this.dependencies.localObjectManager.saveWsIndexFile(remoteIndex, options);

      // ファイルをワークスペースに展開
      const emptyIndex = await this.dependencies.localObjectManager.generateEmptyIndex(options);
      await this.dependencies.localObjectManager.reflectFileChanges(emptyIndex, remoteIndex, options, true);

      // ブランチプロバイダーを更新
      if (this.dependencies.branchProvider) {
        this.dependencies.branchProvider.refresh();
      }

      showInfo("既存リポジトリが正常に取り込まれました。");
      return true;
    } catch (error: any) {
      showError(`Existing repository import failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 既存リポジトリとの増分同期処理
   * @param options 同期オプション
   * @returns 同期が実行されたかどうか
   */
  async performIncrementalSync(options: SyncOptions): Promise<boolean> {
    try {
      logMessage('=== 増分同期処理フローを開始 ===');

      const currentBranch = await getCurrentBranchName();

      // 1. 既存リモートリポジトリをクローン/更新
      const hasRemoteChanges = await (this.dependencies.storageProvider as GitHubSyncProvider).cloneExistingRemoteRepository();
      logMessage(`Remote repository changes detected: ${hasRemoteChanges}`);

      // 2. リモートデータを復号化・展開（リモートに変更がある場合のみ）
      if (hasRemoteChanges) {
        logMessage("Remote changes detected. Loading and decrypting remote data...");
        await (this.dependencies.storageProvider as GitHubSyncProvider).loadAndDecryptRemoteData();
      } else {
        logMessage("No remote changes detected. Skipping decryption process.");
      }

      // 3. 従来の増分同期処理を実行（リモートダウンロードはスキップ、ただしリモート変更情報を渡す）
      const syncResult = await this.performTraditionalIncrementalSync(options, currentBranch, true, hasRemoteChanges);

      showInfo("既存リポジトリからデータを復元し、増分同期を完了しました。");
      return syncResult;

    } catch (error: any) {
      showError(`Sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 従来の増分同期処理（既存リポジトリの場合に使用）
   * @param options 同期オプション
   * @param currentBranch 現在のブランチ名
   * @param skipRemoteDownload リモートダウンロードをスキップするかどうか
   * @param hasActualRemoteChanges 実際にリモートに変更があるかどうか
   */
  private async performTraditionalIncrementalSync(options: SyncOptions, currentBranch: string, skipRemoteDownload: boolean = false, hasActualRemoteChanges: boolean = false): Promise<boolean> {
    // 1. 前回のインデックスを読み込み
    const previousIndex = await this.loadPreviousIndex(options);
    logMessage(`Loaded previous index file: ${previousIndex.uuid}`);

    // 2. 新しいローカルインデックスを生成
    const newLocalIndex = await this.generateNewLocalIndex(previousIndex, options);
    
    // 2.1. 実際にファイルに変更があるかチェック
    const hasLocalChanges = this.hasFileChanges(previousIndex, newLocalIndex);
    if (!hasLocalChanges) {
      logMessage("No local file changes detected. Using previous index.");
    } else {
      logMessage("Local file changes detected. New local index file created.");
    }

    // 3. リモートからダウンロードして更新があるかチェック
    const hasRemoteUpdates = skipRemoteDownload ? hasActualRemoteChanges : await this.dependencies.storageProvider.download(currentBranch);
    logMessage(`Remote updates detected: ${hasRemoteUpdates}, Skip remote download: ${skipRemoteDownload}, Actual remote changes: ${hasActualRemoteChanges}`);

    let finalIndex = hasLocalChanges ? newLocalIndex : previousIndex;
    let updated = hasRemoteUpdates || hasLocalChanges;
    logMessage(`Final update decision: hasLocalChanges=${hasLocalChanges}, hasRemoteUpdates=${hasRemoteUpdates}, updated=${updated}`);

    // 4. リモート更新がある場合は競合検出・解決
    if (hasRemoteUpdates) {
      logMessage("Processing remote updates...");
      const mergeResult = await this.handleRemoteUpdates(previousIndex, newLocalIndex, options);
      if (!mergeResult.success) {
        showInfo("Sync aborted due to unresolved conflicts.");
        return true;
      }
      finalIndex = mergeResult.mergedIndex;
      updated = true;
      logMessage(`After remote merge: finalIndex UUID=${finalIndex.uuid}, updated=${updated}`);
    }

    // 5. ファイルを暗号化保存
    const filesUpdated = await this.saveEncryptedFiles(finalIndex, previousIndex, options);
    logMessage(`Files encryption result: filesUpdated=${filesUpdated}`);
    updated = updated || filesUpdated;
    logMessage(`Updated after file encryption: ${updated}`);

    // 6. 更新があった場合のみアップロード
    if (updated) {
      logMessage(`Proceeding with finalization: finalIndex UUID=${finalIndex.uuid}`);
      await this.finalizeSync(finalIndex, currentBranch, options);
      return true;
    }

    logMessage("No updates detected. Skipping upload.");
    return false;
  }

  /**
   * MockContextを作成するヘルパーメソッド
   */
  private async createMockContext(encryptionKey: string): Promise<any> {
    return {
      secrets: {
        get: async (key: string) => encryptionKey,
        store: async (key: string, value: string) => { },
        delete: async (key: string) => { }
      },
      workspaceState: {
        get: (key: string) => undefined,
        update: async (key: string, value: any) => { }
      }
    };
  }

  /**
   * 前回のインデックスファイルを読み込み
   */
  private async loadPreviousIndex(options: SyncOptions): Promise<IndexFile> {
    return await this.dependencies.localObjectManager.loadWsIndex(options);
  }

  /**
   * 新しいローカルインデックスを生成
   */
  private async generateNewLocalIndex(previousIndex: IndexFile, options: SyncOptions): Promise<IndexFile> {
    return await this.dependencies.localObjectManager.generateLocalIndexFile(previousIndex, options);
  }

  /**
   * 前回のインデックスと新しいインデックスを比較してファイルに変更があるかチェック
   */
  private hasFileChanges(previousIndex: IndexFile, newIndex: IndexFile): boolean {
    // ファイル数が異なる場合は変更あり
    if (previousIndex.files.length !== newIndex.files.length) {
      return true;
    }

    // 各ファイルのハッシュ値を比較
    const previousFileMap = new Map<string, string>();
    for (const file of previousIndex.files) {
      previousFileMap.set(file.path, file.hash);
    }

    for (const file of newIndex.files) {
      const previousHash = previousFileMap.get(file.path);
      if (!previousHash || previousHash !== file.hash) {
        return true; // ファイルが新規追加されたか、ハッシュ値が変更された
      }
    }

    return false; // 変更なし
  }


  /**
   * リモート更新がある場合の競合検出・解決処理
   */
  private async handleRemoteUpdates(
    previousIndex: IndexFile,
    newLocalIndex: IndexFile,
    options: SyncOptions
  ): Promise<{ success: boolean; mergedIndex: IndexFile }> {
    // リモートインデックスを読み込み
    const remoteIndex = await this.dependencies.localObjectManager.loadRemoteIndex(options);
    logMessage(`Remote index loaded: UUID=${remoteIndex.uuid}, files=${remoteIndex.files.length}`);

    // 競合を検出
    const conflicts = await this.dependencies.localObjectManager.detectConflicts(
      previousIndex,
      newLocalIndex,
      remoteIndex
    );
    logMessage(`Conflicts detected: ${conflicts.length} conflicts`);

    // 競合がある場合は解決
    if (conflicts.length > 0) {
      logMessage(`Resolving ${conflicts.length} conflicts...`);
      const conflictsResolved = await this.dependencies.localObjectManager.resolveConflicts(
        conflicts,
        options
      );
      if (!conflictsResolved) {
        logMessage("Conflict resolution failed");
        return { success: false, mergedIndex: newLocalIndex };
      }
      logMessage("Conflicts resolved successfully");
    }

    // 競合がない場合は、リモートインデックスをそのまま使用
    if (conflicts.length === 0) {
      logMessage("No conflicts detected. Using remote index as-is.");
      return { success: true, mergedIndex: remoteIndex };
    }

    // ローカルとリモートの変更をマージ（競合解決後）
    logMessage("Merging local and remote changes after conflict resolution...");
    const mergedIndex = await this.dependencies.localObjectManager.generateLocalIndexFile(
      previousIndex,
      options
    );
    logMessage(`Merged index created: UUID=${mergedIndex.uuid}, files=${mergedIndex.files.length}`);

    return { success: true, mergedIndex };
  }

  /**
   * ファイルを暗号化して保存
   */
  private async saveEncryptedFiles(
    indexFile: IndexFile,
    previousIndex: IndexFile,
    options: SyncOptions
  ): Promise<boolean> {
    return await this.dependencies.localObjectManager.saveEncryptedObjects(
      indexFile.files,
      previousIndex,
      options
    );
  }

  /**
   * 同期の最終処理（インデックス保存、ファイル反映、アップロード）
   */
  private async finalizeSync(
    finalIndex: IndexFile,
    currentBranch: string,
    options: SyncOptions
  ): Promise<void> {
    // ワークスペースインデックス更新前の状態を保存
    const previousIndex = await this.dependencies.localObjectManager.loadWsIndex(options);

    // インデックスファイルを保存
    await this.dependencies.localObjectManager.saveIndexFile(
      finalIndex,
      currentBranch,
      options.encryptionKey
    );

    // ワークスペースインデックスを保存
    await this.dependencies.localObjectManager.saveWsIndexFile(finalIndex, options);

    // ファイル変更を反映（更新前のインデックスと比較）
    logMessage(`finalizeSync: Reflecting file changes - previousIndex: ${previousIndex.uuid} (${previousIndex.files.length} files), finalIndex: ${finalIndex.uuid} (${finalIndex.files.length} files), forceCheckout: false`);
    await this.dependencies.localObjectManager.reflectFileChanges(
      previousIndex,
      finalIndex,
      options,
      false
    );

    // ブランチプロバイダーを更新
    if (this.dependencies.branchProvider) {
      this.dependencies.branchProvider.refresh();
    }

    // ストレージにアップロード
    await this.dependencies.storageProvider.upload(currentBranch);
    showInfo("Merge completed successfully.");
  }
}

