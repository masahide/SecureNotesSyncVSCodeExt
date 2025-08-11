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
     * rsync 的な双方向のファイル同期を行う
     *  - ローカルの .enc ファイルをクラウドへ
     *  - クラウドにしかない .enc ファイルをローカルへ
     */
    download(branchName: string): Promise<boolean>;
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
    pullRemoteChanges(): Promise<boolean>;

    // 暗号/復号は SyncService + LocalObjectManager 側に集約
}
