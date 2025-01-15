import * as vscode from "vscode";
import * as os from "os";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { LocalObjectManager } from "./storage/LocalObjectManager";
import { GitHubSyncProvider } from "./storage/GithubProvider";
import * as crypto from "crypto";
import { execFile } from "child_process";
import which from "which";

const aesEncryptionKey = "aesEncryptionKey";
const aesEncryptionKeyFetchedTime = "aesEncryptionKeyFetchedTime";  // キャッシュ時刻を保存するキー
const appName = "SecureNotesSync";

// タイムアウトIDを保持する変数
let inactivityTimeout: NodeJS.Timeout | undefined;
let lastWindowActivationTime = 0;  // 前回ウィンドウがアクティブになった時刻を保存
// ファイル保存後に5秒遅延してsyncするためのタイマー
let saveSyncTimeout: NodeJS.Timeout | undefined;



export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  const outputChannel = vscode.window.createOutputChannel(appName);
  setOutputChannel(outputChannel);
  showInfo(`${appName} Extension Activated`);

  // 環境IDを生成or取得 (ホスト名 + UUID)
  const environmentId = await getOrCreateEnvironmentId(context);
  logMessage(`Current Environment ID: ${environmentId}`);

  // AESキーを設定するコマンド
  const setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKey", async () => {
    const secretValue = await vscode.window.showInputBox({
      prompt: "Enter AES Encryption Key (64 hex characters representing 32 bytes)",
      password: true,
      validateInput: (value) => value.length === 64 ? null : "AES Key must be 64 hex characters long"
    });
    if (secretValue) {
      await context.secrets.store(aesEncryptionKey, secretValue);
      // キャッシュ時刻もクリアしておく
      await context.secrets.store(aesEncryptionKeyFetchedTime, "");
      showInfo(`${aesEncryptionKey} saved successfully.`);
    } else {
      showError(`${aesEncryptionKey} is required.`);
    }
  });

  // 新規AESキーを生成するコマンド
  const generateAESKeyCommand = vscode.commands.registerCommand("extension.generateAESKey", async () => {
    logMessage("Generating 32-byte AES encryption key...");
    const key = crypto.randomBytes(32).toString("hex"); // 32 bytes
    try {
      await context.secrets.store(aesEncryptionKey, key);
      // キャッシュ時刻も上書き
      await context.secrets.store(aesEncryptionKeyFetchedTime, Date.now().toString());
      showInfo(`Generated and stored AES key: ${key}`);
    } catch (error: any) {
      showError(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // ノートを同期するコマンド
  const syncCommand = vscode.commands.registerCommand("extension.syncNotes", async () => {
    try {
      const encryptKey = await getAESKey(context);  // ← ポイント：ここで getAESKey() を使う
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

      // 2) マージ後のファイルを暗号化保存
      updated = await LocalObjectManager.saveEncryptedObjects(newLocalIndex.files, previousIndex, options) || updated;

      if (updated) {
        // 3) 新しいインデックスを保存
        await LocalObjectManager.saveIndexFile(newLocalIndex, options);
        await LocalObjectManager.saveWsIndexFile(newLocalIndex, options);
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

  // AESキーをクリップボードにコピー
  const copyAESKeyCommand = vscode.commands.registerCommand('extension.copyAESKeyToClipboard', async () => {
    try {
      // 可能であれば、setAESKeyコマンドと同様に getAESKey(context) で取得してもOK
      const aesKey = await context.secrets.get(aesEncryptionKey);
      if (!aesKey) {
        vscode.window.showErrorMessage('AES Key is not set. Please set the AES key first.');
        return;
      }
      await vscode.env.clipboard.writeText(aesKey);
      vscode.window.showInformationMessage('AES Key copied to clipboard!');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to copy AES Key: ${error.message}`);
    }
  });

  // New command to refresh the AES key from 1Password
  const refreshAESKeyCommand = vscode.commands.registerCommand("extension.refreshAESKey", async () => {
    try {
      // Invalidate the cached time
      await context.secrets.store(aesEncryptionKeyFetchedTime, "0");
      // Fetch the key again
      const newKey = await getAESKey(context);
      if (newKey) {
        showInfo("AES key refreshed successfully.");
      } else {
        showError("Failed to refresh AES key.");
      }
    } catch (error: any) {
      showError(`Error refreshing AES key: ${error.message}`);
    }
  });

  // Inside the activate function
  const insertCurrentTimeCommand = vscode.commands.registerCommand("extension.insertCurrentTime", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active text editor.');
      return;
    }

    const date = new Date();
    const pad = (n: number) => n < 10 ? '0' + n : n.toString();
    const formatted = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const editOperations: vscode.TextEdit[] = editor.selections.map(selection => {
      return vscode.TextEdit.replace(selection, formatted);
    });

    await editor.edit(editBuilder => {
      editOperations.forEach(edit => editBuilder.replace(edit.range, edit.newText));
    });
  });

  // ウィンドウがアクティブになったとき → 前回アクティブから長時間経過している場合のみ sync 実行
  vscode.window.onDidChangeWindowState((state) => {
    const isAutoSyncEnabled = vscode.workspace.getConfiguration(appName).get<boolean>("enableAutoSync", false);
    if (!isAutoSyncEnabled) {
      return;
    }
    if (state.focused) {
      const inactivityTimeoutSec = vscode.workspace.getConfiguration(appName).get<number>("inactivityTimeoutSec", 60);
      const now = Date.now();
      if (lastWindowActivationTime === 0) {
        // 拡張起動後に初めてアクティブになった場合
        lastWindowActivationTime = now;
        return;
      }
      const diff = (now - lastWindowActivationTime) / 1000;
      // 一定秒数以上アクティブでなかった場合のみsyncを実行して短時間での連続実行を防ぐ
      if (diff > inactivityTimeoutSec) {
        vscode.commands.executeCommand("extension.syncNotes");
        logMessage(`ウィンドウ再アクティブ(${diff}秒経過)のためSyncを実行しました。`);
      }
      lastWindowActivationTime = now;
    }
  });

  // ファイル保存後 → 5秒後に sync 実行。5秒以内に再度保存されたらタイマーをリセット
  vscode.workspace.onDidSaveTextDocument(() => {
    const isAutoSyncEnabled = vscode.workspace.getConfiguration(appName).get<boolean>("enableAutoSync", false);
    if (!isAutoSyncEnabled) {
      return;
    }
    if (saveSyncTimeout) {
      clearTimeout(saveSyncTimeout);
    }
    saveSyncTimeout = setTimeout(() => {
      vscode.commands.executeCommand("extension.syncNotes");
      logMessage("ファイル保存後の遅延同期を実行しました。");
    }, 5000);
  });


  context.subscriptions.push(
    syncCommand,
    setAESKeyCommand,
    generateAESKeyCommand,
    copyAESKeyCommand,
    refreshAESKeyCommand,
    insertCurrentTimeCommand,
  );
  outputChannel.show(true);
}

export function deactivate() {
  if (saveSyncTimeout) {
    clearTimeout(saveSyncTimeout);
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

/**
 * ユーザーの設定を確認しつつAESキーを取得する関数
 *  - 1Passwordのop:// URIが設定されている場合は、1日以内にキャッシュされたキーがあればそれを使用し、
 *    無ければ1Password CLIで取得してキャッシュする
 */
async function getAESKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  // 1) 設定をチェック
  const config = vscode.workspace.getConfiguration(appName);
  const opUri = config.get<string>("onePasswordUri") || "";
  const opAccount = config.get<string>("onePasswordAccount") || "";

  // 2) もし opUri に "op://" が含まれていなければ、従来通り secrets から取得
  if (!opUri.startsWith("op://")) {
    const existingKey = await context.secrets.get(aesEncryptionKey);
    return existingKey || undefined;
  }

  // 3) "op://" の場合はキャッシュをチェック
  const cachedKey = await context.secrets.get(aesEncryptionKey);
  const cachedTimeStr = await context.secrets.get(aesEncryptionKeyFetchedTime);
  if (cachedKey && cachedTimeStr) {
    const cachedTime = parseInt(cachedTimeStr, 10);
    const now = Date.now();
    if (!isNaN(cachedTime) && (now - cachedTime) < 86400000 * 30) { // 30 days
      // まだキャッシュ有効
      return cachedKey;
    }
  }

  // 4) キャッシュが無い or 期限切れ → op CLI で取得する
  let keyFrom1Password: string | undefined;
  try {
    const opPath = which.sync("op");  // PATHからopを検索(見つからない場合はError)
    keyFrom1Password = await getKeyFrom1PasswordCLI(opPath, opAccount, opUri);
  } catch (err: any) {
    logMessage(`Failed to get 1Password CLI path or retrieve key: ${String(err)}`);
  }

  if (!keyFrom1Password || keyFrom1Password.length !== 64) {
    // 1Password から取得できなければ fallback
    const fallback = await context.secrets.get(aesEncryptionKey);
    return fallback || undefined;
  }

  // 5) 成功していればキャッシュに保存
  await context.secrets.store(aesEncryptionKey, keyFrom1Password);
  await context.secrets.store(aesEncryptionKeyFetchedTime, Date.now().toString());
  return keyFrom1Password;
}

/**
 * op CLI を使って 1Password からキーを取得する
 */
function getKeyFrom1PasswordCLI(opPath: string, account: string, opUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // コマンド例:
    //    op --account myAccount read "op://Private/githubmemo/password"
    let args = ["--account", account, "read", opUri];
    if (account.length === 0) {
      args = ["read", opUri];
    }
    execFile(opPath, args, (error, stdout, stderr) => {
      if (error) {
        reject(`Error running op CLI: ${error.message}, stderr: ${stderr}`);
        return;
      }
      const key = stdout.trim();
      if (!key) {
        reject("op CLI returned empty string.");
      } else {
        resolve(key);
      }
    });
  });
}