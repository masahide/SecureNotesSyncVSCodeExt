import * as vscode from "vscode";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { decryptContent, encryptContent } from "./cryptoUtils";
import { streamToBuffer } from "./streamUtils";
import { logMessage } from "./logger";
import * as crypto from "crypto";

// ファイル情報を保持するインターフェース
interface FileEntry {
  path: string; // ファイルの相対パス
  hash: string; // ファイルのSHA-256ハッシュ値（暗号化前のデータに対して計算）
  timestamp: number; // ファイルの最終更新タイムスタンプ
}

// インデックスファイルの構造
interface IndexFile {
  uuid: string; // インデックスファイルのUUID（Version 7）
  parentUuid: string; // 親インデックスファイルのUUID
  files: FileEntry[]; // ファイル情報のリスト
  timestamp: number; // インデックスファイルの作成タイムスタンプ
}

// 競合情報を保持するインターフェース
interface Conflict {
  filePath: string; // 競合しているファイルのパス
  localHash: string; // ローカルファイルのハッシュ値
  remoteHash: string; // リモートファイルのハッシュ値
  localTimestamp: number; // ローカルファイルのタイムスタンプ
  remoteTimestamp: number; // リモートファイルのタイムスタンプ
}

interface S3InitializationResult {
  s3: S3Client;
  s3Bucket: string;
  s3PrefixPath: string;
  aesEncryptionKey: string;
}

// S3 パスを安全に結合するユーティリティ関数
function joinS3Path(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, "")) // 各パートの前後にあるスラッシュを削除
    .filter((part) => part.length > 0) // 空文字列を無視
    .join("/");
}

// HEAD ファイルを取得・復号し、最新のインデックスファイルの UUID を取得します。
export async function getHeadIndexUUID(initResult: S3InitializationResult): Promise<string> {
  const headKey = joinS3Path(initResult.s3PrefixPath, "HEAD"); // HEAD ファイルのキーに s3PrefixPath を適用

  try {
    const getObjectParams = {
      Bucket: initResult.s3Bucket,
      Key: headKey,
    };
    const data = await initResult.s3.send(new GetObjectCommand(getObjectParams));
    const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
    const decryptedContent = decryptContent(encryptedContent, initResult.aesEncryptionKey);

    const indexUUID = decryptedContent.toString().trim();
    return indexUUID;
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      // HEAD ファイルが存在しない場合、初回の同期と判断
      return "";
    } else {
      throw error;
    }
  }
}

// 指定された UUID のインデックスファイルを取得・復号します。
export async function getIndexFile(initResult: S3InitializationResult, indexUUID: string): Promise<IndexFile> {
  if (!indexUUID) {
    return {
      uuid: "",
      parentUuid: "",
      files: [],
      timestamp: 0,
    };
  }

  const indexKey = joinS3Path(initResult.s3PrefixPath, "indexes", indexUUID); // インデックスファイルのキーに s3PrefixPath を適用

  const getObjectParams = {
    Bucket: initResult.s3Bucket,
    Key: indexKey,
  };
  const data = await initResult.s3.send(new GetObjectCommand(getObjectParams));
  const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
  const decryptedContent = decryptContent(encryptedContent, initResult.aesEncryptionKey);

  const indexFile: IndexFile = JSON.parse(decryptedContent.toString());
  return indexFile;
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
export async function uploadFilesToS3(
  localFiles: FileEntry[],
  remoteIndex: IndexFile,
  initResult: S3InitializationResult
): Promise<boolean> {
  let uploaded = false;

  // リモートのファイルハッシュ値のセットを作成
  const remoteFileHashes = new Set(remoteIndex.files.map((file) => file.hash));

  for (const file of localFiles) {
    // s3PrefixPath を適用して S3 のキーを作成
    const s3Key = joinS3Path(initResult.s3PrefixPath, "files", file.hash);

    // ファイルがリモートインデックスに存在するか確認
    if (remoteFileHashes.has(file.hash)) {
      continue; // 既に存在する場合、アップロードをスキップ
    }

    // ファイルを読み込み
    const fileUri = vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), file.path);
    const fileContent = await vscode.workspace.fs.readFile(fileUri);

    // ファイルを暗号化
    const encryptedContent = encryptContent(fileContent, initResult.aesEncryptionKey);

    // S3 にアップロード
    const putObjectParams = {
      Bucket: initResult.s3Bucket,
      Key: s3Key,
      Body: encryptedContent,
    };
    await initResult.s3.send(new PutObjectCommand(putObjectParams));
    logMessage(`Uploaded file to S3: ${file.path} s3: ${s3Key}`);
    uploaded = true;
  }
  return uploaded;
}

async function checkIfObjectExists(initResult: S3InitializationResult, key: string): Promise<boolean> {
  try {
    const headParams = {
      Bucket: initResult.s3Bucket,
      Key: key,
    };
    await initResult.s3.send(new HeadObjectCommand(headParams));
    return true;
  } catch (error: any) {
    if (error.name === "NotFound") {
      return false;
    } else {
      throw error;
    }
  }
}

// インデックスファイルを暗号化し、S3 にアップロードします。新しいインデックスファイルの UUID を返します。
export async function encryptAndUploadIndexFile(indexFile: IndexFile, initResult: S3InitializationResult): Promise<string> {
  const indexContent = Buffer.from(JSON.stringify(indexFile), "utf-8");
  const encryptedContent = encryptContent(indexContent, initResult.aesEncryptionKey);

  // s3PrefixPath を適用してインデックスファイルのキーを作成
  const indexKey = joinS3Path(initResult.s3PrefixPath, "indexes", indexFile.uuid);

  const putObjectParams = {
    Bucket: initResult.s3Bucket,
    Key: indexKey,
    Body: encryptedContent,
  };
  await initResult.s3.send(new PutObjectCommand(putObjectParams));

  logMessage(`Uploaded new index file with UUID: ${indexFile.uuid}`);
  return indexFile.uuid;
}

// HEAD ファイルを新しいインデックスファイルの UUID で更新します。
export async function updateHeadFile(newIndexUUID: string, initResult: S3InitializationResult): Promise<void> {
  const headKey = joinS3Path(initResult.s3PrefixPath, "HEAD");
  const content = Buffer.from(newIndexUUID, "utf-8");
  const encryptedContent = encryptContent(content, initResult.aesEncryptionKey);

  const putObjectParams = {
    Bucket: initResult.s3Bucket,
    Key: headKey,
    Body: encryptedContent,
  };
  await initResult.s3.send(new PutObjectCommand(putObjectParams));

  logMessage(`Updated HEAD file with new index UUID: ${newIndexUUID}`);
}

// S3 クライアントと必要な設定を初期化します。
// 共通暗号化キーを取得します。
export async function initializeS3(context: vscode.ExtensionContext): Promise<S3InitializationResult> {
  const config = vscode.workspace.getConfiguration("encryptSyncS3");
  const awsAccessKeyId = config.get<string>("awsAccessKeyId");
  const awsSecretAccessKey = await context.secrets.get("awsSecretAccessKey");
  const s3Bucket = config.get<string>("s3Bucket");
  const s3Region = config.get<string>("s3Region");
  const s3Endpoint = config.get<string>("s3Endpoint");
  const s3PrefixPath = config.get<string>("s3PrefixPath") || "";
  const aesEncryptionKey = (await context.secrets.get("aesEncryptionKey"))!;

  if (!s3Bucket || !s3Region || !aesEncryptionKey) {
    throw new Error("S3 bucket, region, or AES key not set. Please configure the extension settings and credentials.");
  }

  const s3 = new S3Client({
    region: s3Region,
    endpoint: s3Endpoint,
    credentials:
      awsAccessKeyId && awsSecretAccessKey
        ? {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          }
        : undefined,
  });

  return { s3, s3Bucket, s3PrefixPath, aesEncryptionKey };
}

// ローカルのワークスペースからファイルリスト、ハッシュ値、タイムスタンプを取得し、インデックスファイルを生成します。
export async function generateLocalIndexFile(): Promise<IndexFile> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    throw new Error("No workspace folders found.");
  }

  const files: FileEntry[] = [];
  const previousIndex = await loadLocalIndexFile(); // 前回のローカルインデックスを読み込み
  const previousFileMap = new Map<string, FileEntry>();
  if (previousIndex) {
    for (const file of previousIndex.files) {
      previousFileMap.set(file.path, file);
    }
  }

  for (const folder of workspaceFolders) {
    const filesInFolder = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/*"),
      "**/node_modules/**,.encrypt-sync-index.json"
    );

    for (const fileUri of filesInFolder) {
      const stat = await vscode.workspace.fs.stat(fileUri);
      const relativePath = vscode.workspace.asRelativePath(fileUri, false);

      // 前回のインデックスに同じファイルがあるか確認
      const previousFileEntry = previousFileMap.get(relativePath);

      if (previousFileEntry && previousFileEntry.timestamp === stat.mtime) {
        // タイムスタンプが同じ場合、ハッシュ値を再利用
        files.push({
          path: relativePath,
          hash: previousFileEntry.hash,
          timestamp: stat.mtime,
        });
      } else {
        // タイムスタンプが異なる場合、ハッシュ値を再計算
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const hash = crypto.createHash("sha256").update(fileContent).digest("hex");

        files.push({
          path: relativePath,
          hash: hash,
          timestamp: stat.mtime,
        });
      }
    }
  }

  const indexFile: IndexFile = {
    uuid: "", // 新しいインデックスファイルを作成する際に設定
    parentUuid: "", // 後で設定
    files: files,
    timestamp: Date.now(),
  };

  // 新しいインデックスファイルをローカルに保存
  await saveLocalIndexFile(indexFile);

  return indexFile;
}

// ローカルとリモートのインデックスファイルを比較し、競合を検出します。
export function detectConflicts(localIndex: IndexFile, remoteIndex: IndexFile): Conflict[] {
  const conflicts: Conflict[] = [];

  const remoteFileMap = new Map<string, FileEntry>();
  for (const file of remoteIndex.files) {
    remoteFileMap.set(file.path, file);
  }

  for (const localFile of localIndex.files) {
    const remoteFile = remoteFileMap.get(localFile.path);
    if (remoteFile) {
      if (localFile.hash !== remoteFile.hash) {
        // ハッシュ値が異なる場合、競合と判断
        conflicts.push({
          filePath: localFile.path,
          localHash: localFile.hash,
          remoteHash: remoteFile.hash,
          localTimestamp: localFile.timestamp,
          remoteTimestamp: remoteFile.timestamp,
        });
      }
      // 比較後に削除
      remoteFileMap.delete(localFile.path);
    }
  }

  // ローカルに存在せず、リモートに存在するファイルも考慮
  for (const remoteFile of remoteFileMap.values()) {
    conflicts.push({
      filePath: remoteFile.path,
      localHash: "",
      remoteHash: remoteFile.hash,
      localTimestamp: 0,
      remoteTimestamp: remoteFile.timestamp,
    });
  }

  return conflicts;
}

// 検出された競合をユーザーに通知し、解決します。
export async function resolveConflicts(conflicts: Conflict[], initResult: S3InitializationResult): Promise<boolean> {
  for (const conflict of conflicts) {
    const choice = await vscode.window.showQuickPick(
      ["Keep Local Version", "Keep Remote Version", "Save Remote as Conflict File", "Abort Sync"],
      {
        placeHolder: `Conflict detected in file: ${conflict.filePath}`,
      }
    );

    if (choice === "Keep Local Version") {
      // ローカルの変更を適用（何もしない）
      continue;
    } else if (choice === "Keep Remote Version") {
      // リモートのファイルでローカルを上書き
      await overwriteLocalFileWithRemote(conflict.filePath, conflict.remoteHash, initResult);
    } else if (choice === "Save Remote as Conflict File") {
      // リモートのファイルを別名で保存
      await saveRemoteFileAsConflict(conflict.filePath, conflict.remoteHash, initResult);
    } else if (choice === "Abort Sync" || !choice) {
      // 同期を中止
      return false;
    }
  }
  return true;
}

// リモートのファイルでローカルを上書き
async function overwriteLocalFileWithRemote(filePath: string, fileHash: string, initResult: S3InitializationResult): Promise<void> {
  const s3Key = joinS3Path(initResult.s3PrefixPath, "files", fileHash); // ハッシュ値を使用してS3キーを作成

  try {
    const getObjectParams = {
      Bucket: initResult.s3Bucket,
      Key: s3Key,
    };
    const data = await initResult.s3.send(new GetObjectCommand(getObjectParams));
    const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
    const decryptedContent = decryptContent(encryptedContent, initResult.aesEncryptionKey);

    // ローカルファイルパスを取得
    const localUri = vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), filePath);

    // ローカルファイルをリモートの内容で上書き
    await vscode.workspace.fs.writeFile(localUri, decryptedContent);
    logMessage(`Overwrote local file with remote content: ${filePath}`);
  } catch (error: any) {
    logMessage(`Failed to overwrite local file: ${filePath}. Error: ${error.message}`);
    throw error;
  }
}

// リモートのファイルを別名で保存
async function saveRemoteFileAsConflict(filePath: string, fileHash: string, initResult: S3InitializationResult): Promise<void> {
  const s3Key = joinS3Path(initResult.s3PrefixPath, "files", fileHash); // ハッシュ値を使用してS3キーを作成

  try {
    const getObjectParams = {
      Bucket: initResult.s3Bucket,
      Key: s3Key,
    };
    const data = await initResult.s3.send(new GetObjectCommand(getObjectParams));
    const encryptedContent = await streamToBuffer(data.Body as NodeJS.ReadableStream);
    const decryptedContent = decryptContent(encryptedContent, initResult.aesEncryptionKey);

    // ワークスペースフォルダを取得
    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    if (!workspaceFolder) {
      throw new Error("No workspace folder found.");
    }

    // コンフリクト用のファイル名を生成（例: conflict-YYYYMMDD-HHmmss-ファイル名.ext）
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
    const conflictFileName = `conflict-${timestamp}-${filePath}`;

    // ローカルパスを取得し、コンフリクトファイルとして保存
    const localUri = vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), conflictFileName);
    await vscode.workspace.fs.writeFile(localUri, decryptedContent);

    logMessage(`Saved remote file as conflict file: ${conflictFileName}`);
  } catch (error: any) {
    logMessage(`Failed to save remote file as conflict: ${filePath}. Error: ${error.message}`);
    throw error;
  }
}

// 親の UUID を含む新しいインデックスファイルを作成します。
export function createNewIndexFile(localIndex: IndexFile, parentIndexUUID: string): IndexFile {
  // UUID Version 7 を生成（簡単のためにランダムなUUIDを生成）
  const newUUID = crypto.randomUUID();

  const newIndexFile: IndexFile = {
    uuid: newUUID,
    parentUuid: parentIndexUUID,
    files: localIndex.files,
    timestamp: Date.now(),
  };

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
  // ワークスペースのルートディレクトリに .encrypt-sync-index.json というファイル名で保存
  return vscode.Uri.joinPath(vscode.Uri.file(getRootPath()), ".encrypt-sync-index.json");
}
