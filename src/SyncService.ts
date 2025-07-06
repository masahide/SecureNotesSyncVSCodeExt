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
   * 再設計された同期処理のメインロジック
   * Phase 1: リモートリポジトリ存在確認 → 分岐処理
   * @param options 同期オプション
   * @returns 同期が実行されたかどうか
   */
  async performIncrementalSync(options: SyncOptions): Promise<boolean> {
    try {
      logMessage('=== 再設計された同期処理フローを開始 ===');
      
      // Phase 1: リモートリポジトリの存在確認
      const remoteExists = await this.dependencies.gitHubSyncProvider.checkRemoteRepositoryExists();
      logMessage(`リモートリポジトリ存在確認結果: ${remoteExists}`);

      // 現在のブランチ名を取得
      const currentBranch = await getCurrentBranchName();

      if (!remoteExists) {
        // Phase 2A: 新規リモートリポジトリの場合
        logMessage('=== Phase 2A: 新規リモートリポジトリ初期化 ===');
        
        // 1. ワークスペースファイルを暗号化・保存
        const mockContext = await this.createMockContext(options.encryptionKey);
        const localObjectManager = new this.dependencies.localObjectManager(
          vscode.workspace.workspaceFolders![0].uri.fsPath,
          mockContext
        );
        const indexFile = await localObjectManager.encryptAndSaveWorkspaceFiles();
        logMessage(`ワークスペースファイルを暗号化・保存: ${indexFile.files.length}ファイル`);

        // 2. 新規リモートリポジトリを初期化
        await this.dependencies.gitHubSyncProvider.initializeNewRemoteRepository();
        
        // 3. リモートにアップロード
        await this.dependencies.gitHubSyncProvider.upload(currentBranch);
        
        showInfo("新規リポジトリとして初期化し、ワークスペースファイルをアップロードしました。");
        return false; // 新規作成なので更新はなし
        
      } else {
        // Phase 2B: 既存リモートリポジトリの場合
        logMessage('=== Phase 2B: 既存リモートリポジトリ処理 ===');
        
        // 1. 既存リモートリポジトリをクローン
        await this.dependencies.gitHubSyncProvider.cloneExistingRemoteRepository();
        
        // 2. リモートデータを復号化・展開
        await this.dependencies.gitHubSyncProvider.loadAndDecryptRemoteData();
        
        // 3. 従来の増分同期処理を実行
        const syncResult = await this.performTraditionalIncrementalSync(options, currentBranch);
        
        showInfo("既存リポジトリからデータを復元し、増分同期を完了しました。");
        return syncResult;
      }
      
    } catch (error: any) {
      showError(`Sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 従来の増分同期処理（既存リポジトリの場合に使用）
   */
  private async performTraditionalIncrementalSync(options: SyncOptions, currentBranch: string): Promise<boolean> {
    // 1. 前回のインデックスを読み込み
    const previousIndex = await this.loadPreviousIndex(options);
    logMessage(`Loaded previous index file: ${previousIndex.uuid}`);

    // 2. 新しいローカルインデックスを生成
    const newLocalIndex = await this.generateNewLocalIndex(previousIndex, options);
    logMessage("New local index file created.");

    // 3. リモートからダウンロードして更新があるかチェック
    const hasRemoteUpdates = await this.downloadRemoteUpdates(currentBranch);

    let finalIndex = newLocalIndex;
    let updated = hasRemoteUpdates;

    // 4. リモート更新がある場合は競合検出・解決
    if (hasRemoteUpdates) {
      const mergeResult = await this.handleRemoteUpdates(previousIndex, newLocalIndex, options);
      if (!mergeResult.success) {
        showInfo("Sync aborted due to unresolved conflicts.");
        return true;
      }
      finalIndex = mergeResult.mergedIndex;
      updated = true;
    }

    // 5. ファイルを暗号化保存
    const filesUpdated = await this.saveEncryptedFiles(finalIndex, previousIndex, options);
    updated = updated || filesUpdated;

    // 6. 更新があった場合のみアップロード
    if (updated) {
      await this.finalizeSync(finalIndex, currentBranch, options);
      return true;
    }

    return false;
  }

  /**
   * MockContextを作成するヘルパーメソッド
   */
  private async createMockContext(encryptionKey: string): Promise<any> {
    return {
      secrets: {
        get: async (key: string) => encryptionKey,
        store: async (key: string, value: string) => {},
        delete: async (key: string) => {}
      },
      workspaceState: {
        get: (key: string) => undefined,
        update: async (key: string, value: any) => {}
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