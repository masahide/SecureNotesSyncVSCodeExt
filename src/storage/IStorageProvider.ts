// src/storage/IStorageProvider.ts
export interface IStorageProvider {
  /**
   * Checks if the repository is initialized.
   */
  isInitialized(): Promise<boolean>;

  /**
   * Initializes the repository.
   */
  initialize(): Promise<void>;

  /**
   * 指定ブランチのリモート状態を取得し、ローカルへ反映する。
   */
  download(branchName: string): Promise<boolean>;

  /**
   * ローカルの変更をリモートへ公開する。
   */
  upload(branchName: string): Promise<boolean>;

  /**
   * リモートストレージにデータが存在するかチェック
   * @returns データが存在する場合はtrue
   */
  hasRemoteData(): Promise<boolean>;

  /**
   * 既存のリモートストレージをクローンする
   * @returns クローンが成功した場合はtrue
   */
  cloneRemoteStorage(): Promise<boolean>;

  /**
   * 既存のローカルリポジトリをリモートの変更で更新（pull）
   * @returns 更新があった場合はtrue
   */
  pullRemoteChanges(branchName?: string): Promise<boolean>;

  // 暗号/復号は SyncService + LocalObjectManager 側に集約
}
