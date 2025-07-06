import * as assert from 'assert';
import * as vscode from 'vscode';

// ワークスペースフォルダのモックを最初に設定
// 一時ディレクトリを使用して実際に書き込み可能なパスを設定
const tempWorkspaceDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'test-workspace-'));
const mockWorkspaceFolder = {
  uri: vscode.Uri.file(tempWorkspaceDir),
  name: 'mock-workspace',
  index: 0
};

// ワークスペースフォルダをモック（インポート前に設定）
Object.defineProperty(vscode.workspace, 'workspaceFolders', {
  value: [mockWorkspaceFolder],
  writable: true,
  configurable: true
});

// logger機能をモック（インポート前に設定）
const mockLogger = {
  logMessage: () => {},
  showInfo: () => {},
  showError: () => {},
  logMessageRed: () => {},
  logMessageGreen: () => {},
  logMessageBlue: () => {},
  showOutputTerminal: () => {}
};

// loggerモジュールをモック
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id: string) {
  if (id === '../logger' || id.endsWith('/logger')) {
    return mockLogger;
  }
  return originalRequire.apply(this, arguments);
};

import { SyncService, SyncOptions, SyncDependencies } from '../SyncService';
import { IndexFile, FileEntry } from '../types';

// モックオブジェクト
class MockLocalObjectManager {
  static async loadWsIndex(options: SyncOptions): Promise<IndexFile> {
    return {
      uuid: 'test-uuid-1',
      environmentId: options.environmentId,
      parentUuids: [],
      files: [
        {
          path: 'test.txt',
          hash: 'hash1',
          timestamp: Date.now()
        }
      ],
      timestamp: Date.now()
    };
  }

  static async generateLocalIndexFile(previousIndex: IndexFile, options: SyncOptions): Promise<IndexFile> {
    return {
      ...previousIndex,
      uuid: 'test-uuid-2',
      timestamp: Date.now()
    };
  }

  static async loadRemoteIndex(options: SyncOptions): Promise<IndexFile> {
    return {
      uuid: 'remote-uuid-1',
      environmentId: 'remote-env',
      parentUuids: [],
      files: [
        {
          path: 'remote.txt',
          hash: 'remote-hash1',
          timestamp: Date.now()
        }
      ],
      timestamp: Date.now()
    };
  }

  static async detectConflicts(
    previousIndex: IndexFile,
    newLocalIndex: IndexFile,
    remoteIndex: IndexFile
  ): Promise<any[]> {
    return []; // No conflicts for basic test
  }

  static async resolveConflicts(conflicts: any[], options: SyncOptions): Promise<boolean> {
    return true;
  }

  static async saveEncryptedObjects(
    files: FileEntry[],
    previousIndex: IndexFile,
    options: SyncOptions
  ): Promise<boolean> {
    return files.length > 0;
  }

  static async saveIndexFile(
    indexFile: IndexFile,
    branchName: string,
    encryptionKey: string
  ): Promise<void> {
    // Mock implementation
  }

  static async saveWsIndexFile(indexFile: IndexFile, options: SyncOptions): Promise<void> {
    // Mock implementation
  }

  static async reflectFileChanges(
    previousIndex: IndexFile,
    newIndex: IndexFile,
    options: SyncOptions,
    isCheckout: boolean
  ): Promise<void> {
    // Mock implementation
  }

  // 新しいメソッドを追加
  async encryptAndSaveWorkspaceFiles(): Promise<IndexFile> {
    return {
      uuid: 'encrypted-uuid',
      environmentId: 'test-env',
      parentUuids: [],
      files: [
        {
          path: 'test.txt',
          hash: 'encrypted-hash',
          timestamp: Date.now()
        }
      ],
      timestamp: Date.now()
    };
  }

  async decryptAndRestoreFile(fileEntry: any): Promise<void> {
    // Mock implementation
  }

  async loadRemoteIndexes(): Promise<IndexFile[]> {
    return [];
  }

  async findLatestIndex(indexes: IndexFile[]): Promise<IndexFile> {
    return indexes[0] || {
      uuid: 'latest-uuid',
      environmentId: 'test-env',
      parentUuids: [],
      files: [],
      timestamp: Date.now()
    };
  }

  async updateWorkspaceIndex(indexFile: IndexFile): Promise<void> {
    // Mock implementation
  }
}

class MockGitHubSyncProvider {
  constructor(private gitRemoteUrl: string) {}

  async download(branchName: string): Promise<boolean> {
    return false; // No remote updates for basic test
  }

  async upload(branchName: string): Promise<boolean> {
    return true;
  }

  async checkRemoteRepositoryExists(): Promise<boolean> {
    return false; // Default: no remote repository exists
  }

  async initializeNewRemoteRepository(): Promise<void> {
    // Mock implementation
  }

  async cloneExistingRemoteRepository(): Promise<void> {
    // Mock implementation
  }

  async loadAndDecryptRemoteData(): Promise<void> {
    // Mock implementation
  }
}

class MockBranchProvider {
  refresh(): void {
    // Mock implementation
  }
}

// getCurrentBranchNameをモック
import * as LocalObjectManagerModule from '../storage/LocalObjectManager';
const originalGetCurrentBranchName = LocalObjectManagerModule.getCurrentBranchName;

// モック関数を作成
const mockGetCurrentBranchName = async (): Promise<string> => 'main';

// ワークスペースフォルダのモックは上部で既に定義済み

suite('SyncService Test Suite', () => {
  let syncService: SyncService;
  let mockDependencies: SyncDependencies;
  let testOptions: SyncOptions;

  setup(() => {
    // getCurrentBranchNameをモック関数に置き換え
    (LocalObjectManagerModule as any).getCurrentBranchName = mockGetCurrentBranchName;

    // ワークスペースフォルダをモック
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [mockWorkspaceFolder],
      writable: true
    });

    mockDependencies = {
      localObjectManager: MockLocalObjectManager as any,
      gitHubSyncProvider: new MockGitHubSyncProvider('https://github.com/test/repo.git') as any,
      branchProvider: new MockBranchProvider()
    };

    syncService = new SyncService(mockDependencies);

    testOptions = {
      environmentId: 'test-env-id',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    };
  });

  teardown(() => {
    // 元の関数に戻す
    (LocalObjectManagerModule as any).getCurrentBranchName = originalGetCurrentBranchName;
    
    // ワークスペースフォルダのモックをクリア
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: undefined,
      writable: true
    });
  });

  test('増分同期処理 - リモート更新なしの場合', async () => {
    // リモート更新がない場合のテスト（新規リポジトリ）
    const result = await syncService.performIncrementalSync(testOptions);
    
    // 新規リポジトリの場合はfalseが返される（再設計仕様）
    assert.strictEqual(result, false);
  });

  test('増分同期処理 - リモート更新ありの場合', async () => {
    // 既存リポジトリのシナリオをテスト
    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    
    // リモートリポジトリが存在する場合
    mockGitHubProvider.checkRemoteRepositoryExists = async () => true;
    
    let cloneCalled = false;
    let loadDataCalled = false;
    
    mockGitHubProvider.cloneExistingRemoteRepository = async () => {
      cloneCalled = true;
    };
    
    mockGitHubProvider.loadAndDecryptRemoteData = async () => {
      loadDataCalled = true;
    };

    const result = await syncService.performIncrementalSync(testOptions);
    
    assert.strictEqual(result, true); // 既存リポジトリの場合はtrue
    assert.strictEqual(cloneCalled, true);
    assert.strictEqual(loadDataCalled, true);
  });

  test('増分同期処理 - 競合がある場合', async () => {
    // 既存リポジトリで競合があるケース
    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    const mockLocalManager = mockDependencies.localObjectManager as any;
    
    // リモートリポジトリが存在する場合
    mockGitHubProvider.checkRemoteRepositoryExists = async () => true;
    
    // 従来の増分同期処理でリモート更新があることをシミュレート
    mockGitHubProvider.download = async () => true;
    
    let detectConflictsCalled = false;
    let resolveConflictsCalled = false;
    
    mockLocalManager.detectConflicts = async () => {
      detectConflictsCalled = true;
      return [{ type: 'conflict', file: 'test.txt' }];
    };
    
    mockLocalManager.resolveConflicts = async () => {
      resolveConflictsCalled = true;
      return true;
    };

    const result = await syncService.performIncrementalSync(testOptions);
    
    assert.strictEqual(result, true); // 既存リポジトリの場合はtrue
    assert.strictEqual(detectConflictsCalled, true);
    assert.strictEqual(resolveConflictsCalled, true);
  });

  test('増分同期処理 - 競合解決失敗の場合', async () => {
    // 既存リポジトリで競合解決が失敗するケース
    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    const mockLocalManager = mockDependencies.localObjectManager as any;
    
    // リモートリポジトリが存在する場合
    mockGitHubProvider.checkRemoteRepositoryExists = async () => true;
    
    mockLocalManager.detectConflicts = async () => [{ type: 'conflict', file: 'test.txt' }];
    mockLocalManager.resolveConflicts = async () => false;

    const result = await syncService.performIncrementalSync(testOptions);
    
    // 既存リポジトリの場合はtrueが返される
    assert.strictEqual(result, true);
  });

  test('増分同期処理 - エラー発生時の処理', async () => {
    // エラーテスト用の独立したモックを作成
    const errorMockGitHubProvider = new MockGitHubSyncProvider('https://github.com/test/repo.git') as any;
    errorMockGitHubProvider.checkRemoteRepositoryExists = async () => {
      throw new Error('Test error');
    };
    
    const errorMockDependencies = {
      localObjectManager: MockLocalObjectManager as any,
      gitHubSyncProvider: errorMockGitHubProvider,
      branchProvider: new MockBranchProvider()
    };
    
    const errorSyncService = new SyncService(errorMockDependencies);

    try {
      await errorSyncService.performIncrementalSync(testOptions);
      assert.fail('エラーが発生するはずです');
    } catch (error: any) {
      assert.strictEqual(error.message, 'Test error');
    }
  });

  test('増分同期処理 - ファイル更新なしの場合', async () => {
    // 新しいSyncServiceインスタンスを作成（他のテストの影響を避けるため）
    const cleanMockDependencies = {
      localObjectManager: MockLocalObjectManager as any,
      gitHubSyncProvider: new MockGitHubSyncProvider('https://github.com/test/repo.git') as any,
      branchProvider: new MockBranchProvider()
    };
    
    const cleanSyncService = new SyncService(cleanMockDependencies);
    
    // ファイル更新がない場合のモック
    const mockLocalManager = cleanMockDependencies.localObjectManager as any;
    mockLocalManager.saveEncryptedObjects = async () => false;

    const mockGitHubProvider = cleanMockDependencies.gitHubSyncProvider as any;
    mockGitHubProvider.download = async () => false;

    const result = await cleanSyncService.performIncrementalSync(testOptions);
    
    // 更新がないのでfalseが返される
    assert.strictEqual(result, false);
  });
});

suite('SyncService Integration Test Suite', () => {
  test('createSyncService ファクトリー関数のテスト', () => {
    const { createSyncService } = require('../SyncService');
    
    const syncService = createSyncService('https://github.com/test/repo.git');
    
    assert.ok(syncService);
    assert.ok(syncService instanceof SyncService);
  });
});