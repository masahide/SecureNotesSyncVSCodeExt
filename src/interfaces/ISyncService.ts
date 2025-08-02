// src/interfaces/ISyncService.ts

export interface SyncOptions {
  environmentId: string;
  encryptionKey: string;
}

/**
 * 同期サービスの統一インターフェース
 * すべての同期操作の抽象化を提供
 */
export interface ISyncService {
  /**
   * リポジトリが初期化済みかを確認
   * @returns 初期化済みの場合はtrue
   */
  isRepositoryInitialized(): Promise<boolean>;

  

  /**
   * 新規リモートストレージを作成して初期化する
   * @param options 同期オプション
   * @returns 初期化が成功した場合はtrue
   */
  initializeNewStorage(options: SyncOptions): Promise<boolean>;

  /**
   * 既存のリモートストレージを取り込んで初期化する
   * @param options 同期オプション
   * @returns 初期化が成功した場合はtrue
   */
  importExistingStorage(options: SyncOptions): Promise<boolean>;

  /**
   * 既存リポジトリとの増分同期処理
   * @param options 同期オプション
   * @returns 同期が実行された場合はtrue
   */
  performIncrementalSync(options: SyncOptions): Promise<boolean>;
}