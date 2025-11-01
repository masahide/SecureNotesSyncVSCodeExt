// storage/providers/GitHubSyncProvider.ts
import * as vscode from "vscode";
import * as path from "path";
import { IStorageProvider } from "./IStorageProvider";
import {
  logMessage,
  logMessageRed,
  logMessageGreen,
  logMessageBlue,
} from "../logger";
import * as fs from "fs";
import which from "which";
import { IFileSystem } from "./fileSystem";
import { IGitClient } from "./gitClient";
import { ISecureNotesLayoutManager } from "./layoutManager";

/**
 * GitHubSyncProvider
 *
 * 責務:
 *  - .secureNotes/remotes 直下を Git リポジトリとして操作
 *  - リモートの初期化、取得、更新、push などの Git I/O を担当
 *
 * 不変条件:
 *  - workspaceUri はコンストラクタ完了以降、常に有効で変更されない（readonly）
 */
export class GitHubSyncProvider implements IStorageProvider {
  private gitRemoteUrl: string;
  /**
   * workspaceUri はコンストラクタ完了以降、不変かつ常に有効。
   * 未指定の場合はテスト用のフォールバックディレクトリを設定する。
   */
  private readonly workspaceUri: vscode.Uri;
  private readonly fileSystem: IFileSystem;
  private readonly gitClient: IGitClient;
  private readonly layoutManager: ISecureNotesLayoutManager;

  constructor(
    gitRemoteUrl: string,
    workspaceUri: vscode.Uri,
    fileSystem: IFileSystem,
    gitClient: IGitClient,
    layoutManager: ISecureNotesLayoutManager,
  ) {
    this.gitRemoteUrl = gitRemoteUrl;
    if (!workspaceUri) {
      throw new Error("workspaceUri is required for GitHubSyncProvider");
    }
    this.workspaceUri = workspaceUri;
    this.fileSystem = fileSystem;
    this.gitClient = gitClient;
    this.layoutManager = layoutManager;
    const currentRemotesDirUri = this.getRemotesDirUri();
    logMessage(`remotesDirPath: ${currentRemotesDirUri.fsPath}`);
  }

  private getRemotesDirUri(): vscode.Uri {
    return this.layoutManager.getRemotesDirUri();
  }

  public async isInitialized(): Promise<boolean> {
    const objectDir = this.getRemotesDirUri().fsPath;
    return await this.isGitRepository(objectDir);
  }

  public async initialize(): Promise<void> {
    logMessage("=== Initializing repository ===");

    const { exists, isEmpty } = await this.getRemoteState();

    if (!exists) {
      logMessage("Remote repository does not exist. Initializing a new one.");
      await this.initializeNewRemoteRepository();
    } else if (isEmpty) {
      logMessage(
        "Remote repository is empty. Initializing for an empty remote.",
      );
      await this.initializeEmptyRemoteRepository();
      // 暗号化・アップロードは SyncService 側に移管（Provider では実施しない）
    } else {
      logMessageRed("Remote repository already exists and is not empty.");
      throw new Error(
        "Remote repository already exists. Use the 'Import Existing Repository' command instead.",
      );
    }
    logMessageGreen("=== Repository initialization complete ===");
  }

  /**
   * リモートリポジトリの状態（存在するか、空か）を取得します。
   * @returns {Promise<{exists: boolean, isEmpty: boolean}>}
   */
  private async getRemoteState(): Promise<{
    exists: boolean;
    isEmpty: boolean;
  }> {
    try {
      const result = await this.runGit(
        ["ls-remote", this.gitRemoteUrl],
        process.cwd(),
        true,
      );
      const output = result.stdout.trim();
      if (!output) {
        // `ls-remote` が成功しても出力が空の場合は、リポジトリは存在するが空であることを意味します。
        logMessage("Remote repository exists but is empty.");
        return { exists: true, isEmpty: true };
      }
      logMessage(
        `Remote repository has data. Branches: ${output.split("\n").length}`,
      );
      return { exists: true, isEmpty: false };
    } catch (error) {
      // `ls-remote` が失敗した場合、リモートリポジトリが存在しないと判断します。
      logMessage(`Remote repository does not exist: ${this.gitRemoteUrl}`);
      return { exists: false, isEmpty: true };
    }
  }

  /**
   * リモートリポジトリにデータが存在するかどうかを確認
   * @returns {Promise<boolean>} リモートリポジトリにデータが存在する場合はtrue
   */
  public async hasRemoteData(): Promise<boolean> {
    const { exists, isEmpty } = await this.getRemoteState();
    return exists && !isEmpty;
  }

  /**
   * 新規リモートリポジトリの初期化
   * ローカルでリポジトリを作成し、ワークスペースファイルを暗号化してリモートにプッシュ
   */
  public async initializeNewRemoteRepository(): Promise<void> {
    await this.layoutManager.prepareRemotesLayout({ clearExisting: true });
    const objectDir = this.getRemotesDirUri().fsPath;

    // Gitリポジトリを初期化
    await this.runGit(["init"], objectDir);
    await this.runGit(
      ["remote", "add", "origin", this.gitRemoteUrl],
      objectDir,
    );
    await this.runGit(["checkout", "-b", "main"], objectDir);
  }

  /**
   * 空のリモートリポジトリに対してローカルリポジトリを初期化
   */
  public async initializeEmptyRemoteRepository(): Promise<void> {
    await this.layoutManager.prepareRemotesLayout({ clearExisting: true });
    const objectDir = this.getRemotesDirUri().fsPath;

    // Gitリポジトリを初期化
    await this.runGit(["init"], objectDir);
    await this.runGit(
      ["remote", "add", "origin", this.gitRemoteUrl],
      objectDir,
    );

    // デフォルトブランチをmainに変更（古いGitバージョンとの互換性のため）
    try {
      await this.runGit(["checkout", "-b", "main"], objectDir);
    } catch (error) {
      // masterブランチが既に存在する場合はmainにリネーム
      try {
        await this.runGit(["branch", "-m", "master", "main"], objectDir);
      } catch (renameError) {
        logMessage(`ブランチ名の変更に失敗しました: ${renameError}`);
      }
    }

    logMessageGreen(
      "空のリモートリポジトリに対してローカルリポジトリを初期化しました。",
    );
  }

  /**
   * 既存リモートストレージをクローンする
   * ローカルにリポジトリが既に存在する場合、それを削除してクローンし直す
   * @returns {Promise<boolean>} クローンが成功した場合はtrue
   */
  public async cloneRemoteStorage(): Promise<boolean> {
    const { exists, isEmpty } = await this.getRemoteState();
    if (!exists || isEmpty) {
      throw new Error(
        "リモートストレージにデータが存在しません。新規ストレージを作成する場合は 'Initialize New Storage' を使用してください。",
      );
    }

    const remotesUri = this.getRemotesDirUri();
    const objectDir = remotesUri.fsPath;

    // 既存のローカルストレージがあれば削除
    try {
      await this.fileSystem.delete(remotesUri, {
        recursive: true,
        useTrash: false,
      });
      logMessage(
        `Removing existing local repository at ${objectDir} for re-cloning.`,
      );
    } catch {
      // ディレクトリが存在しない場合は無視
    }

    // ローカルストレージが存在しない場合はクローン
    try {
      const parentDir = path.dirname(objectDir);
      await this.fileSystem.createDirectory(vscode.Uri.file(parentDir));
      // クローン先ディレクトリの親ディレクトリで実行し、クローン先のディレクトリ名を指定
      await this.runGit(
        ["clone", this.gitRemoteUrl, path.basename(objectDir)],
        parentDir,
      );
      logMessageGreen("既存リモートストレージをクローンしました。");
      return true;
    } catch (error) {
      logMessage(`クローンに失敗しました: ${error}`);
      return false;
    }
  }

  /**
   * 既存のローカルリポジトリをリモートの変更で更新（pull）
   * @returns {Promise<boolean>} 更新があった場合はtrue
   */
  public async pullRemoteChanges(
    branchName: string = "main",
  ): Promise<boolean> {
    if (!(await this.isGitRepository(this.getRemotesDirUri().fsPath))) {
      logMessage("Local repository does not exist. Cannot pull changes.");
      return false;
    }

    try {
      const { beforeHash } = await this.syncBranchFromRemote(
        branchName,
        "pull",
      );
      const updated = await this.resetToRemote(branchName, beforeHash ?? "");
      if (updated) {
        logMessageGreen("既存ローカルストレージを更新しました。");
      } else {
        logMessage(
          `No remote updates detected for branch ${branchName}. Repository is up to date.`,
        );
      }
      return updated;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      logMessageRed(`既存ストレージの更新に失敗しました: ${message}`);
      throw new Error(
        `Failed to pull remote changes for ${branchName}: ${message}`,
      );
    }
  }

  /**
   * 空のリポジトリに対してワークスペースファイルを暗号化・アップロード
   */
  // 暗号化・アップロードは SyncService 側に移管

  /**
   * クローンしたリモートデータの読み込み・復号化・展開
   */
  // 復号化・展開は SyncService 側に移管

  /**
   * 新しい設計による同期処理
   * リモートリポジトリの存在確認から始めて、適切な処理フローを実行
   *
   * @param branchName 例: "main", "dev", ...
   * @returns {Promise<boolean>} リモートに更新があった場合はtrue、なかった場合はfalse
   */
  public async download(branchName: string): Promise<boolean> {
    logMessage("=== Starting sync process ===");

    if (!(await this.isInitialized())) {
      logMessageRed("Repository not initialized. Please initialize it first.");
      // Or, we could automatically call this.initialize() here.
      // For now, let's just return false.
      return false;
    }

    // Logic to download/pull changes from the remote repository.
    // This is a simplified version. The actual implementation would
    // involve fetching and merging the specified branch.
    try {
      const { objectDir } = await this.syncBranchFromRemote(
        branchName,
        "download",
      );
      await this.pullBranch(branchName, objectDir);
      logMessageGreen(`Successfully synced with remote branch: ${branchName}`);
      return true;
    } catch (error) {
      logMessageRed(`Error during sync: ${error}`);
      return false;
    }
  }

  /**
   * ローカルの変更をステージ&コミットし、指定ブランチをpush。
   * 差分がなければ push しない。
   *
   * @param branchName
   * @returns {Promise<boolean>} pushしたらtrue、差分なければfalse
   */
  public async upload(branchName: string): Promise<boolean> {
    const objectDir = this.getRemotesDirUri().fsPath;

    if (!(await this.isGitRepository(objectDir))) {
      logMessage("Gitリポジトリではありません。アップロードをスキップします。");
      return false;
    }

    await this.checkoutBranch(objectDir, branchName, true);
    await this.runGit(["add", "."], objectDir);

    const committed = await this.commitIfNeeded(objectDir, "commit");
    try {
      await this.publishChanges(branchName, objectDir);
      if (!committed) {
        logMessageBlue("差分がありません。アップロードは不要です。");
      }
      logMessageGreen(`${branchName}ブランチをリモートへpushしました。`);
      return committed;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      logMessageRed(`リモートpushに失敗しました: ${message}`);
      throw new Error(`Failed to push branch ${branchName}: ${message}`);
    }
  }

  /**
   * 指定ディレクトリがGitリポジトリかどうか
   */
  private async isGitRepository(dir: string): Promise<boolean> {
    try {
      await this.runGit(["rev-parse", "--is-inside-work-tree"], dir, true);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * createIfNotExist=trueの場合、指定ブランチが存在しなければ「git checkout -b branchName」で作成する。
   * 既にあれば「git checkout branchName」で移動する。
   * @param dir
   * @param branchName
   * @param createIfNotExist trueならローカルに存在しない場合に新規作成
   */
  private async checkoutBranch(
    dir: string,
    branchName: string,
    createIfNotExist: boolean,
  ): Promise<void> {
    const localBranchExists = await this.localBranchExists(dir, branchName);
    if (!localBranchExists && createIfNotExist) {
      // 新規ブランチ
      await this.runGit(["checkout", "-b", branchName], dir);
    } else {
      // 既存ブランチにcheckout
      await this.runGit(["checkout", branchName], dir);
    }
  }

  /**
   * ローカルにbranchNameというブランチが存在するかどうか
   */
  private async localBranchExists(
    dir: string,
    branchName: string,
  ): Promise<boolean> {
    try {
      const result = await this.runGit(
        ["rev-parse", "--verify", branchName],
        dir,
        true,
      );
      return !!result.stdout.trim();
    } catch {
      return false;
    }
  }

  /**
   * ステージ上に差分があればコミット（差分がなければ何もしない）
   * @returns {Promise<boolean>} コミットした場合はtrue
   */
  private async commitIfNeeded(dir: string, message: string): Promise<boolean> {
    // 差分チェック
    const statusResult = await this.runGit(["status", "--porcelain"], dir);
    if (!statusResult.stdout.trim()) {
      return false;
    }
    // コミット
    await this.runGit(["commit", "-m", message], dir);
    return true;
  }

  /**
   * 現在のコミットハッシュを取得
   */
  private async getCurrentCommitHash(dir: string): Promise<string> {
    try {
      const result = await this.runGit(["rev-parse", "HEAD"], dir, true);
      return result.stdout.trim();
    } catch (error) {
      logMessage(`Failed to get current commit hash: ${error}`);
      return "";
    }
  }

  /**
   * リモートブランチのコミットハッシュを取得
   */
  private async getRemoteCommitHash(
    dir: string,
    remoteBranch: string,
  ): Promise<string> {
    try {
      const result = await this.runGit(["rev-parse", remoteBranch], dir, true);
      return result.stdout.trim();
    } catch (error) {
      logMessage(
        `Failed to get remote commit hash for ${remoteBranch}: ${error}`,
      );
      return "";
    }
  }

  private async runGit(
    args: string[],
    cwd: string,
    silent: boolean = false,
  ): Promise<{ stdout: string; stderr: string }> {
    return this.gitClient.exec(args, { cwd, silent });
  }

  private async fetchRemote(branchName: string): Promise<void> {
    const objectDir = this.getRemotesDirUri().fsPath;
    await this.runGit(["fetch", "origin", branchName], objectDir);
  }

  private async resetToRemote(
    branchName: string,
    beforeHash: string,
  ): Promise<boolean> {
    const objectDir = this.getRemotesDirUri().fsPath;
    const remoteRef = `origin/${branchName}`;
    const afterHash = await this.getRemoteCommitHash(objectDir, remoteRef);
    logMessage(`Remote commit hash after fetch: ${afterHash}`);
    try {
      await this.runGit(["reset", "--hard", remoteRef], objectDir);
    } catch (error) {
      logMessage(`Failed to reset to ${remoteRef}: ${error}`);
      return false;
    }
    return !!afterHash && beforeHash !== afterHash;
  }

  private async publishChanges(branchName: string, cwd: string): Promise<void> {
    await this.runGit(["push", "origin", branchName], cwd);
  }

  private async pullBranch(branchName: string, cwd: string): Promise<void> {
    await this.runGit(["pull", "origin", branchName], cwd);
  }

  private async ensureBranchCheckedOut(
    dir: string,
    branchName: string,
  ): Promise<void> {
    const remoteRef = `origin/${branchName}`;
    const exists = await this.localBranchExists(dir, branchName);
    if (!exists) {
      await this.runGit(["checkout", "-b", branchName, remoteRef], dir);
    } else {
      await this.runGit(["checkout", branchName], dir);
    }
  }

  /**
   * リモートの最新状態を取得する前処理を集約。
   * モードに応じて fetch や checkout の有無を切り替える。
   */
  protected async syncBranchFromRemote(
    branchName: string,
    mode: "pull" | "download",
  ): Promise<{ objectDir: string; beforeHash?: string }> {
    const objectDir = this.getRemotesDirUri().fsPath;

    if (mode === "pull") {
      const beforeHash = await this.getCurrentCommitHash(objectDir);
      await this.fetchRemote(branchName);
      return { objectDir, beforeHash };
    }

    await this.fetchRemote(branchName);
    await this.ensureBranchCheckedOut(objectDir, branchName);
    return { objectDir };
  }
}

export function findGitExecutable(): string {
  let gitPath: string;

  // First, search for Git in PATH
  try {
    gitPath = which.sync("git");
    return gitPath;
  } catch (e) {
    // Git not found in PATH
  }

  // Define predefined paths based on platform
  const platform = process.platform;
  let predefinedPaths: string[];

  switch (platform) {
    case "win32": // Windows
      predefinedPaths = [
        "C:\\Program Files\\Git\\bin\\git.exe",
        "C:\\Git\\bin\\git.exe",
        "C:\\Windows\\System32\\git.exe",
      ];
      break;
    case "darwin": // macOS
      predefinedPaths = ["/usr/local/bin/git", "/usr/bin/git"];
      break;
    case "linux": // Linux
      predefinedPaths = ["/usr/local/bin/git", "/usr/bin/git", "/bin/git"];
      break;
    default:
      throw new Error(`Unsupported platform: ${platform} `);
  }

  // Search predefined paths
  for (const p of predefinedPaths) {
    if (fs.existsSync(p)) {
      gitPath = p;
      return gitPath;
    }
  }

  // If Git is not found, throw an error
  throw new Error("Git executable not found.");
}
