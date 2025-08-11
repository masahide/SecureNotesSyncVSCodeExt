import * as vscode from "vscode";
import { logMessage, showInfo, showError } from "./logger";
import { LocalObjectManager, getCurrentBranchName } from "./storage/LocalObjectManager";
import { IStorageProvider } from "./storage/IStorageProvider";
import { IndexFile } from "./types";
import { ISyncService, SyncOptions } from "./interfaces/ISyncService";
import { IBranchTreeViewProvider } from "./interfaces/IBranchTreeViewProvider";
import { ServiceLocator } from "./container/ServiceLocator";
import { ServiceKeys } from "./container/ServiceKeys";

export interface SyncDependencies {
  localObjectManager: LocalObjectManager;
  storageProvider: IStorageProvider;
  branchProvider?: IBranchTreeViewProvider;
}

export class SyncService implements ISyncService {
  private dependencies: SyncDependencies;
  private localObjectManager: LocalObjectManager;
  private syncOptions: SyncOptions;

  constructor(dependencies: SyncDependencies, context: vscode.ExtensionContext, syncOptions: SyncOptions) {
    this.dependencies = dependencies;
    this.syncOptions = syncOptions;
    // DI コンテナ or 依存注入を必須化（フォールバック new は撤去）
    if (ServiceLocator.isInitialized() && ServiceLocator.isRegistered(ServiceKeys.LOCAL_OBJECT_MANAGER)) {
      this.localObjectManager = ServiceLocator.getLocalObjectManager();
    } else if (dependencies.localObjectManager) {
      this.localObjectManager = dependencies.localObjectManager;
    } else {
      throw new Error('LocalObjectManager not available. Ensure it is registered in the container.');
    }
  }

  /**
   * リポジトリが初期化済みかを確認
   * @returns 初期化済みの場合はtrue
   */
  async isRepositoryInitialized(): Promise<boolean> {
    return await this.dependencies.storageProvider.isInitialized();
  }


  /**
   * 新規リモートストレージを作成して初期化する
   * @returns 初期化が成功した場合はtrue
   */
  async initializeNewStorage(): Promise<boolean> {
    try {
      logMessage('=== Starting new repository initialization ===');

      // 新規リポジトリとして初期化
      await this.dependencies.storageProvider.initialize();

      // ローカルファイルを暗号化してアップロード
      const currentBranch = await getCurrentBranchName() || 'main';
      const initialIndex = await this.localObjectManager.generateInitialIndex(this.syncOptions);
      await this.localObjectManager.saveIndexFile(initialIndex, currentBranch, this.syncOptions);
      await this.localObjectManager.saveWsIndexFile(initialIndex, this.syncOptions);
      await this.dependencies.storageProvider.upload(currentBranch);

      showInfo("新規リポジトリが正常に作成され、初期化されました。");
      return true;
    } catch (error: any) {
      showError(`New repository initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 既存のリモートストレージを取り込んで初期化する
   * @returns 初期化が成功した場合はtrue
   */
  async importExistingStorage(): Promise<boolean> {
    try {
      logMessage('=== Starting existing repository import ===');

      // 既存リモートストレージをクローン
      await this.dependencies.storageProvider.cloneRemoteStorage();

      // リモートの最新インデックスを取得してローカルに設定
      const remoteIndex = await this.localObjectManager.loadRemoteIndex(this.syncOptions);
      await this.localObjectManager.saveWsIndexFile(remoteIndex, this.syncOptions);

      // ファイルをワークスペースに展開
      const emptyIndex = await this.localObjectManager.generateEmptyIndex(this.syncOptions);
      await this.localObjectManager.reflectFileChanges(emptyIndex, remoteIndex, true, this.syncOptions);

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
   * @returns 同期が実行されたかどうか
   */
  async performIncrementalSync(): Promise<boolean> {
    try {
      logMessage('=== 増分同期処理フローを開始 ===');

      const currentBranch = await getCurrentBranchName();

      // 1. 既存リモートストレージをpull/更新
      const hasRemoteChanges = await this.dependencies.storageProvider.pullRemoteChanges();
      logMessage(`Remote storage changes detected: ${hasRemoteChanges}`);

      // 3. 増分同期処理を実行（リモートダウンロードはスキップ、ただしリモート変更情報を渡す）
      const syncResult = await this.performTraditionalIncrementalSync(this.syncOptions, currentBranch, true, hasRemoteChanges);

      showInfo("既存ストレージからデータを復元し、増分同期を完了しました。");
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
    const previousIndex = await this.localObjectManager.loadWsIndex(options);
    logMessage(`Loaded previous index file: ${previousIndex.uuid}`);

    // 2. 新しいローカルインデックスを生成
    const newLocalIndex = await this.localObjectManager.generateLocalIndexFile(previousIndex, options);

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
    const filesUpdated = await this.localObjectManager.saveEncryptedObjects(finalIndex.files, previousIndex, options);
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
    const remoteIndex = await this.localObjectManager.loadRemoteIndex(options);
    logMessage(`Remote index loaded: UUID=${remoteIndex.uuid}, files=${remoteIndex.files.length}`);

    // 競合を検出
    const conflicts = await this.localObjectManager.detectConflicts(
      previousIndex,
      newLocalIndex,
      remoteIndex
    );
    logMessage(`Conflicts detected: ${conflicts.length} conflicts`);

    // 競合がある場合は解決
    if (conflicts.length > 0) {
      logMessage(`Resolving ${conflicts.length} conflicts...`);
      const conflictsResolved = await this.localObjectManager.resolveConflicts(
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
    const mergedIndex = await this.localObjectManager.generateLocalIndexFile(
      previousIndex,
      options
    );
    logMessage(`Merged index created: UUID=${mergedIndex.uuid}, files=${mergedIndex.files.length}`);

    return { success: true, mergedIndex };
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
    const previousIndex = await this.localObjectManager.loadWsIndex(options);
    logMessage(`finalizeSync: Before update - previousIndex: ${previousIndex.uuid} (${previousIndex.files.length} files), finalIndex: ${finalIndex.uuid} (${finalIndex.files.length} files)`);

    // インデックスファイルを保存
    await this.localObjectManager.saveIndexFile(
      finalIndex,
      currentBranch
    );

    // ワークスペースインデックスを保存
    await this.localObjectManager.saveWsIndexFile(finalIndex, options);
    logMessage(`finalizeSync: After saveWsIndexFile - finalIndex: ${finalIndex.uuid}`);

    // ファイル変更を反映（更新前のインデックスと比較）
    logMessage(`finalizeSync: Reflecting file changes - previousIndex: ${previousIndex.uuid} (${previousIndex.files.length} files), finalIndex: ${finalIndex.uuid} (${finalIndex.files.length} files), forceCheckout: false`);
    await this.localObjectManager.reflectFileChanges(
      previousIndex,
      finalIndex,
      false,
      options
    );

    // ブランチプロバイダーを更新
    if (this.dependencies.branchProvider) {
      this.dependencies.branchProvider.refresh();
    }

    // ストレージにアップロード
    await this.dependencies.storageProvider.upload(currentBranch);
    showInfo("Merge completed successfully.");
  }

  /**
   * 同期オプションを更新する
   * @param options 新しい同期オプション
   */
  updateSyncOptions(context: vscode.ExtensionContext, options: SyncOptions): void {
    this.syncOptions = options;
    // LocalObjectManager は stateless のため再生成は不要だが、環境切替に備えて再解決も許容
    if (ServiceLocator.isInitialized() && ServiceLocator.isRegistered(ServiceKeys.LOCAL_OBJECT_MANAGER)) {
      this.localObjectManager = ServiceLocator.getLocalObjectManager();
    }
  }

  /**
   * 現在の同期オプションを取得する
   * @returns 現在の同期オプション
   */
  getSyncOptions(): SyncOptions {
    return { ...this.syncOptions };
  }
}
