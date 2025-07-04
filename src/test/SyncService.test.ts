import * as assert from 'assert';
import * as vscode from 'vscode';
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
}

class MockGitHubSyncProvider {
  constructor(private gitRemoteUrl: string) {}

  async download(branchName: string): Promise<boolean> {
    return false; // No remote updates for basic test
  }

  async upload(branchName: string): Promise<boolean> {
    return true;
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

suite('SyncService Test Suite', () => {
  let syncService: SyncService;
  let mockDependencies: SyncDependencies;
  let testOptions: SyncOptions;

  setup(() => {
    // getCurrentBranchNameをモック関数に置き換え
    (LocalObjectManagerModule as any).getCurrentBranchName = mockGetCurrentBranchName;

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
  });

  test('増分同期処理 - リモート更新なしの場合', async () => {
    // リモート更新がない場合のテスト
    const result = await syncService.performIncrementalSync(testOptions);
    
    // ファイルが存在するので更新があったとして処理される
    assert.strictEqual(result, true);
  });

  test('増分同期処理 - リモート更新ありの場合', async () => {
    // GitHubSyncProviderのdownloadメソッドをモック
    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    let downloadCalled = false;
    let downloadCalledWith = '';
    
    mockGitHubProvider.download = async (branchName: string) => {
      downloadCalled = true;
      downloadCalledWith = branchName;
      return true;
    };

    const result = await syncService.performIncrementalSync(testOptions);
    
    assert.strictEqual(result, true);
    assert.strictEqual(downloadCalled, true);
    assert.strictEqual(downloadCalledWith, 'main');
  });

  test('増分同期処理 - 競合がある場合', async () => {
    // 競合を発生させるモック
    const mockLocalManager = mockDependencies.localObjectManager as any;
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

    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    mockGitHubProvider.download = async () => true;

    const result = await syncService.performIncrementalSync(testOptions);
    
    assert.strictEqual(result, true);
    assert.strictEqual(detectConflictsCalled, true);
    assert.strictEqual(resolveConflictsCalled, true);
  });

  test('増分同期処理 - 競合解決失敗の場合', async () => {
    // 競合解決が失敗するモック
    const mockLocalManager = mockDependencies.localObjectManager as any;
    
    mockLocalManager.detectConflicts = async () => [{ type: 'conflict', file: 'test.txt' }];
    mockLocalManager.resolveConflicts = async () => false;

    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    mockGitHubProvider.download = async () => true;

    const result = await syncService.performIncrementalSync(testOptions);
    
    // 競合解決失敗でも処理は継続される（trueが返される）
    assert.strictEqual(result, true);
  });

  test('増分同期処理 - エラー発生時の処理', async () => {
    // エラーを発生させるモック
    const mockLocalManager = mockDependencies.localObjectManager as any;
    mockLocalManager.loadWsIndex = async () => {
      throw new Error('Test error');
    };

    try {
      await syncService.performIncrementalSync(testOptions);
      assert.fail('エラーが発生するはずです');
    } catch (error: any) {
      assert.strictEqual(error.message, 'Test error');
    }
  });

  test('増分同期処理 - ファイル更新なしの場合', async () => {
    // ファイル更新がない場合のモック
    const mockLocalManager = mockDependencies.localObjectManager as any;
    mockLocalManager.saveEncryptedObjects = async () => false;

    const mockGitHubProvider = mockDependencies.gitHubSyncProvider as any;
    mockGitHubProvider.download = async () => false;

    const result = await syncService.performIncrementalSync(testOptions);
    
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