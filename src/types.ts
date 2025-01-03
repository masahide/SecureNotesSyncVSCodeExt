// ファイル情報を保持するインターフェース
export interface FileEntry {
    path: string; // ファイルの相対パス
    hash: string; // ファイルのSHA-256ハッシュ値（暗号化前のデータに対して計算）
    timestamp: number; // ファイルの最終更新タイムスタンプ
}

// インデックスファイルの構造
export interface IndexFile {
    uuid: string; // インデックスファイルのUUID（Version 7）
    environmentId: string; // 追加
    parentUuid: string; // 親インデックスファイルのUUID
    files: FileEntry[]; // ファイル情報のリスト
    timestamp: number; // インデックスファイルの作成タイムスタンプ
}

// 競合情報を保持するインターフェース
export interface Conflict {
    filePath: string; // 競合しているファイルのパス
    localHash: string; // ローカルファイルのハッシュ値
    remoteHash: string; // リモートファイルのハッシュ値
    localTimestamp: number; // ローカルファイルのタイムスタンプ
    remoteTimestamp: number; // リモートファイルのタイムスタンプ
}
export type LocalObjectManagerOptions = {
    environmentId: string;
    encryptionKey: string;
};