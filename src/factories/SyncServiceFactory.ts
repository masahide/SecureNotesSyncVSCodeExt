// src/factories/SyncServiceFactory.ts

import * as vscode from "vscode";
import { ISyncServiceFactory, SyncConfig, StorageConfig } from '../interfaces/ISyncServiceFactory';
import { ISyncService, SyncOptions } from '../interfaces/ISyncService';
import { IStorageProvider } from '../storage/IStorageProvider';
import { SyncService, SyncDependencies } from '../SyncService';
import { GitHubSyncProvider } from '../storage/GithubProvider';
import { LocalObjectManager } from '../storage/LocalObjectManager';

/**
 * 同期サービスファクトリーの実装
 */
export class SyncServiceFactory implements ISyncServiceFactory {

  /**
   * 設定に基づいて同期サービスを作成
   */
  createSyncService(config: SyncConfig, context: vscode.ExtensionContext): ISyncService {
    const storageConfig: StorageConfig = {
      type: config.storageType,
      github: config.storageType === 'github' ? { remoteUrl: config.remoteUrl } : undefined
    };

    const storageProvider = this.createStorageProvider(storageConfig, config.encryptionKey);
    const localObjectManager = new LocalObjectManager(vscode.workspace.workspaceFolders![0].uri.fsPath, context, config.encryptionKey);

    const dependencies: SyncDependencies = {
      localObjectManager,
      storageProvider,
      branchProvider: config.branchProvider
    };

    const syncOptions = {
      environmentId: config.environmentId || 'default',
      encryptionKey: config.encryptionKey
    };

    return new SyncService(dependencies, context, syncOptions);
  }

  /**
   * ストレージプロバイダーを作成
   */
  createStorageProvider(config: StorageConfig, encryptionKey: string): IStorageProvider {
    switch (config.type) {
      case 'github':
        if (!config.github?.remoteUrl) {
          throw new Error('GitHub configuration requires remoteUrl');
        }
        return new GitHubSyncProvider(config.github.remoteUrl, encryptionKey, vscode.workspace.workspaceFolders?.[0]?.uri);

      case 's3':
        // TODO: S3プロバイダーの実装
        throw new Error('S3 storage provider not implemented yet');

      case 'local':
        // TODO: ローカルプロバイダーの実装
        throw new Error('Local storage provider not implemented yet');

      default:
        throw new Error(`Unsupported storage type: ${config.type}`);
    }
  }
}

/**
 * デフォルトファクトリーインスタンス
 */
export const defaultSyncServiceFactory = new SyncServiceFactory();