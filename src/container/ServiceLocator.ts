// src/container/ServiceLocator.ts

import { ServiceContainer } from "./ServiceContainer";
import { ServiceKeys } from "./ServiceKeys";
import { ISyncServiceFactory } from "../interfaces/ISyncServiceFactory";
import { ConfigManager } from "../config/ConfigManager";
import { BranchTreeViewProvider } from "../BranchTreeViewProvider";
import { LocalObjectManager } from "../storage/LocalObjectManager";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";
import { IEncryptionService } from "../interfaces/IEncryptionService";
import { IKeyManagementService } from "../interfaces/IKeyManagementService";
import { IFileSystem } from "../storage/fileSystem";
import { IGitClient } from "../storage/gitClient";
import { ISecureNotesLayoutManager } from "../storage/layoutManager";

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
      throw new Error(
        "Service container is not initialized. Call ServiceLocator.setContainer() first.",
      );
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
   * 同期サービスファクトリーを取得
   */
  static getSyncServiceFactory(): ISyncServiceFactory {
    return ServiceLocator.resolve<ISyncServiceFactory>(
      ServiceKeys.SYNC_SERVICE_FACTORY,
    );
  }

  /**
   * 設定管理サービスを取得
   */
  static getConfigManager(): typeof ConfigManager {
    return ServiceLocator.resolve<typeof ConfigManager>(
      ServiceKeys.CONFIG_MANAGER,
    );
  }

  /**
   * ブランチプロバイダーを取得
   */
  static getBranchProvider(): BranchTreeViewProvider {
    return ServiceLocator.resolve<BranchTreeViewProvider>(
      ServiceKeys.BRANCH_PROVIDER,
    );
  }

  /**
   * ワークスペースコンテキストサービスを取得
   */
  static getWorkspaceContextService(): IWorkspaceContextService {
    return ServiceLocator.resolve<IWorkspaceContextService>(
      ServiceKeys.WORKSPACE_CONTEXT,
    );
  }

  /**
   * 暗号化サービスを取得
   */
  static getEncryptionService(): IEncryptionService {
    return ServiceLocator.resolve<IEncryptionService>(
      ServiceKeys.ENCRYPTION_SERVICE,
    );
  }

  /**
   * 鍵管理サービスを取得
   */
  static getKeyManagementService(): IKeyManagementService {
    return ServiceLocator.resolve<IKeyManagementService>(
      ServiceKeys.KEY_MANAGEMENT_SERVICE,
    );
  }

  static getFileSystem(): IFileSystem {
    return ServiceLocator.resolve<IFileSystem>(ServiceKeys.FILE_SYSTEM);
  }

  static getGitClient(): IGitClient {
    return ServiceLocator.resolve<IGitClient>(ServiceKeys.GIT_CLIENT);
  }

  static getLayoutManager(): ISecureNotesLayoutManager {
    return ServiceLocator.resolve<ISecureNotesLayoutManager>(
      ServiceKeys.LAYOUT_MANAGER,
    );
  }

  /**
   * ローカルオブジェクトマネージャーを取得
   */
  static getLocalObjectManager(): LocalObjectManager {
    return ServiceLocator.resolve<LocalObjectManager>(
      ServiceKeys.LOCAL_OBJECT_MANAGER,
    );
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
