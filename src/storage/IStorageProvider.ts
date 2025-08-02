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
     * 既存のリモートストレージをクローン/更新
     * @returns 変更があった場合はtrue
     */
    cloneExistingRemoteStorage(): Promise<boolean>;

    /**
     * リモートデータを復号化・展開
     */
    loadAndDecryptRemoteData(): Promise<void>;
}
