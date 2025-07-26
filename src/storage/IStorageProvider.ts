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
}
