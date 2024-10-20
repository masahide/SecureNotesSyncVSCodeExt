// VSCode Extension for Memo Note-Taking App with S3 Integration
import * as vscode from "vscode";
import { createConfigFile, loadConfig } from "./dotdir/config";
import { IndexFile, FileEntry, Conflict, RemoteStorage } from "./storage/storage";
import { logMessage, showInfo, showError, setOutputChannel } from "./logger";
import { setSecret, storeSecret } from "./secretManager";
import * as crypto from "crypto";
import { S3Storage } from "./storage/s3";

const dotDir = ".memo";

export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  const outputChannel = vscode.window.createOutputChannel("MemoSyncS3");
  setOutputChannel(outputChannel);
  showInfo("MemoSyncS3 Extension Activated");

  let createConfigCommand = vscode.commands.registerCommand("extension.createConfig", async () => {
    await createConfigFile(dotDir);
  });

  // Command to Set AES Key
  let setAESKeyCommand = vscode.commands.registerCommand("extension.setAESKey", async () => {
    const config = await loadConfig(dotDir);
    setSecret(context, config, "Enter AES Encryption Key (64 hex characters representing 32 bytes)", (value) =>
      value.length === 64 ? null : "AES Key must be 64 hex characters long"
    );
  });

  // Command to Create New Memo Repository
  let createRepository = vscode.commands.registerCommand("extension.createRepository", async () => {
    try {
      const config = await loadConfig(dotDir);
      // Generate initial index and upload
      const storage = new S3Storage();
      await storage.initialize(context, config);
      const initialIndex = await generateLocalIndexFile("", crypto.randomUUID()); // No parentUuid or nextUuid for initial index

      // Encrypt and upload initial index file
      await storage.uploadIndexFile(initialIndex);

      // Update HEAD file
      await storage.updateHeadFile(initialIndex.uuid);

      // Save local index file
      await saveLocalIndexFile(initialIndex);

      showInfo("New Memo Repository created and initial sync completed.");
    } catch (error: any) {
      showError(`Error creating new memo repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Sync Memo Repository
  let syncCommand = vscode.commands.registerCommand("extension.sync", async () => {
    try {
      logMessage("Starting synchronization with remote storage...");

      const config = await loadConfig(dotDir);
      // Generate initial index and upload
      const storage = new S3Storage();
      await storage.initialize(context, config);

      // Load local index file
      const localIndex = await loadLocalIndexFile();
      if (!localIndex) {
        showError("Local index file not found. Please initialize the repository first.");
        return;
      }

      // Get remote HEAD index UUID
      const remoteHeadUuid = await storage.getHeadIndexUuid();
      if (!remoteHeadUuid) {
        showError("Remote repository not found or empty.");
        return;
      }
      // Get remote index file
      const remoteIndex = await storage.downloadIndexFile(remoteHeadUuid);
      if (!remoteIndex) {
        showError("Failed to download remote index file.");
        return;
      }
      // Generate new local index file
      const newLocalIndex = await generateLocalIndexFile(localIndex.uuid, crypto.randomUUID()); // parentUuid is local index's uuid

      // Detect conflicts
      const conflicts = detectConflicts(localIndex, remoteIndex, newLocalIndex);

      if (conflicts.length > 0) {
        const conflictsResolved = await resolveConflicts(conflicts, storage);
        if (!conflictsResolved) {
          showInfo("Sync aborted due to unresolved conflicts.");
          return;
        }
      }

      // Download and decrypt new or updated files from remote
      await downloadAndDecryptFiles(remoteIndex.files, localIndex.files, storage);

      // Apply deletions from remote
      await applyDeletions(remoteIndex);

      // Upload new or changed files to storage
      const filesToUpload = getFilesToUpload(newLocalIndex, remoteIndex);
      const uploaded = await uploadFilesToS3(filesToUpload, storage);

      // Create new index file with proper nextUuid
      const newIndex = createNewIndexFile(newLocalIndex, remoteIndex.uuid);

      // Encrypt and upload new index file with conditional Put
      const indexUploaded = await storage.uploadIndexFile(newIndex);
      if (!indexUploaded) {
        showError("Index upload failed due to conflict. Please try syncing again.");
        return;
      }

      // Update HEAD file
      await storage.updateHeadFile(newIndex.uuid);

      // Save new local index file
      await saveLocalIndexFile(newIndex);

      showInfo("Notes synced with Remote storage successfully.");
    } catch (error: any) {
      showError(`Error syncing notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Initialize Memo Repository from Remote
  let initializeFromRemoteCommand = vscode.commands.registerCommand("extension.initializeFromRemote", async () => {
    try {
      logMessage("Initializing memo repository from remote...");

      const config = await loadConfig(dotDir);
      // Generate initial index and upload
      const storage = new S3Storage();
      await storage.initialize(context, config);

      // Get remote HEAD index UUID
      const remoteHeadUuid = await storage.getHeadIndexUuid();
      if (!remoteHeadUuid) {
        showError("Remote repository not found or empty.");
        return;
      }
      // Get remote index file
      const remoteIndex = await storage.downloadIndexFile(remoteHeadUuid);
      if (!remoteIndex) {
        showError("Failed to download remote index file.");
        return;
      }

      // Download and decrypt all files from remote
      await downloadAndDecryptFiles(remoteIndex.files, [], storage);

      // Save remote index as local index
      await saveLocalIndexFile(remoteIndex);

      showInfo("Initialized memo repository from remote successfully.");
    } catch (error: any) {
      showError(`Error initializing from remote: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Command to Generate 32-Byte Encrypted Text
  let generateEncryptedTextCommand = vscode.commands.registerCommand("extension.generateEncryptedText", async () => {
    logMessage("Generating 32-byte AES encryption key...");
    const key = crypto.randomBytes(32).toString("hex"); // 32 bytes
    try {
      const config = await loadConfig(dotDir);
      await storeSecret(context, config, key);
      showInfo(`Generated and stored AES key: ${key}`);
    } catch (error: any) {
      showError(`Error generating encrypted text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(
    createConfigCommand,
    setAESKeyCommand,
    createRepository,
    syncCommand,
    initializeFromRemoteCommand,
    generateEncryptedTextCommand
  );

  // Show the output channel when the extension is activated
  outputChannel.show(true);
}

export function deactivate() {
  logMessage("MemoSyncS3 Extension Deactivated.");
}

// ワークスペースフォルダを取得
function getRootPath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
  if (!workspaceFolder) {
    throw new Error("No workspace folder found.");
  }
  return workspaceFolder;
}

// 新規または変更されたファイルを暗号化し、S3 にアップロードします。
async function uploadFilesToS3(localFiles: FileEntry[], storage: RemoteStorage): Promise<boolean> {
  let uploaded = false;

  for (const file of localFiles) {
    // ファイルを読み込み
    const fileUri = vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), file.path);
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    try {
      await storage.uploadFile(file.hash, fileContent);
      logMessage(`Uploaded file:${file.path}`);
      uploaded = true;
    } catch (error: any) {
      if (error.name === "PreconditionFailed") {
        logMessage(`File already exists on S3: ${file.path}`);
        continue;
      } else {
        throw error;
      }
    }
  }
  return uploaded;
}

// ローカルのワークスペースからファイルリスト、ハッシュ値、タイムスタンプを取得し、インデックスファイルを生成します。
async function generateLocalIndexFile(parentUuid: string, nextUuid: string): Promise<IndexFile> {
  const files: FileEntry[] = [];
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    throw new Error("No workspace folders found.");
  }

  for (const folder of workspaceFolders) {
    const filesInFolder = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"), "{**/node_modules/**,.memo/**}");

    for (const fileUri of filesInFolder) {
      const stat = await vscode.workspace.fs.stat(fileUri);
      const relativePath = vscode.workspace.asRelativePath(fileUri, false);

      // ファイルを読み込み
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      const hash = crypto.createHash("sha256").update(fileContent).digest("hex");

      // ファイル情報をリストに追加
      files.push({
        path: relativePath,
        hash: hash,
        timestamp: stat.mtime,
      });
    }
  }

  const indexFile: IndexFile = {
    uuid: "", // 新しいインデックスファイルを作成する際に設定
    parentUuid: parentUuid,
    nextUuid: nextUuid,
    files: files,
    timestamp: Date.now(),
  };

  return indexFile;
}

// ローカルとリモートのインデックスファイルを比較し、競合を検出します。
function detectConflicts(localIndex: IndexFile, remoteIndex: IndexFile, newLocalIndex: IndexFile): Conflict[] {
  const conflicts: Conflict[] = [];

  const localFileMap = new Map<string, FileEntry>();
  for (const file of localIndex.files) {
    localFileMap.set(file.path, file);
  }

  const remoteFileMap = new Map<string, FileEntry>();
  for (const file of remoteIndex.files) {
    remoteFileMap.set(file.path, file);
  }

  for (const newLocalFile of newLocalIndex.files) {
    const localFile = localFileMap.get(newLocalFile.path);
    const remoteFile = remoteFileMap.get(newLocalFile.path);

    if (localFile && remoteFile && localFile.hash !== newLocalFile.hash && remoteFile.hash !== newLocalFile.hash) {
      conflicts.push({
        filePath: newLocalFile.path,
        localHash: newLocalFile.hash,
        remoteHash: remoteFile.hash,
        localTimestamp: newLocalFile.timestamp,
        remoteTimestamp: remoteFile.timestamp,
      });
    }
  }

  return conflicts;
}

// 競合を解決します。
async function resolveConflicts(conflicts: Conflict[], initResult: RemoteStorage): Promise<boolean> {
  for (const conflict of conflicts) {
    const choice = await vscode.window.showQuickPick(["Keep Local Version", "Keep Remote Version", "Manually Merge", "Abort Sync"], {
      placeHolder: `Conflict detected in file: ${conflict.filePath}`,
    });

    if (choice === "Keep Local Version") {
      // ローカルの変更を保持（リモートファイルを上書き）
      continue;
    } else if (choice === "Keep Remote Version") {
      // リモートのファイルでローカルを上書き
      await fetchDecryptAndSaveFile(conflict.filePath, conflict.localHash, initResult);
    } else if (choice === "Manually Merge") {
      // 手動でマージ（リモートのファイルを別名で保存）
      await saveRemoteFileAsConflict(conflict.filePath, conflict.remoteHash, initResult);
    } else if (choice === "Abort Sync" || !choice) {
      // 同期を中止
      return false;
    }
  }
  return true;
}

// リモートのファイルを別名で保存
async function saveRemoteFileAsConflict(filePath: string, fileHash: string, initResult: RemoteStorage): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
  const conflictFileName = `${filePath}.conflict_${timestamp}`;

  await fetchDecryptAndSaveFile(conflictFileName, fileHash, initResult);
  logMessage(`Saved remote file as conflict file: ${conflictFileName}`);
}

// S3からファイルを取得し、復号化してローカルに保存
async function fetchDecryptAndSaveFile(filePath: string, fileHash: string, storage: RemoteStorage): Promise<void> {
  try {
    const data = await storage.downloadFile(fileHash);
    // ローカルファイルパスを取得
    const localUri = vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), filePath);
    // ローカルファイルに保存
    await vscode.workspace.fs.writeFile(localUri, data);
    logMessage(`Saved remote file to local path: ${filePath}`);
  } catch (error: any) {
    logMessage(`Failed to save remote file to local path: ${filePath}. Error: ${error.message}`);
    throw error;
  }
}

// 親の UUID を含む新しいインデックスファイルを作成します。
function createNewIndexFile(localIndex: IndexFile, parentIndexUUID: string): IndexFile {
  const newUUID = crypto.randomUUID();
  const newIndexFile: IndexFile = {
    uuid: newUUID,
    parentUuid: parentIndexUUID,
    nextUuid: "", // 次のインデックスが生成されたときに設定
    files: localIndex.files,
    timestamp: Date.now(),
  };

  // 親インデックスの nextUuid を新しいインデックスの UUID に設定
  localIndex.nextUuid = newUUID;

  return newIndexFile;
}

// 前回のインデックスファイルを読み込む関数
async function loadLocalIndexFile(): Promise<IndexFile | null> {
  const indexUri = getLocalIndexFilePath();
  try {
    const indexContent = await vscode.workspace.fs.readFile(indexUri);
    const indexFile: IndexFile = JSON.parse(Buffer.from(indexContent).toString("utf-8"));
    return indexFile;
  } catch (error) {
    // ファイルが存在しない場合や読み込みエラーの場合は null を返す
    return null;
  }
}

// 新しいインデックスファイルをローカルに保存する関数
async function saveLocalIndexFile(indexFile: IndexFile): Promise<void> {
  const indexUri = getLocalIndexFilePath();
  const indexContent = Buffer.from(JSON.stringify(indexFile), "utf-8");
  await vscode.workspace.fs.writeFile(indexUri, indexContent);
}

// ローカルインデックスファイルのパスを取得する
function getLocalIndexFilePath(): vscode.Uri {
  return vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), dotDir, "local_index.json");
}

// リモートの削除をローカルに適用
async function applyDeletions(indexFile: IndexFile): Promise<void> {
  for (const file of indexFile.files) {
    if (file.deleted) {
      const fileUri = vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), file.path);
      try {
        await vscode.workspace.fs.delete(fileUri);
        logMessage(`Deleted local file: ${file.path}`);
      } catch (error) {
        // ファイルが存在しない場合や削除エラーは無視
        if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
          continue;
        }
        logMessage(`Failed to delete local file: ${file.path}, error: ${error}`);
      }
    }
  }
}

// 新規または変更されたファイルのリストを取得
function getFilesToUpload(newLocalIndex: IndexFile, remoteIndex: IndexFile): FileEntry[] {
  const filesToUpload: FileEntry[] = [];

  const remoteFileMap = new Map<string, FileEntry>();
  for (const file of remoteIndex.files) {
    remoteFileMap.set(file.path, file);
  }

  for (const file of newLocalIndex.files) {
    if (file.deleted) {
      continue;
    }

    const remoteFile = remoteFileMap.get(file.path);
    if (!remoteFile || remoteFile.hash !== file.hash) {
      filesToUpload.push(file);
    }
  }

  return filesToUpload;
}

// リモートからファイルをダウンロードして復号化
async function downloadAndDecryptFiles(remoteFiles: FileEntry[], localFiles: FileEntry[], initResult: RemoteStorage): Promise<void> {
  const localFileMap = new Map<string, FileEntry>();
  for (const file of localFiles) {
    localFileMap.set(file.path, file);
  }

  for (const remoteFile of remoteFiles) {
    if (remoteFile.deleted) {
      continue; // 削除されたファイルはダウンロードしない
    }

    const localFile = localFileMap.get(remoteFile.path);

    // ローカルに同じファイルがあり、ハッシュ値が同じ場合はスキップ
    if (localFile && localFile.hash === remoteFile.hash) {
      continue;
    }

    // ファイルをダウンロードして復号化
    await fetchDecryptAndSaveFile(remoteFile.path, remoteFile.hash, initResult);
    logMessage(`Downloaded and decrypted file: ${remoteFile.path}`);
  }
}
