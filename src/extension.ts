import * as vscode from "vscode";
import * as os from "os";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { BranchTreeViewProvider } from "./BranchTreeViewProvider"; // new
import { LocalObjectManager, getCurrentBranchName, setCurrentBranchName } from "./storage/LocalObjectManager";
import { GitHubSyncProvider } from "./storage/GithubProvider";
import { IndexFile } from "./types";
import * as crypto from "crypto";
import { execFile } from "child_process";
import which from "which";

const aesEncryptionKey = "aesEncryptionKey";
const aesEncryptionKeyFetchedTime = "aesEncryptionKeyFetchedTime"; // キャッシュ時刻を保存するキー
const appName = "SecureNotesSync";

// タイムアウトIDを保持する変数
let inactivityTimeout: NodeJS.Timeout | undefined;
let lastWindowActivationTime = 0; // 前回ウィンドウがアクティブになった時刻を保存
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
  const setAESKeyCommand = vscode.commands.registerCommand(
    "extension.setAESKey",
    async () => {
      const secretValue = await vscode.window.showInputBox({
        prompt:
          "Enter AES Encryption Key (64 hex characters representing 32 bytes)",
        password: true,
        validateInput: (value) =>
          value.length === 64 ? null : "AES Key must be 64 hex characters long",
      });
      if (secretValue) {
        await context.secrets.store(aesEncryptionKey, secretValue);
        // キャッシュ時刻もクリアしておく
        await context.secrets.store(aesEncryptionKeyFetchedTime, "");
        showInfo(`${aesEncryptionKey} saved successfully.`);
      } else {
        showError(`${aesEncryptionKey} is required.`);
      }
    }
  );

  // 新規AESキーを生成するコマンド
  const generateAESKeyCommand = vscode.commands.registerCommand(
    "extension.generateAESKey",
    async () => {
      logMessage("Generating 32-byte AES encryption key...");
      const key = crypto.randomBytes(32).toString("hex"); // 32 bytes
      try {
        await context.secrets.store(aesEncryptionKey, key);
        // キャッシュ時刻も上書き
        await context.secrets.store(
          aesEncryptionKeyFetchedTime,
          Date.now().toString()
        );
        showInfo(`Generated and stored AES key: ${key}`);
      } catch (error: any) {
        showError(
          `Error generating encrypted text: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  );

  // ノートを同期するコマンド
  const syncCommand = vscode.commands.registerCommand(
    "extension.syncNotes",
    async () => {
      try {
        const encryptKey = await getAESKey(context); // ← ポイント：ここで getAESKey() を使う
        if (!encryptKey) {
          showError("AES Key not set");
          return false;
        }

        const gitRemoteUrl = vscode.workspace
          .getConfiguration(appName)
          .get<string>("gitRemoteUrl");
        if (!gitRemoteUrl) {
          showError("設定でGitHubリポジトリURLを設定してください。");
          return;
        }

        const options = { environmentId: environmentId, encryptionKey: encryptKey };
        const previousIndex = await LocalObjectManager.loadWsIndex(options);
        logMessage(`Loaded previous index file: ${previousIndex.uuid}`);
        let newLocalIndex = await LocalObjectManager.generateLocalIndexFile(
          previousIndex,
          options
        );
        showInfo("New local index file created.");

        const cloudStorageProvider = new GitHubSyncProvider(gitRemoteUrl);
        let updated = false;
        // 追加: 現在のブランチ名を取得 (HEADファイル or default: main)
        const currentBranch = await getCurrentBranchName();
        if (await cloudStorageProvider.download(currentBranch)) {
          // リモートに更新があった場合
          const remoteIndex = await LocalObjectManager.loadRemoteIndex(options);
          const conflicts = await LocalObjectManager.detectConflicts(
            newLocalIndex,
            remoteIndex
          );
          if (conflicts.length > 0) {
            const conflictsResolved = await LocalObjectManager.resolveConflicts(
              conflicts,
              options
            );
            if (!conflictsResolved) {
              showInfo("Sync aborted due to unresolved conflicts.");
              return true;
            }
          }
          // ローカルとリモートの変更をマージ
          logMessage("Merging local and remote changes...");
          newLocalIndex = await LocalObjectManager.generateLocalIndexFile(
            previousIndex,
            options
          );
          updated = true;
        }

        // 2) マージ後のファイルを暗号化保存
        updated =
          (await LocalObjectManager.saveEncryptedObjects(
            newLocalIndex.files,
            previousIndex,
            options
          )) || updated;

        if (updated) {
          // 3) 新しいインデックスを保存
          await LocalObjectManager.saveIndexFile(newLocalIndex, currentBranch, encryptKey);
          await LocalObjectManager.saveWsIndexFile(newLocalIndex, options);
          await LocalObjectManager.reflectFileChanges(previousIndex, newLocalIndex, options, false);
          branchProvider.refresh();

          // 4) GitHub に push
          await cloudStorageProvider.upload(currentBranch);
          showInfo("Merge completed successfully.");
          return true;
        }
      } catch (error: any) {
        showError(`Sync failed: ${error.message}`);
      }
      return false;
    }
  );

  // AESキーをクリップボードにコピー
  const copyAESKeyCommand = vscode.commands.registerCommand(
    "extension.copyAESKeyToClipboard",
    async () => {
      try {
        // 可能であれば、setAESKeyコマンドと同様に getAESKey(context) で取得してもOK
        const aesKey = await context.secrets.get(aesEncryptionKey);
        if (!aesKey) {
          vscode.window.showErrorMessage(
            "AES Key is not set. Please set the AES key first."
          );
          return;
        }
        await vscode.env.clipboard.writeText(aesKey);
        vscode.window.showInformationMessage("AES Key copied to clipboard!");
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to copy AES Key: ${error.message}`
        );
      }
    }
  );

  // New command to refresh the AES key from 1Password
  const refreshAESKeyCommand = vscode.commands.registerCommand(
    "extension.refreshAESKey",
    async () => {
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
    }
  );

  // Inside the activate function
  const insertCurrentTimeCommand = vscode.commands.registerCommand(
    "extension.insertCurrentTime",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active text editor.");
        return;
      }

      const date = new Date();
      const pad = (n: number) => (n < 10 ? "0" + n : n.toString());
      const formatted = `${date.getFullYear()}/${pad(
        date.getMonth() + 1
      )}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(
        date.getMinutes()
      )}`;

      const editOperations: vscode.TextEdit[] = editor.selections.map(
        (selection) => {
          return vscode.TextEdit.replace(selection, formatted);
        }
      );

      await editor.edit((editBuilder) => {
        editOperations.forEach((edit) =>
          editBuilder.replace(edit.range, edit.newText)
        );
      });
    }
  );

  // ウィンドウがアクティブになったとき → 前回アクティブから長時間経過している場合のみ sync 実行
  vscode.window.onDidChangeWindowState((state) => {
    const isAutoSyncEnabled = vscode.workspace
      .getConfiguration(appName)
      .get<boolean>("enableAutoSync", false);
    if (!isAutoSyncEnabled) {
      return;
    }
    if (state.focused) {
      const inactivityTimeoutSec = vscode.workspace
        .getConfiguration(appName)
        .get<number>("inactivityTimeoutSec", 60);
      const now = Date.now();
      if (lastWindowActivationTime === 0) {
        lastWindowActivationTime = now;
        return;
      }
      const diff = (now - lastWindowActivationTime) / 1000;
      if (diff > inactivityTimeoutSec) {
        vscode.commands.executeCommand("extension.syncNotes");
        logMessage(
          `ウィンドウ再アクティブ(${Math.round(
            diff
          )}秒経過)のためSyncを実行しました。`
        );
      }
      lastWindowActivationTime = now;
    }
  });

  // ファイル保存後 → 5秒後に sync 実行。5秒以内に再度保存されたらタイマーをリセット
  vscode.workspace.onDidSaveTextDocument(() => {
    const isAutoSyncEnabled = vscode.workspace
      .getConfiguration(appName)
      .get<boolean>("enableAutoSync", false);
    if (!isAutoSyncEnabled) {
      return;
    }
    if (saveSyncTimeout) {
      clearTimeout(saveSyncTimeout);
    }
    const saveSyncTimeoutSec = vscode.workspace
      .getConfiguration(appName)
      .get<number>("saveSyncTimeoutSec", 5);
    saveSyncTimeout = setTimeout(() => {
      vscode.commands.executeCommand("extension.syncNotes");
      logMessage("ファイル保存後の遅延同期を実行しました。");
    }, saveSyncTimeoutSec * 1000);
  });

  // 1) TreeView: secureNotesBranchesView
  const branchProvider = new BranchTreeViewProvider(context);
  vscode.window.createTreeView("secureNotesBranchesView", {
    treeDataProvider: branchProvider,
  });

  // 2) Command: createBranchFromIndex
  const createBranchFromIndex = vscode.commands.registerCommand(
    "extension.createBranchFromIndex",
    async (branchItem?: any) => {
      try {
        if (!branchItem || !branchItem.indexFile) {
          vscode.window.showErrorMessage("No index selected.");
          return;
        }
        const baseIndex = branchItem.indexFile as IndexFile;
        // Ask user for new branch name
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
        // 3) Create a new IndexFile that starts from baseIndex
        const newIndexFile: IndexFile = {
          uuid: baseIndex.uuid, // you can keep the same index or create a brand new
          environmentId: baseIndex.environmentId,
          parentUuids: baseIndex.parentUuids,
          files: baseIndex.files,
          timestamp: baseIndex.timestamp,
        };
        // Or if you truly want to "fork" it with a brand new UUID:
        //   newIndexFile.uuid = uuidv7();
        //   newIndexFile.parentUuids = [ baseIndex.uuid ];
        //   newIndexFile.files = baseIndex.files;
        //   newIndexFile.timestamp = Date.now();

        // 4) Write that index out to .secureNotes for the new branch
        const encryptKey = await getAESKey(context);
        if (!encryptKey) {
          return vscode.window.showErrorMessage("AES key not available.");
        }
        // If you want to keep exactly the same indexFile bits, just store that UUID in the new branch ref:
        await LocalObjectManager.saveBranchRef(
          newBranch,
          newIndexFile.uuid,
          encryptKey
        );

        vscode.window.showInformationMessage(
          `Created new branch '${newBranch}' from index UUID: ${newIndexFile.uuid}`
        );

        // Refresh the tree
        branchProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `createBranchFromIndex error: ${err.message}`
        );
      }
    }
  );

  // 3) Command: checkoutBranch
  const checkoutBranch = vscode.commands.registerCommand(
    "extension.checkoutBranch",
    async (branchItem?: any) => {
      try {
        if (!branchItem?.branchName) {
          vscode.window.showErrorMessage("No branch selected.");
          return;
        }
        const branchName = branchItem.branchName;
        const encryptKey = await getAESKey(context);
        if (!encryptKey) {
          vscode.window.showErrorMessage("AES Key is not set.");
          return;
        }
        // 4) Read the current top-of-branch index
        const latestIndexUuid = await LocalObjectManager.readBranchRef(
          branchName,
          encryptKey
        );
        if (!latestIndexUuid) {
          vscode.window.showErrorMessage(`Branch ${branchName} has no index.`);
          return;
        }
        const options = { environmentId: environmentId, encryptionKey: encryptKey };
        // 5) Load that index from .secureNotes
        const targetIndex = await LocalObjectManager.loadIndex(latestIndexUuid, options);
        // 6) Reflect those files in the workspace
        //    For "checkout", we can just do reflectFileChanges
        const currentWsIndex = await LocalObjectManager.loadWsIndex(options);
        // TODO: checkoutの場合は、ファイルの差分を取らずに上書きして、存在しないファイルは削除する必要がある
        await LocalObjectManager.reflectFileChanges(currentWsIndex, targetIndex, options, true);
        // 7) Update wsIndex.json to record that we have the new branch checked out
        await LocalObjectManager.saveWsIndexFile(targetIndex, options);

        // **ここで HEADファイルに選択したブランチを記録**
        await setCurrentBranchName(branchName);

        // Optionally store the current branch name in wsIndex or a separate field
        showInfo(`Checked out branch: ${branchName}`);
      } catch (err: any) {
        showError(`checkoutBranch error: ${err.message}`);
      }
    }
  );

  context.subscriptions.push(
    syncCommand,
    setAESKeyCommand,
    generateAESKeyCommand,
    copyAESKeyCommand,
    refreshAESKeyCommand,
    insertCurrentTimeCommand,
    createBranchFromIndex,
    checkoutBranch
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
async function getOrCreateEnvironmentId(
  context: vscode.ExtensionContext
): Promise<string> {
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
export async function getAESKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
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
  const cacheTimeoutStr = vscode.workspace
    .getConfiguration(appName)
    .get<string>("onePasswordCacheTimeout", "30d");
  if (cachedKey && cachedTimeStr) {
    const cachedTime = parseInt(cachedTimeStr, 10);
    const now = Date.now();
    if (
      !isNaN(cachedTime) &&
      now - cachedTime < parseTimeToMs(cacheTimeoutStr)
    ) {
      // Convert to milliseconds
      // Cache still valid
      return cachedKey;
    }
  }
  // 4) キャッシュが無い or 期限切れ → op CLI で取得する
  let keyFrom1Password: string | undefined;
  try {
    const opPath = which.sync("op"); // PATHからopを検索(見つからない場合はError)
    keyFrom1Password = await getKeyFrom1PasswordCLI(opPath, opAccount, opUri);
  } catch (err: any) {
    logMessage(
      `Failed to get 1Password CLI path or retrieve key: ${String(err)}`
    );
  }

  if (!keyFrom1Password || keyFrom1Password.length !== 64) {
    // 1Password から取得できなければ fallback
    const fallback = await context.secrets.get(aesEncryptionKey);
    return fallback || undefined;
  }

  // 5) 成功していればキャッシュに保存
  await context.secrets.store(aesEncryptionKey, keyFrom1Password);
  await context.secrets.store(
    aesEncryptionKeyFetchedTime,
    Date.now().toString()
  );
  return keyFrom1Password;
}

/**
 * op CLI を使って 1Password からキーを取得する
 */
function getKeyFrom1PasswordCLI(
  opPath: string,
  account: string,
  opUri: string
): Promise<string> {
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

function parseTimeToMs(timeStr: string): number {
  const timeUnitRegex = /(\d+)([smhd])/;
  const match = timeStr.match(timeUnitRegex);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 2592000000; // 30 days in milliseconds
    }
  } else {
    // Invalid format, default to 30 days
    return 2592000000;
  }
}
