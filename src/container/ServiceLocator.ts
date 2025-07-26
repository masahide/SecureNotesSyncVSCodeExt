// src/container/ServiceLocator.ts

import { ServiceContainer } from './ServiceContainer';
import { ServiceKeys } from './ServiceKeys';
import { ISyncService } from '../interfaces/ISyncService';
import { ISyncServiceFactory } from '../interfaces/ISyncServiceFactory';
import { ConfigManager } from '../config/ConfigManager';
import { BranchTreeViewProvider } from '../BranchTreeViewProvider';

/**
 * サービスロケーターパターンの実装
 * グローバルなサービスアクセスポイントを提供
 */
export class ServiceLocator {
  private static container: ServiceContainer | null = null;

  /**
   * コンテナを設定
   */
  static setContainer(container: ServiceContainer): void {
    ServiceLocator.container = container;
  }

  /**
   * コンテナを取得
   */
  static getContainer(): ServiceContainer {
    if (!ServiceLocator.container) {
      throw new Error('Service container is not initialized. Call ServiceLocator.setContainer() first.');
    }
    return ServiceLocator.container;
  }

  /**
   * サービスを解決
   */
  static resolve<T>(key: string): T {
    return ServiceLocator.getContainer().resolve<T>(key);
  }

  /**
   * 同期サービスを取得
   */
  static getSyncService(): ISyncService {
    return ServiceLocator.resolve<ISyncService>(ServiceKeys.SYNC_SERVICE);
  }

  /**
   * 同期サービスファクトリーを取得
   */
  static getSyncServiceFactory(): ISyncServiceFactory {
    return ServiceLocator.resolve<ISyncServiceFactory>(ServiceKeys.SYNC_SERVICE_FACTORY);
  }

  /**
   * 設定管理サービスを取得
   */
  static getConfigManager(): typeof ConfigManager {
    return ServiceLocator.resolve<typeof ConfigManager>(ServiceKeys.CONFIG_MANAGER);
  }

  /**
   * ブランチプロバイダーを取得
   */
  static getBranchProvider(): BranchTreeViewProvider {
    return ServiceLocator.resolve<BranchTreeViewProvider>(ServiceKeys.BRANCH_PROVIDER);
  }

  /**
   * サービスが登録されているかチェック
   */
  static isRegistered(key: string): boolean {
    return ServiceLocator.container?.isRegistered(key) ?? false;
  }

  /**
   * スコープを作成
   */
  static createScope() {
    return ServiceLocator.getContainer().createScope();
  }

  /**
   * コンテナを破棄
   */
  static dispose(): void {
    if (ServiceLocator.container) {
      ServiceLocator.container.dispose();
      ServiceLocator.container = null;
    }
  }

  /**
   * コンテナがセットアップされているかチェック
   */
  static isInitialized(): boolean {
    return ServiceLocator.container !== null;
  }
}