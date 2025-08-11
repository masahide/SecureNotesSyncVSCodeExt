// src/factories/SyncServiceFactory.ts

import * as vscode from "vscode";
import { ISyncServiceFactory, SyncConfig, StorageConfig } from '../interfaces/ISyncServiceFactory';
import { ISyncService, SyncOptions } from '../interfaces/ISyncService';
import { IStorageProvider } from '../storage/IStorageProvider';
import { SyncService, SyncDependencies } from '../SyncService';
import { GitHubSyncProvider } from '../storage/GithubProvider';
import { ServiceLocator } from '../container/ServiceLocator';
import { ServiceKeys } from '../container/ServiceKeys';

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
    // DI コンテナからの解決を必須化（フォールバック new を撤去）
    if (!ServiceLocator.isRegistered(ServiceKeys.LOCAL_OBJECT_MANAGER)) {
      throw new Error('LocalObjectManager is not registered in the container');
    }
    const localObjectManager = ServiceLocator.getLocalObjectManager();

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
        return new GitHubSyncProvider(config.github.remoteUrl, vscode.workspace.workspaceFolders?.[0]?.uri);

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
