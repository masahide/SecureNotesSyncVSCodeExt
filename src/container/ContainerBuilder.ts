// src/container/ContainerBuilder.ts

import * as vscode from 'vscode';
import { ServiceContainer, ServiceLifetime } from './ServiceContainer';
import { ServiceKeys } from './ServiceKeys';
import { ISyncService } from '../interfaces/ISyncService';
import { ISyncServiceFactory } from '../interfaces/ISyncServiceFactory';
import { IStorageProvider } from '../storage/IStorageProvider';
import { SyncServiceFactory } from '../factories/SyncServiceFactory';
import { GitHubSyncProvider } from '../storage/GithubProvider';
import { LocalObjectManager } from '../storage/LocalObjectManager';
import { ConfigManager } from '../config/ConfigManager';
import { BranchTreeViewProvider } from '../BranchTreeViewProvider';

/**
 * サービスコンテナの構築を担当するクラス
 */
export class ContainerBuilder {
  private container: ServiceContainer;

  constructor() {
    this.container = new ServiceContainer();
  }

  /**
   * 基本的なサービスを登録
   */
  registerCoreServices(): ContainerBuilder {
    // ファクトリーサービス（シングルトン）
    this.container.registerSingleton<ISyncServiceFactory>(
      ServiceKeys.SYNC_SERVICE_FACTORY,
      () => new SyncServiceFactory()
    );

    // 設定管理サービス（シングルトン）
    this.container.registerSingleton<typeof ConfigManager>(
      ServiceKeys.CONFIG_MANAGER,
      () => ConfigManager
    );

    // ローカルオブジェクトマネージャー（シングルトン）
    this.container.registerSingleton<typeof LocalObjectManager>(
      ServiceKeys.LOCAL_OBJECT_MANAGER,
      () => LocalObjectManager
    );

    return this;
  }

  /**
   * VS Code関連のサービスを登録
   */
  registerVSCodeServices(context: vscode.ExtensionContext): ContainerBuilder {
    // Extension Context（インスタンス登録）
    this.container.registerInstance<vscode.ExtensionContext>(
      ServiceKeys.EXTENSION_CONTEXT,
      context
    );

    // Branch Tree Provider（シングルトン）
    this.container.registerSingleton<BranchTreeViewProvider>(
      ServiceKeys.BRANCH_PROVIDER,
      (context: vscode.ExtensionContext) => new BranchTreeViewProvider(context),
      [ServiceKeys.EXTENSION_CONTEXT]
    );

    return this;
  }

  /**
   * ストレージサービスを登録
   */
  registerStorageServices(): ContainerBuilder {
    // GitHub Provider（一時的 - 設定に依存するため）
    this.container.registerTransient<GitHubSyncProvider>(
      ServiceKeys.GITHUB_PROVIDER,
      (remoteUrl: string, encryptionKey: string) => new GitHubSyncProvider(remoteUrl, encryptionKey)
    );

    return this;
  }

  /**
   * 同期サービスを登録
   */
  registerSyncServices(): ContainerBuilder {
    // Sync Service（スコープド - リクエストごとに新しいインスタンス）
    this.container.registerScoped<ISyncService>(
      ServiceKeys.SYNC_SERVICE,
      (factory: ISyncServiceFactory, config: any) => factory.createSyncService(config),
      [ServiceKeys.SYNC_SERVICE_FACTORY]
    );

    return this;
  }

  /**
   * テスト用のモックサービスを登録
   */
  registerTestServices(): ContainerBuilder {
    // テスト用のモックファクトリー
    this.container.registerSingleton<ISyncServiceFactory>(
      ServiceKeys.SYNC_SERVICE_FACTORY,
      () => new MockSyncServiceFactory()
    );

    return this;
  }

  /**
   * カスタムサービスを登録
   */
  registerCustomService<T>(
    key: string,
    factory: (...args: any[]) => T,
    lifetime: ServiceLifetime = ServiceLifetime.Transient,
    dependencies: string[] = []
  ): ContainerBuilder {
    switch (lifetime) {
      case ServiceLifetime.Singleton:
        this.container.registerSingleton(key, factory, dependencies);
        break;
      case ServiceLifetime.Scoped:
        this.container.registerScoped(key, factory, dependencies);
        break;
      case ServiceLifetime.Transient:
      default:
        this.container.registerTransient(key, factory, dependencies);
        break;
    }
    return this;
  }

  /**
   * コンテナを構築
   */
  build(): ServiceContainer {
    return this.container;
  }

  /**
   * デフォルト設定でコンテナを構築
   */
  static buildDefault(context: vscode.ExtensionContext): ServiceContainer {
    return new ContainerBuilder()
      .registerCoreServices()
      .registerVSCodeServices(context)
      .registerStorageServices()
      .registerSyncServices()
      .build();
  }

  /**
   * テスト用コンテナを構築
   */
  static buildForTesting(): ServiceContainer {
    return new ContainerBuilder()
      .registerCoreServices()
      .registerTestServices()
      .build();
  }
}

/**
 * テスト用のモックファクトリー
 */
class MockSyncServiceFactory implements ISyncServiceFactory {
  createSyncService(config: any): ISyncService {
    return {
      isRepositoryInitialized: async () => true,
      initializeNewRepository: async () => true,
      importExistingRepository: async () => true,
      performIncrementalSync: async () => true
    };
  }

  createStorageProvider(config: any, encryptionKey: string): IStorageProvider {
    return {
      isInitialized: async () => true,
      initialize: async () => { },
      download: async () => true,
      upload: async () => true
    };
  }
}