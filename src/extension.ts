import * as vscode from "vscode";
import * as os from "os";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { LocalObjectManager } from "./storage/LocalObjectManager";
import { GitHubSyncProvider } from "./storage/GithubProvider";
import * as crypto from "crypto";



const aesEncryptionKey = "aesEncryptionKey";
const appName = "SecureNotesSync";

// タイムアウトIDを保持する変数
let inactivityTimeout: NodeJS.Timeout | undefined;

// 非アクティブタイマーをリセットする関数
function resetInactivityTimer() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  const inactivityTimeoutSec = vscode.workspace.getConfiguration(appName).get<number>('inactivityTimeoutSec');
  if (inactivityTimeoutSec === undefined) {
    return;
  }
  inactivityTimeout = setTimeout(() => {
    // 非アクティブ期間が経過したら同期コマンドを実行
    vscode.commands.executeCommand("extension.syncNotes");
    //vscode.commands.executeCommand("extension.syncWithGitHub");
    logMessage("非アクティブ状態が続いたため、同期コマンドを実行しました。");
  }, inactivityTimeoutSec * 1000);
}

// 設定を確認し、タイマーを開始または停止する関数
function manageInactivityTimer() {
  const isAutoSyncEnabled = vscode.workspace.getConfiguration(appName).get<boolean>("enableAutoSync", false);
  if (isAutoSyncEnabled) {
    // 設定が有効な場合、タイマーをリセット
    resetInactivityTimer();
    logMessage("自動同期が有効です。非アクティブタイマーを開始します。");
  } else {
    // 設定が無効な場合、タイマーをクリア
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = undefined;
      //logMessage("自動同期が無効です。非アクティブタイマーを停止します。");
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  const outputChannel = vscode.window.createOutputChannel(appName);
  setOutputChannel(outputChannel);
  showInfo(`${appName} Extension Activated`);

  // 環境IDを生成or取得 (ホスト名 + UUID)
  const environmentId = await getOrCreateEnvironmentId(context);
  logMessage(`Current Environment ID: ${environmentId}`);

  // Command to Set AES Key
  let setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKey", async () => {
    const secretValue = await vscode.window.showInputBox({
      prompt: "Enter AES Encryption Key (64 hex characters representing 32 bytes)",
      password: true,
      validateInput: (value) => value.length === 64 ? null : "AES Key must be 64 hex characters long"
    });
    if (secretValue) {
      await context.secrets.store(aesEncryptionKey, secretValue);
      showInfo(`${aesEncryptionKey} saved successfully.`);
    } else {
      showError(`${aesEncryptionKey} is required.`);
    }
  });

  // Command to Generate 32-Byte Encrypted Text
  let generateAESKeyCommand = vscode.commands.registerCommand("extension.generateAESKey", async () => {
    logMessage("Generating 32-byte AES encryption key...");
    const key = crypto.randomBytes(32).toString("hex"); // 32 bytes
    try {
      await context.secrets.store(aesEncryptionKey, key);
      showInfo(`Generated and stored AES key: ${key}`);
    } catch (error: any) {
      showError(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  let syncCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    try {
      const encryptKey = await context.secrets.get(aesEncryptionKey);
      if (!encryptKey) {
        showError("AES Key not set");
        return false;
      }
      const options = { environmentId: environmentId, encryptionKey: encryptKey };
      const gitRemoteUrl = vscode.workspace.getConfiguration(appName).get<string>('gitRemoteUrl');
      if (!gitRemoteUrl) {
        showError("設定でGitHubリポジトリURLを設定してください。");
        return;
      }

      const previousIndex = await LocalObjectManager.loadWsIndex(options);
      logMessage(`Loaded previous index file: ${previousIndex.uuid}`);
      let newLocalIndex = await LocalObjectManager.generateLocalIndexFile(previousIndex, options);
      showInfo("New local index file created.");
      const cloudStorageProvider = new GitHubSyncProvider(gitRemoteUrl);
      let updated = false;
      if (await cloudStorageProvider.download()) {
        // リモートに更新があった場合
        const remoteIndex = await LocalObjectManager.loadRemoteIndex(options);
        const conflicts = await LocalObjectManager.detectConflicts(newLocalIndex, remoteIndex);
        if (conflicts.length > 0) {
          const conflictsResolved = await LocalObjectManager.resolveConflicts(conflicts, options);
          if (!conflictsResolved) {
            showInfo("Sync aborted due to unresolved conflicts.");
            return true;
          }
        }
        // ローカルとリモートの変更をマージ
        logMessage("Merging local and remote changes...");
        newLocalIndex = await LocalObjectManager.generateLocalIndexFile(previousIndex, options);
        updated = true;
      }
      // 2) マージ後のファイルを暗号化保存（ローカルに新規や更新があれば書き込み）
      //   第二引数には「リモート(または直前の最新)のIndexFile」を渡すことで、すでにあるファイルを再アップしないようにする
      updated = await LocalObjectManager.saveEncryptedObjects(newLocalIndex.files, previousIndex, options) || updated;

      if (updated) {
        // 3) 新しいインデックスを .secureNotes/objects/indexes/ に暗号化保存
        await LocalObjectManager.saveIndexFile(newLocalIndex, options);
        //   あわせて wsIndex.json も更新しておく
        await LocalObjectManager.saveWsIndexFile(newLocalIndex, options);
        // 追加・削除をローカルに反映
        await LocalObjectManager.reflectFileChanges(previousIndex, newLocalIndex, options);

        // 4) GitHub に push
        await cloudStorageProvider.upload();
        showInfo("Merge completed successfully.");
        return true;
      }
    } catch (error: any) {
      showError(`Sync failed: ${error.message}`);
    }
    return false;
  });


  // AESキーをクリップボードにコピーするコマンド
  let copyAESKeyCommand = vscode.commands.registerCommand('extension.copyAESKeyToClipboard', async () => {
    try {
      // AESキーを取得
      const aesKey = await context.secrets.get(aesEncryptionKey);
      if (!aesKey) {
        vscode.window.showErrorMessage('AES Key is not set. Please set the AES key first.');
        return;
      }

      // クリップボードにコピー
      await vscode.env.clipboard.writeText(aesKey);

      // ユーザーに通知
      vscode.window.showInformationMessage('AES Key copied to clipboard!');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to copy AES Key: ${error.message}`);
    }
  });


  // ユーザーアクティビティのイベントハンドラーを登録
  const userActivityEvents = [
    vscode.window.onDidChangeActiveTextEditor,
    vscode.workspace.onDidChangeTextDocument,
    vscode.workspace.onDidSaveTextDocument,
    vscode.window.onDidChangeVisibleTextEditors,
    vscode.window.onDidChangeActiveNotebookEditor,
    vscode.window.onDidChangeActiveTerminal,
    vscode.window.onDidChangeWindowState,
  ];

  // イベントを監視し、アクティビティがあったらタイマーをリセット
  const disposables = userActivityEvents.map(event => event(() => {
    if (vscode.workspace.getConfiguration(appName).get<boolean>("enableAutoSync", false)) {
      resetInactivityTimer();
    }
  }));

  // 設定変更を監視するイベントハンドラー
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(`${appName}.enableAutoSync`)) {
      manageInactivityTimer();
    }
  });

  // 初期状態でタイマーを管理
  manageInactivityTimer();

  context.subscriptions.push(
    syncCommand, setAESKeyCommand, generateAESKeyCommand,
    configChangeDisposable,
    copyAESKeyCommand,
    ...disposables
  );
  outputChannel.show(true);
}

export function deactivate() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  logMessage(`${appName} Extension Deactivated.`);
}


const ENV_ID_KEY = "encryptSyncEnvironmentId";
async function getOrCreateEnvironmentId(context: vscode.ExtensionContext): Promise<string> {
  let envId = context.globalState.get<string>(ENV_ID_KEY);
  if (!envId) {
    const hostname = os.hostname();
    envId = `${hostname}-${crypto.randomUUID()}`;
    await context.globalState.update(ENV_ID_KEY, envId);
  }
  return envId;
}
