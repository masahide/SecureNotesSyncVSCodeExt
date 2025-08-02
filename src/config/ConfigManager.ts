// src/config/ConfigManager.ts

import * as vscode from 'vscode';
import { SyncConfig, StorageConfig } from '../interfaces/ISyncServiceFactory';
import { IBranchTreeViewProvider } from '../interfaces/IBranchTreeViewProvider';
import * as config from '../config';

/**
 * 設定管理クラス
 * VS Code設定から同期設定を構築
 */
export class ConfigManager {
  
  /**
   * VS Code設定から同期設定を作成
   */
  static async createSyncConfig(
    context: vscode.ExtensionContext,
    encryptionKey: string,
    branchProvider?: IBranchTreeViewProvider
  ): Promise<SyncConfig> {
    const gitRemoteUrl = config.getGitRemoteUrl();
    if (!gitRemoteUrl) {
      throw new Error('Git remote URL is not configured');
    }
    
    const environmentId = await this.getOrCreateEnvironmentId(context);
    
    return {
      storageType: 'github', // 現在はGitHubのみサポート
      remoteUrl: gitRemoteUrl,
      encryptionKey,
      branchProvider,
      environmentId
    };
  }
  
  /**
   * ストレージ設定を作成
   */
  static createStorageConfig(): StorageConfig {
    const gitRemoteUrl = config.getGitRemoteUrl();
    
    return {
      type: 'github',
      github: {
        remoteUrl: gitRemoteUrl || '',
        branch: 'main' // デフォルトブランチ
      }
    };
  }
  
  /**
   * 環境IDを取得または作成
   */
  private static async getOrCreateEnvironmentId(context: vscode.ExtensionContext): Promise<string> {
    const ENV_ID_KEY = "encryptSyncEnvironmentId";
    let envId = context.globalState.get<string>(ENV_ID_KEY);
    if (!envId) {
      const os = require('os');
      const crypto = require('crypto');
      const hostname = os.hostname();
      envId = `${hostname}-${crypto.randomUUID()}`;
      await context.globalState.update(ENV_ID_KEY, envId);
    }
    return envId;
  }
  
  /**
   * 設定の妥当性を検証
   */
  static validateConfig(config: SyncConfig): void {
    if (!config.encryptionKey || config.encryptionKey.length !== 64) {
      throw new Error('Invalid encryption key: must be 64 hex characters');
    }
    
    if (!config.remoteUrl) {
      throw new Error('Remote URL is required');
    }
    
    if (config.storageType === 'github' && !config.remoteUrl.includes('github')) {
      throw new Error('Invalid GitHub remote URL');
    }
  }
}