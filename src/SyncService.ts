import * as vscode from "vscode";
import { logMessage, showInfo, showError } from "./logger";
import { LocalObjectManager, getCurrentBranchName } from "./storage/LocalObjectManager";
import { GitHubSyncProvider } from "./storage/GithubProvider";
import { IndexFile } from "./types";

export interface SyncOptions {
  environmentId: string;
  encryptionKey: string;
}

export interface SyncDependencies {
  localObjectManager: typeof LocalObjectManager;
  gitHubSyncProvider: GitHubSyncProvider;
  branchProvider?: any; // BranchTreeViewProvider
}

export class SyncService {
  private dependencies: SyncDependencies;

  constructor(dependencies: SyncDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * 増分同期処理のメインロジック
   * @param options 同期オプション
   * @returns 同期が実行されたかどうか
   */
  async performIncrementalSync(options: SyncOptions): Promise<boolean> {
    try {
      // 1. 前回のインデックスを読み込み
      const previousIndex = await this.loadPreviousIndex(options);
      logMessage(`Loaded previous index file: ${previousIndex.uuid}`);

      // 2. 新しいローカルインデックスを生成
      const newLocalIndex = await this.generateNewLocalIndex(previousIndex, options);
      showInfo("New local index file created.");

      // 3. 現在のブランチ名を取得
      const currentBranch = await getCurrentBranchName();

      // 4. リモートからダウンロードして更新があるかチェック
      const hasRemoteUpdates = await this.downloadRemoteUpdates(currentBranch);

      let finalIndex = newLocalIndex;
      let updated = hasRemoteUpdates;

      // 5. リモート更新がある場合は競合検出・解決
      if (hasRemoteUpdates) {
        const mergeResult = await this.handleRemoteUpdates(previousIndex, newLocalIndex, options);
        if (!mergeResult.success) {
          showInfo("Sync aborted due to unresolved conflicts.");
          return true;
        }
        finalIndex = mergeResult.mergedIndex;
        updated = true;
      }

      // 6. ファイルを暗号化保存
      const filesUpdated = await this.saveEncryptedFiles(finalIndex, previousIndex, options);
      updated = updated || filesUpdated;

      // 7. 更新があった場合のみアップロード
      if (updated) {
        await this.finalizeSync(finalIndex, currentBranch, options);
        return true;
      }

      return false;
    } catch (error: any) {
      showError(`Sync failed: ${error.message}`);
      throw error;
    }
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
   * リモートから更新をダウンロード
   */
  private async downloadRemoteUpdates(currentBranch: string): Promise<boolean> {
    return await this.dependencies.gitHubSyncProvider.download(currentBranch);
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

    // 競合を検出
    const conflicts = await this.dependencies.localObjectManager.detectConflicts(
      previousIndex,
      newLocalIndex,
      remoteIndex
    );

    // 競合がある場合は解決
    if (conflicts.length > 0) {
      const conflictsResolved = await this.dependencies.localObjectManager.resolveConflicts(
        conflicts,
        options
      );
      if (!conflictsResolved) {
        return { success: false, mergedIndex: newLocalIndex };
      }
    }

    // ローカルとリモートの変更をマージ
    logMessage("Merging local and remote changes...");
    const mergedIndex = await this.dependencies.localObjectManager.generateLocalIndexFile(
      previousIndex,
      options
    );

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
    // インデックスファイルを保存
    await this.dependencies.localObjectManager.saveIndexFile(
      finalIndex,
      currentBranch,
      options.encryptionKey
    );

    // ワークスペースインデックスを保存
    await this.dependencies.localObjectManager.saveWsIndexFile(finalIndex, options);

    // ファイル変更を反映
    const previousIndex = await this.dependencies.localObjectManager.loadWsIndex(options);
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

    // GitHubにアップロード
    await this.dependencies.gitHubSyncProvider.upload(currentBranch);
    showInfo("Merge completed successfully.");
  }
}

/**
 * SyncServiceのファクトリー関数
 */
export function createSyncService(gitRemoteUrl: string, branchProvider?: any): SyncService {
  const dependencies: SyncDependencies = {
    localObjectManager: LocalObjectManager,
    gitHubSyncProvider: new GitHubSyncProvider(gitRemoteUrl),
    branchProvider
  };

  return new SyncService(dependencies);
}