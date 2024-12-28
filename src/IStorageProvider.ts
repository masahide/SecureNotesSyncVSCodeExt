//=====================================================
// 1. ストレージプロバイダ用インターフェース
//=====================================================
export interface IStorageProvider {
    /**
     * すでに暗号化されているファイルをアップロードする
     * @param encryptedFilePaths ローカルにある暗号化ファイル群（例: .enc）
     */
    uploadFiles(encryptedFilePaths: string[]): Promise<void>;

    /**
     * クラウドにある暗号化ファイルをすべてダウンロードする
     * @returns ダウンロードした暗号化ファイルパス一覧
     */
    downloadFiles(): Promise<string[]>;
}