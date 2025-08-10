import * as vscode from "vscode";
import { logMessage, showInfo, showError, showOutputTerminal } from "./logger";
import {
  LocalObjectManager,
  setCurrentBranchName,
} from "./storage/LocalObjectManager";
import { IndexFile } from "./types";
import { ISyncService } from "./interfaces/ISyncService";
import { IBranchTreeViewProvider } from "./interfaces/IBranchTreeViewProvider";
import { ContainerBuilder } from "./container/ContainerBuilder";
import { ServiceLocator } from "./container/ServiceLocator";
import { ServiceKeys } from "./container/ServiceKeys";
import { registerManualSyncTestCommand } from "./test/manual-sync-test";
import * as crypto from "crypto";
import { execFile } from "child_process";
import which from "which";
import * as config from "./config";
import { IndexHistoryProvider } from "./IndexHistoryProvider";

const aesEncryptionKey = "aesEncryptionKey";
const aesEncryptionKeyFetchedTime = "aesEncryptionKeyFetchedTime";
const appName = "SecureNotesSync";

let saveSyncTimeout: NodeJS.Timeout | undefined;
let lastWindowActivationTime = 0;

// --- Helper Functions ---

/**
 * 同期サービスの共通初期化処理
 */
async function initializeSyncService(context: vscode.ExtensionContext, branchProvider: IBranchTreeViewProvider, encryptKey: string) {
  const configManager = ServiceLocator.getConfigManager();
  const syncConfig = await configManager.createSyncConfig(context, encryptKey, branchProvider);
  configManager.validateConfig(syncConfig);

  const syncServiceFactory = ServiceLocator.getSyncServiceFactory();
  const syncService = syncServiceFactory.createSyncService(syncConfig, context);

  const options = {
    environmentId: syncConfig.environmentId!,
    encryptionKey: encryptKey,
  };

  return { syncService, options };
}

/**
 * リポジトリ初期化確認ダイアログの共通処理
 */
async function confirmRepositoryReinitialization(
  syncService: ISyncService,
  message: string,
  cancelMessage: string
): Promise<boolean> {
  const isInitialized = await syncService.isRepositoryInitialized();
  if (isInitialized) {
    const answer = await vscode.window.showWarningMessage(message, "はい", "いいえ");
    if (answer !== "はい") {
      showInfo(cancelMessage);
      return false;
    }
  }
  return true;
}

/**
 * 同期操作の共通エラーハンドリング
 */
async function executeSyncOperation<T>(
  operation: () => Promise<T>,
  errorPrefix: string
): Promise<T | false> {
  try {
    return await operation();
  } catch (error: any) {
    showError(`${errorPrefix}: ${error.message}`);
    return false;
  }
}

/**
 * リポジトリ初期化操作の型定義
 */
type RepositoryInitializationOperation = (
  syncService: ISyncService,
  options: { environmentId: string; encryptionKey: string }
) => Promise<boolean>;

/**
 * リポジトリ初期化設定の型定義
 */
interface RepositoryInitializationConfig {
  confirmationMessage: string;
  cancelMessage: string;
  errorPrefix: string;
  operation: RepositoryInitializationOperation;
}

/**
 * リポジトリ初期化の共通処理
 * 関数型プログラミングのアプローチを採用し、操作を関数として注入
 */
async function handleRepositoryInitialization(
  context: vscode.ExtensionContext,
  branchProvider: IBranchTreeViewProvider,
  encryptKey: string,
  config: RepositoryInitializationConfig
) {
  return executeSyncOperation(async () => {
    const { syncService, options } = await initializeSyncService(context, branchProvider, encryptKey);

    const shouldProceed = await confirmRepositoryReinitialization(
      syncService,
      config.confirmationMessage,
      config.cancelMessage
    );
    if (!shouldProceed) {
      return false;
    }

    return await config.operation(syncService, options);
  }, config.errorPrefix);
}

// --- Command Handlers ---

async function handleSetAESKey(context: vscode.ExtensionContext) {
  return executeSyncOperation(async () => {
    const secretValue = await vscode.window.showInputBox({
      prompt: "Enter AES Encryption Key (64 hex characters representing 32 bytes)",
      password: true,
      validateInput: (value) =>
        value.length === 64 ? null : "AES Key must be 64 hex characters long",
    });

    if (secretValue) {
      await context.secrets.store(aesEncryptionKey, secretValue);
      await context.secrets.store(aesEncryptionKeyFetchedTime, "");
      showInfo(`${aesEncryptionKey} saved successfully.`);
      return true;
    } else {
      showError(`${aesEncryptionKey} is required.`);
      return false;
    }
  }, "Error setting AES key");
}

async function handleGenerateAESKey(context: vscode.ExtensionContext) {
  return executeSyncOperation(async () => {
    logMessage("Generating 32-byte AES encryption key...");
    const key = crypto.randomBytes(32).toString("hex");
    await context.secrets.store(aesEncryptionKey, key);
    await context.secrets.store(aesEncryptionKeyFetchedTime, Date.now().toString());
    showInfo(`Generated and stored AES key: ${key}`);
    return true;
  }, "Error generating encrypted text");
}


async function handleInitializeNewRepository(context: vscode.ExtensionContext, branchProvider: IBranchTreeViewProvider, encryptKey: string) {
  return handleRepositoryInitialization(context, branchProvider, encryptKey, {
    confirmationMessage: "ローカルリポジトリが既に存在します。新規リポジトリとして再初期化しますか？ (現在のローカルデータは削除されます)",
    cancelMessage: "新規リポジトリの初期化をキャンセルしました。",
    errorPrefix: "New repository initialization failed",
    operation: (syncService, options) => syncService.initializeNewStorage()
  });
}

async function handleImportExistingRepository(context: vscode.ExtensionContext, branchProvider: IBranchTreeViewProvider, encryptKey: string) {
  return handleRepositoryInitialization(context, branchProvider, encryptKey, {
    confirmationMessage: "ローカルリポジトリが既に存在します。既存リモートリポジトリで上書きしますか？ (現在のローカルデータは削除されます)",
    cancelMessage: "既存リポジトリの取り込みをキャンセルしました。",
    errorPrefix: "Existing repository import failed",
    operation: (syncService, options) => syncService.importExistingStorage()
  });
}

async function handleSyncNotes(context: vscode.ExtensionContext, branchProvider: IBranchTreeViewProvider, encryptKey: string) {
  return executeSyncOperation(async () => {
    const { syncService, options } = await initializeSyncService(context, branchProvider, encryptKey);

    const isInitialized = await syncService.isRepositoryInitialized();
    if (!isInitialized) {
      showError("リポジトリが初期化されていません。まず `Secure Notes: Initialize New Repository` または `Secure Notes: Import Existing Repository` コマンドを実行してください。");
      return false;
    }

    return await syncService.performIncrementalSync();
  }, "Sync failed");
}

async function handleCopyAESKeyToClipboard(context: vscode.ExtensionContext) {
  return executeSyncOperation(async () => {
    const aesKey = await context.secrets.get(aesEncryptionKey);
    if (!aesKey) {
      showError("AES Key is not set. Please set the AES key first.");
      return false;
    }
    await vscode.env.clipboard.writeText(aesKey);
    showInfo("AES Key copied to clipboard!");
    return true;
  }, "Failed to copy AES Key");
}

async function handleRefreshAESKey(context: vscode.ExtensionContext) {
  return executeSyncOperation(async () => {
    await context.secrets.store(aesEncryptionKeyFetchedTime, "0");
    const newKey = await getAESKey(context);
    if (newKey) {
      showInfo("AES key refreshed successfully.");
      return true;
    } else {
      showError("Failed to refresh AES key.");
      return false;
    }
  }, "Error refreshing AES key");
}

async function handleInsertCurrentTime() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active text editor.");
    return;
  }

  const date = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : n.toString());
  const formatted = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const editOperations: vscode.TextEdit[] = editor.selections.map(
    (selection) => vscode.TextEdit.replace(selection, formatted)
  );

  await editor.edit((editBuilder) => {
    editOperations.forEach((edit) => editBuilder.replace(edit.range, edit.newText));
  });
}

async function handleCreateBranchFromIndex(context: vscode.ExtensionContext, encryptKey: string, branchItem?: any, branchProvider?: IBranchTreeViewProvider) {
  if (!branchItem || !branchItem.indexFile) {
    vscode.window.showErrorMessage("No index selected.");
    return;
  }
  const baseIndex = branchItem.indexFile as IndexFile;
  const newBranch = await vscode.window.showInputBox({
    prompt: "Enter new branch name",
    validateInput: (value) => {
      if (!value.match(/^[A-Za-z0-9_\-]+$/)) {
        return "Alphanumeric/underscore/hyphen only.";
      }
      return null;
    },
  });
  if (!newBranch) {
    return;
  }

  const newIndexFile: IndexFile = { ...baseIndex };
  const localObjectManager = ServiceLocator.getLocalObjectManager();
  await localObjectManager.saveBranchRef(newBranch, newIndexFile.uuid);
  vscode.window.showInformationMessage(`Created new branch '${newBranch}' from index UUID: ${newIndexFile.uuid}`);
  branchProvider?.refresh();
}

async function handleCheckoutBranch(context: vscode.ExtensionContext, encryptKey: string, branchItem?: any) {
  return executeSyncOperation(async () => {
    if (!branchItem?.branchName) {
      showError("No branch selected.");
      return false;
    }
    const branchName = branchItem.branchName;
    const localObjectManager = ServiceLocator.getLocalObjectManager();

    const latestIndexUuid = await localObjectManager.readBranchRef(branchName);
    if (!latestIndexUuid) {
      showError(`Branch ${branchName} has no index.`);
      return false;
    }

    const configManager = ServiceLocator.getConfigManager();
    const tempConfig = await configManager.createSyncConfig(context, encryptKey);
    const options = {
      environmentId: tempConfig.environmentId!,
      encryptionKey: encryptKey,
    };

    const targetIndex = await localObjectManager.loadIndex(latestIndexUuid, options);
    const currentWsIndex = await localObjectManager.loadWsIndex(options);
    await localObjectManager.reflectFileChanges(currentWsIndex, targetIndex, true, options);
    await localObjectManager.saveWsIndexFile(targetIndex, options);
    await setCurrentBranchName(branchName);
    showInfo(`Checked out branch: ${branchName}`);
    return true;
  }, "Error checking out branch");
}

/**
 * 自動同期リスナーの設定
 */
function setupAutoSyncListeners() {
  // ウィンドウ状態変更リスナー
  vscode.window.onDidChangeWindowState((state) => {
    const isAutoSyncEnabled = vscode.workspace.getConfiguration(appName).get<boolean>("enableAutoSync", false);
    if (!isAutoSyncEnabled) {
      return;
    }
    if (state.focused) {
      const inactivityTimeoutSec = vscode.workspace.getConfiguration(appName).get<number>("inactivityTimeoutSec", 60);
      const now = Date.now();
      if (lastWindowActivationTime !== 0 && (now - lastWindowActivationTime) / 1000 > inactivityTimeoutSec) {
        vscode.commands.executeCommand("secureNotes.sync");
        logMessage(`ウィンドウ再アクティブ(${Math.round((now - lastWindowActivationTime) / 1000)}秒経過)のためSyncを実行しました。`);
      }
      lastWindowActivationTime = now;
    }
  });

  // ファイル保存リスナー
  vscode.workspace.onDidSaveTextDocument(() => {
    const isAutoSyncEnabled = vscode.workspace.getConfiguration(appName).get<boolean>("enableAutoSync", false);
    if (!isAutoSyncEnabled) {
      return;
    }
    if (saveSyncTimeout) {
      clearTimeout(saveSyncTimeout);
    }
    const saveSyncTimeoutSec = vscode.workspace.getConfiguration(appName).get<number>("saveSyncTimeoutSec", 5);
    saveSyncTimeout = setTimeout(() => {
      vscode.commands.executeCommand("secureNotes.sync");
      logMessage("ファイル保存後の遅延同期を実行しました。");
    }, saveSyncTimeoutSec * 1000);
  });
}

// --- Helper Functions ---

function commandWithKey(context: vscode.ExtensionContext, commandHandler: (encryptKey: string, ...args: any[]) => Promise<any>) {
  return async (...args: any[]) => {
    try {
      const encryptKey = await getAESKey(context);
      if (!encryptKey) {
        showError("AES Key not set");
        return;
      }
      await commandHandler(encryptKey, ...args);
    } catch (error: any) {
      showError(error.message);
    }
  };
}


// --- Activation ---

export async function activate(context: vscode.ExtensionContext) {
  showOutputTerminal(appName);
  showInfo(`${appName} Extension Activated`);

  // 依存性注入コンテナを初期化
  const container = ContainerBuilder.buildDefault(context);
  ServiceLocator.setContainer(container);

  // LocalObjectManagerを初期化してコンテナに登録
  try {
    const encryptKey = await getAESKey(context);
    if (encryptKey && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const localObjectManager = new LocalObjectManager(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        context,
        encryptKey
      );
      container.registerInstance(ServiceKeys.LOCAL_OBJECT_MANAGER, localObjectManager);
    }
  } catch (error) {
    logMessage(`Failed to initialize LocalObjectManager: ${error}`);
  }

  const branchProvider = ServiceLocator.getBranchProvider();
  vscode.window.createTreeView("secureNotes.branchList", { treeDataProvider: branchProvider });

  const indexHistoryProvider = new IndexHistoryProvider(context);
  vscode.window.createTreeView("secureNotes.indexHistory", { treeDataProvider: indexHistoryProvider });

  context.subscriptions.push(
    vscode.commands.registerCommand("secureNotes.initializeNewStorage", commandWithKey(context, (key) => handleInitializeNewRepository(context, branchProvider, key))),
    vscode.commands.registerCommand("secureNotes.importExistingStorage", commandWithKey(context, (key) => handleImportExistingRepository(context, branchProvider, key))),
    vscode.commands.registerCommand("secureNotes.sync", commandWithKey(context, (key) => handleSyncNotes(context, branchProvider, key))),
    vscode.commands.registerCommand("secureNotes.setAESKey", () => handleSetAESKey(context)),
    vscode.commands.registerCommand("secureNotes.generateAESKey", () => handleGenerateAESKey(context)),
    vscode.commands.registerCommand("secureNotes.copyAESKeyToClipboard", () => handleCopyAESKeyToClipboard(context)),
    vscode.commands.registerCommand("secureNotes.refreshAESKey", () => handleRefreshAESKey(context)),
    vscode.commands.registerCommand("secureNotes.insertCurrentTime", handleInsertCurrentTime),
    vscode.commands.registerCommand("secureNotes.createBranchFromIndex", commandWithKey(context, (key, item) => handleCreateBranchFromIndex(context, key, item, branchProvider))),
    vscode.commands.registerCommand("secureNotes.checkoutBranch", commandWithKey(context, (key, item) => handleCheckoutBranch(context, key, item))),
    vscode.commands.registerCommand('secureNotes.previewIndex', (indexFile: IndexFile) => {
      const content = JSON.stringify(indexFile, null, 2);
      vscode.workspace.openTextDocument({ content, language: 'json' })
        .then(doc => {
          vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        });
    })
  );

  // Auto-sync listeners
  setupAutoSyncListeners();

  registerManualSyncTestCommand(context);
}

export function deactivate() {
  if (saveSyncTimeout) {
    clearTimeout(saveSyncTimeout);
  }

  // 依存性注入コンテナを破棄
  ServiceLocator.dispose();

  logMessage(`${appName} Extension Deactivated.`);
}


export async function getAESKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const opUri = config.getOnePasswordUri();
  if (!opUri.startsWith("op://")) {
    return await context.secrets.get(aesEncryptionKey) || undefined;
  }

  const cachedKey = await context.secrets.get(aesEncryptionKey);
  const cachedTimeStr = await context.secrets.get(aesEncryptionKeyFetchedTime);
  const cacheTimeoutStr = config.getOnePasswordCacheTimeout();

  if (cachedKey && cachedTimeStr) {
    const cachedTime = parseInt(cachedTimeStr, 10);
    if (!isNaN(cachedTime) && Date.now() - cachedTime < parseTimeToMs(cacheTimeoutStr)) {
      return cachedKey;
    }
  }

  try {
    const opPath = which.sync("op");
    const opAccount = config.getOnePasswordAccount();
    const keyFrom1Password = await getKeyFrom1PasswordCLI(opPath, opAccount, opUri);
    if (keyFrom1Password && keyFrom1Password.length === 64) {
      await context.secrets.store(aesEncryptionKey, keyFrom1Password);
      await context.secrets.store(aesEncryptionKeyFetchedTime, Date.now().toString());
      return keyFrom1Password;
    }
  } catch (err: any) {
    logMessage(`Failed to get 1Password CLI path or retrieve key: ${String(err)}`);
  }

  return await context.secrets.get(aesEncryptionKey) || undefined;
}

function getKeyFrom1PasswordCLI(opPath: string, account: string, opUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = account ? ["--account", account, "read", opUri] : ["read", opUri];
    execFile(opPath, args, (error, stdout, stderr) => {
      if (error) {
        return reject(`Error running op CLI: ${error.message}, stderr: ${stderr}`);
      }
      const key = stdout.trim();
      if (!key) {
        return reject("op CLI returned empty string.");
      }
      resolve(key);
    });
  });
}

function parseTimeToMs(timeStr: string): number {
  const match = timeStr.match(/(\d+)([smhd])/);
  if (!match) {
    return 2592000000; // Default to 30 days
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return 2592000000;
  }
}
