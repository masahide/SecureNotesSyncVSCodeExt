import * as assert from "assert";
import * as vscode from "vscode";

// ワークスペースフォルダのモックを最初に設定
// 一時ディレクトリを使用して実際に書き込み可能なパスを設定
const tempWorkspaceDir = require("fs").mkdtempSync(
  require("path").join(require("os").tmpdir(), "test-workspace-"),
);
const mockWorkspaceFolder = {
  uri: vscode.Uri.file(tempWorkspaceDir),
  name: "mock-workspace",
  index: 0,
};

// ワークスペースフォルダをモック（インポート前に設定）
Object.defineProperty(vscode.workspace, "workspaceFolders", {
  value: [mockWorkspaceFolder],
  writable: true,
  configurable: true,
});

// logger機能をモック（インポート前に設定）
const mockLogger = {
  logMessage: () => {},
  showInfo: () => {},
  showError: () => {},
  logMessageRed: () => {},
  logMessageGreen: () => {},
  logMessageBlue: () => {},
  showOutputTerminal: () => {},
};

// loggerモジュールをモック
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "../logger" || id.endsWith("/logger")) {
    return mockLogger;
  }
  return originalRequire.apply(this, arguments);
};

import { SyncService, SyncDependencies } from "../SyncService";
import { SyncOptions } from "../interfaces/ISyncService";
import { IndexFile, FileEntry } from "../types";
import { IBranchTreeViewProvider } from "../interfaces/IBranchTreeViewProvider";

// モックオブジェクト
class MockLocalObjectManager {
  static async loadWsIndex(options: SyncOptions): Promise<IndexFile> {
    return {
      uuid: "test-uuid-1",
      environmentId: options.environmentId,
      parentUuids: [],
      files: [
        {
          path: "test.txt",
          hash: "hash1",
          timestamp: Date.now(),
        },
      ],
      timestamp: Date.now(),
    };
  }

  static async generateLocalIndexFile(
    previousIndex: IndexFile,
    options: SyncOptions,
  ): Promise<IndexFile> {
    return {
      ...previousIndex,
      uuid: "test-uuid-2",
      timestamp: Date.now(),
    };
  }

  static async loadRemoteIndex(options: SyncOptions): Promise<IndexFile> {
    return {
      uuid: "remote-uuid-1",
      environmentId: "remote-env",
      parentUuids: [],
      files: [
        {
          path: "remote.txt",
          hash: "remote-hash1",
          timestamp: Date.now(),
        },
      ],
      timestamp: Date.now(),
    };
  }

  static async detectConflicts(
    previousIndex: IndexFile,
    newLocalIndex: IndexFile,
    remoteIndex: IndexFile,
  ): Promise<any[]> {
    return []; // No conflicts for basic test
  }

  static async resolveConflicts(
    conflicts: any[],
    options: SyncOptions,
  ): Promise<boolean> {
    return true;
  }

  static async saveEncryptedObjects(
    files: FileEntry[],
    previousIndex: IndexFile,
    options: SyncOptions,
  ): Promise<boolean> {
    return files.length > 0;
  }

  static async saveIndexFile(
    indexFile: IndexFile,
    branchName: string,
    encryptionKey: string,
  ): Promise<void> {
    // Mock implementation
  }

  static async saveWsIndexFile(
    indexFile: IndexFile,
    options: SyncOptions,
  ): Promise<void> {
    // Mock implementation
  }

  static async reflectFileChanges(
    previousIndex: IndexFile,
    newIndex: IndexFile,
    options: SyncOptions,
    isCheckout: boolean,
  ): Promise<void> {
    // Mock implementation
  }

  // 新しいメソッドを追加
  async encryptAndSaveWorkspaceFiles(): Promise<IndexFile> {
    return {
      uuid: "encrypted-uuid",
      environmentId: "test-env",
      parentUuids: [],
      files: [
        {
          path: "test.txt",
          hash: "encrypted-hash",
          timestamp: Date.now(),
        },
      ],
      timestamp: Date.now(),
    };
  }

  async decryptAndRestoreFile(fileEntry: any): Promise<void> {
    // Mock implementation
  }

  async loadRemoteIndexes(): Promise<IndexFile[]> {
    return [];
  }

  async findLatestIndex(indexes: IndexFile[]): Promise<IndexFile> {
    return (
      indexes[0] || {
        uuid: "latest-uuid",
        environmentId: "test-env",
        parentUuids: [],
        files: [],
        timestamp: Date.now(),
      }
    );
  }

  async updateWorkspaceIndex(indexFile: IndexFile): Promise<void> {
    // Mock implementation
  }
}

class MockGitHubSyncProvider {
  public lastPulledBranch: string | undefined;
  public lastUploadedBranch: string | undefined;
  public shouldReportRemoteChanges = false;
  public simulatePullFailure = false;
  public simulateUploadFailure = false;
  public lastPullError: Error | undefined;
  public lastUploadError: Error | undefined;

  constructor(private gitRemoteUrl: string) {}

  async pullRemoteChanges(branchName: string = "main"): Promise<boolean> {
    this.lastPulledBranch = branchName;
    if (this.simulatePullFailure) {
      this.lastPullError = new Error("simulated pull failure");
      throw this.lastPullError;
    }
    return this.shouldReportRemoteChanges;
  }

  async download(branchName: string): Promise<boolean> {
    return false; // No remote updates for basic test
  }

  async upload(branchName: string): Promise<boolean> {
    this.lastUploadedBranch = branchName;
    if (this.simulateUploadFailure) {
      this.lastUploadError = new Error("simulated push failure");
      throw this.lastUploadError;
    }
    return true;
  }

  async checkRemoteRepositoryExists(): Promise<boolean> {
    return false; // Default: no remote repository exists
  }

  async checkRemoteRepositoryIsEmpty(): Promise<boolean> {
    return false; // Default: repository is not empty
  }

  async initializeNewRemoteRepository(): Promise<void> {
    // Mock implementation
  }

  async initializeEmptyRemoteRepository(): Promise<void> {
    // Mock implementation
  }

  async cloneRemoteStorage(): Promise<void> {
    // Mock implementation - void return type
  }

  async loadAndDecryptRemoteData(): Promise<void> {
    // Mock implementation
  }

  async encryptAndUploadWorkspaceFiles(): Promise<void> {
    // Mock implementation
  }
}

class MockBranchProvider implements IBranchTreeViewProvider {
  refresh(): void {
    // Mock implementation
  }
}

// getCurrentBranchNameをモック
import * as LocalObjectManagerModule from "../storage/LocalObjectManager";
const originalGetCurrentBranchName =
  LocalObjectManagerModule.getCurrentBranchName;

// モック関数を作成
const mockGetCurrentBranchName = async (): Promise<string> => "main";

// ワークスペースフォルダのモックは上部で既に定義済み

suite("SyncService Test Suite", () => {
  let syncService: SyncService;
  let mockDependencies: SyncDependencies;
  let testOptions: SyncOptions;
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    // getCurrentBranchNameをモック関数に置き換え
    (LocalObjectManagerModule as any).getCurrentBranchName =
      mockGetCurrentBranchName;

    // ワークスペースフォルダをモック
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [mockWorkspaceFolder],
      writable: true,
    });

    mockContext = {
      secrets: {
        get: async (key: string) =>
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        store: async (key: string, value: string) => {},
        delete: async (key: string) => {},
      },
      globalState: {
        get: (key: string) => undefined,
        update: async (key: string, value: any) => {},
      },
    } as any;

    const localObjectManager = new MockLocalObjectManager() as any;

    mockDependencies = {
      localObjectManager: localObjectManager,
      storageProvider: new MockGitHubSyncProvider(
        "https://github.com/test/repo.git",
      ) as any,
      branchProvider: new MockBranchProvider(),
    };

    testOptions = {
      environmentId: "test-env-id",
      encryptionKey:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };

    syncService = new SyncService(mockDependencies, mockContext, testOptions);
  });

  teardown(() => {
    // 元の関数に戻す
    (LocalObjectManagerModule as any).getCurrentBranchName =
      originalGetCurrentBranchName;

    // ワークスペースフォルダのモックをクリア
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
    });
  });

  test("増分同期処理 - リモート更新なしの場合", async () => {
    // リモート更新がない場合のテスト（新規リポジトリ）
    const result = await syncService.performIncrementalSync();

    // 新規リポジトリの場合はfalseが返される（再設計仕様）
    assert.strictEqual(result, false);
  });

  test("増分同期処理 - 現在のブランチで pull/upload する", async () => {
    const mockGitHubProvider =
      mockDependencies.storageProvider as unknown as MockGitHubSyncProvider;
    const originalBranchMock = (LocalObjectManagerModule as any)
      .getCurrentBranchName;
    (LocalObjectManagerModule as any).getCurrentBranchName = async () => "dev";
    mockGitHubProvider.shouldReportRemoteChanges = true;

    try {
      await syncService.performIncrementalSync();
    } finally {
      (LocalObjectManagerModule as any).getCurrentBranchName =
        originalBranchMock;
    }

    assert.strictEqual(mockGitHubProvider.lastPulledBranch, "dev");
    assert.strictEqual(mockGitHubProvider.lastUploadedBranch, "dev");
  });

  test("増分同期処理 - pull 失敗時はエラーを通知する", async () => {
    const mockGitHubProvider =
      mockDependencies.storageProvider as unknown as MockGitHubSyncProvider;
    mockGitHubProvider.simulatePullFailure = true;
    try {
      await assert.rejects(
        async () => {
          await syncService.performIncrementalSync();
        },
        (error: any) => {
          assert.strictEqual(error.message, "simulated pull failure");
          return true;
        },
      );
    } finally {
      mockGitHubProvider.simulatePullFailure = false;
    }
  });

  test("増分同期処理 - push 失敗時はエラーを通知する", async () => {
    const mockGitHubProvider =
      mockDependencies.storageProvider as unknown as MockGitHubSyncProvider;
    mockGitHubProvider.shouldReportRemoteChanges = true;
    mockGitHubProvider.simulateUploadFailure = true;
    try {
      await assert.rejects(
        async () => {
          await syncService.performIncrementalSync();
        },
        (error: any) => {
          assert.strictEqual(error.message, "simulated push failure");
          return true;
        },
      );
    } finally {
      mockGitHubProvider.simulateUploadFailure = false;
      mockGitHubProvider.shouldReportRemoteChanges = false;
    }
  });

  test("増分同期処理 - リモート更新ありの場合", async () => {
    // モックの動作を設定
    const mockGitHubProvider = mockDependencies.storageProvider as any;

    // リモートリポジトリが存在する場合
    mockGitHubProvider.checkRemoteRepositoryExists = async () => true;
    mockGitHubProvider.checkRemoteRepositoryIsEmpty = async () => false;

    let cloneCalled = false;
    let loadDataCalled = false;

    mockGitHubProvider.cloneRemoteStorage = async () => {
      cloneCalled = true;
    };

    mockGitHubProvider.loadAndDecryptRemoteData = async () => {
      loadDataCalled = true;
    };

    const result = await syncService.performIncrementalSync();

    assert.strictEqual(result, true); // 既存リポジトリの場合はtrue
    assert.strictEqual(cloneCalled, true);
    assert.strictEqual(loadDataCalled, true);
  });

  test("増分同期処理 - 競合がある場合", async () => {
    // リモート更新がある場合のテスト
    const mockGitHubProvider = mockDependencies.storageProvider as any;
    const mockLocalManager = mockDependencies.localObjectManager as any;

    // リモートリポジトリが存在する場合
    mockGitHubProvider.checkRemoteRepositoryExists = async () => true;
    mockGitHubProvider.checkRemoteRepositoryIsEmpty = async () => false;

    // 従来の増分同期処理でリモート更新があることをシミュレート
    mockGitHubProvider.download = async () => true;

    let detectConflictsCalled = false;
    let resolveConflictsCalled = false;

    mockLocalManager.detectConflicts = async () => {
      detectConflictsCalled = true;
      return [{ type: "conflict", file: "test.txt" }];
    };

    mockLocalManager.resolveConflicts = async () => {
      resolveConflictsCalled = true;
      return true;
    };

    const result = await syncService.performIncrementalSync();

    assert.strictEqual(result, true); // 既存リポジトリの場合はtrue
    assert.strictEqual(detectConflictsCalled, true);
    assert.strictEqual(resolveConflictsCalled, true);
  });

  test("増分同期処理 - 競合解決失敗の場合", async () => {
    // エラーハンドリングのテスト
    const mockGitHubProvider = mockDependencies.storageProvider as any;
    const mockLocalManager = mockDependencies.localObjectManager as any;

    // リモートリポジトリが存在する場合
    mockGitHubProvider.checkRemoteRepositoryExists = async () => true;
    mockGitHubProvider.checkRemoteRepositoryIsEmpty = async () => false;

    mockLocalManager.detectConflicts = async () => [
      { type: "conflict", file: "test.txt" },
    ];
    mockLocalManager.resolveConflicts = async () => false;

    const result = await syncService.performIncrementalSync();

    // 既存リポジトリの場合はtrueが返される
    assert.strictEqual(result, true);
  });

  test("増分同期処理 - エラー発生時の処理", async () => {
    // エラーテスト用の独立したモックを作成
    const errorMockGitHubProvider = new MockGitHubSyncProvider(
      "https://github.com/test/repo.git",
    ) as any;
    errorMockGitHubProvider.checkRemoteRepositoryExists = async () => {
      throw new Error("Test error");
    };

    const errorMockDependencies = {
      localObjectManager: MockLocalObjectManager as any,
      storageProvider: errorMockGitHubProvider,
      branchProvider: new MockBranchProvider(),
    };

    const errorSyncService = new SyncService(
      errorMockDependencies,
      mockContext,
      testOptions,
    );

    try {
      await errorSyncService.performIncrementalSync();
      assert.fail("エラーが発生するはずです");
    } catch (error: any) {
      assert.strictEqual(error.message, "Test error");
    }
  });

  test("増分同期処理 - ファイル更新なしの場合", async () => {
    // 新しいSyncServiceインスタンスを作成（他のテストの影響を避けるため）
    const cleanMockDependencies = {
      localObjectManager: new MockLocalObjectManager() as any,
      storageProvider: new MockGitHubSyncProvider(
        "https://github.com/test/repo.git",
      ) as any,
      branchProvider: new MockBranchProvider(),
    };

    const cleanSyncService = new SyncService(
      cleanMockDependencies,
      mockContext,
      testOptions,
    );

    // ファイル更新がない場合のモック
    const mockLocalManager = cleanMockDependencies.localObjectManager as any;
    mockLocalManager.saveEncryptedObjects = async () => false;

    const mockGitHubProvider = cleanMockDependencies.storageProvider as any;
    mockGitHubProvider.download = async () => false;

    const result = await cleanSyncService.performIncrementalSync();

    // 更新がないのでfalseが返される
    assert.strictEqual(result, false);
  });
});

suite("SyncService Integration Test Suite", () => {
  test("SyncServiceFactory ファクトリー関数のテスト", () => {
    const { SyncServiceFactory } = require("../factories/SyncServiceFactory");

    const factory = new SyncServiceFactory();
    const config = {
      storageType: "github" as const,
      remoteUrl: "https://github.com/test/repo.git",
      encryptionKey: "0".repeat(64),
    };
    const mockContext = {
      secrets: {
        get: async (key: string) => config.encryptionKey,
        store: async (key: string, value: string) => {},
        delete: async (key: string) => {},
      },
      globalState: {
        get: (key: string) => undefined,
        update: async (key: string, value: any) => {},
      },
    } as any;

    const syncService = factory.createSyncService(config, mockContext);

    assert.ok(syncService);
    assert.ok(syncService instanceof SyncService);
  });
});
