// src/interfaces/ISyncService.ts
import * as vscode from "vscode";

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
   * @returns 初期化が成功した場合はtrue
   */
  initializeNewStorage(): Promise<boolean>;

  /**
   * 既存のリモートストレージを取り込んで初期化する
   * @returns 初期化が成功した場合はtrue
   */
  importExistingStorage(): Promise<boolean>;

  /**
   * 既存リポジトリとの増分同期処理
   * @returns 同期が実行された場合はtrue
   */
  performIncrementalSync(): Promise<boolean>;

  /**
   * 同期オプションを更新する
   * @param options 新しい同期オプション
   */
  updateSyncOptions(context: vscode.ExtensionContext, options: SyncOptions): void;

  /**
   * 現在の同期オプションを取得する
   * @returns 現在の同期オプション
   */
  getSyncOptions(): SyncOptions;
}