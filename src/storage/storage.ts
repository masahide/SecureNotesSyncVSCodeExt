import * as vscode from "vscode";
import { Config } from "../dotdir/config";

// インデックスファイルの構造
export interface IndexFile {
  uuid: string; // インデックスの一意な識別子
  parentUuid: string; // 親インデックスのUUID
  nextUuid: string; // 次のインデックスのUUID
  files: FileEntry[]; // ファイルとそのハッシュのリスト
  timestamp: number; // インデックスが作成されたタイムスタンプ
}

export interface FileEntry {
  path: string; // ファイルのパス
  hash: string; // ファイル内容のハッシュ値（SHA-256）
  timestamp: number; // ファイルの最終更新日時
  deleted?: boolean; // 削除フラグ
}

// 競合情報を保持するインターフェース
export interface Conflict {
  filePath: string; // 競合しているファイルのパス
  localHash: string; // ローカルファイルのハッシュ値
  remoteHash: string; // リモートファイルのハッシュ値
  localTimestamp: number; // ローカルファイルのタイムスタンプ
  remoteTimestamp: number; // リモートファイルのタイムスタンプ
  deleted?: boolean; // 削除フラグ
}
export interface RemoteStorage {
  initialize(context: vscode.ExtensionContext, config: Config): Promise<void>;
  uploadFile(filePath: string, content: Uint8Array): Promise<void>;
  downloadFile(filePath: string): Promise<Uint8Array>;
  uploadIndexFile(indexFile: IndexFile): Promise<boolean>;
  downloadIndexFile(indexUuid: string): Promise<IndexFile | null>;
  updateHeadFile(newIndexUuid: string): Promise<void>;
  getHeadIndexUuid(): Promise<string | null>;
}
