// src/IStorageProvider.ts
export interface IStorageProvider {
    /**
     * rsync 的な双方向のファイル同期を行う
     *  - ローカルの .enc ファイルをクラウドへ
     *  - クラウドにしかない .enc ファイルをローカルへ
     */
    sync(): Promise<void>;
}
