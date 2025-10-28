// src/interfaces/ISyncServiceFactory.ts

import { ISyncService } from "./ISyncService";
import { IBranchTreeViewProvider } from "./IBranchTreeViewProvider";
import * as vscode from "vscode";

/**
 * 同期サービス作成の設定
 */
export interface SyncConfig {
  /** ストレージタイプ */
  storageType: "github" | "s3" | "local";
  /** リモートURL (GitHubの場合) */
  remoteUrl: string;
  /** 暗号化キー */
  encryptionKey: string;
  /** ブランチプロバイダー (オプション) */
  branchProvider?: IBranchTreeViewProvider;
  /** 環境ID */
  environmentId?: string;
}

/**
 * ストレージ固有の設定
 */
export interface StorageConfig {
  type: "github" | "s3" | "local";
  github?: GitHubConfig;
  s3?: S3Config;
  local?: LocalConfig;
}

export interface GitHubConfig {
  remoteUrl: string;
  branch?: string;
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface LocalConfig {
  basePath: string;
}

/**
 * 同期サービスファクトリーのインターフェース
 */
export interface ISyncServiceFactory {
  /**
   * 設定に基づいて同期サービスを作成
   * @param config 同期設定
   * @param context VS Code 拡張機能のコンテキスト
   * @returns 同期サービスインスタンス
   */
  createSyncService(
    config: SyncConfig,
    context: vscode.ExtensionContext,
  ): ISyncService;

  /**
   * ストレージプロバイダーを作成
   * @param config ストレージ設定
   * @param encryptionKey 暗号化キー
   * @returns ストレージプロバイダーインスタンス
   */
  createStorageProvider(config: StorageConfig, encryptionKey: string): any; // IStorageProvider
}
