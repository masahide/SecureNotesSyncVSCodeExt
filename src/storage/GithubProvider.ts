// storage/providers/GitHubSyncProvider.ts
import * as vscode from "vscode";
import { IStorageProvider } from './IStorageProvider';
import { remotesDirUri } from './LocalObjectManager';
import { showError, logMessage } from '../logger';
import * as cp from 'child_process';
import which from 'which';
import * as fs from 'fs';

export class GitHubSyncProvider implements IStorageProvider {
    private gitRemoteUrl: string;
    private gitPath: string;

    constructor(gitRemoteUrl: string) {
        this.gitRemoteUrl = gitRemoteUrl;
        this.gitPath = findGitExecutable();
    }

    // pull する
    // リモート側が更新されていない場合は false を返す
    // リモート側が更新されている場合は、強制的にlocalとマージして true を返す
    public async download(): Promise<boolean> {
        logMessage(`gitPath: ${this.gitPath}`);
        const objectDir = remotesDirUri.fsPath;
        // ディレクトリがGitリポジトリかどうかを確認
        const isGitRepo = await this.isGitRepository(objectDir);
        if (!isGitRepo) {
            // Gitリポジトリを初期化
            const gitattributesUri = vscode.Uri.joinPath(remotesDirUri, '.gitattributes');
            await vscode.workspace.fs.writeFile(gitattributesUri, new TextEncoder().encode('* binary'));
            await this.execCmd(this.gitPath, ['init'], objectDir);
            await this.execCmd(this.gitPath, ['remote', 'add', 'origin', this.gitRemoteUrl], objectDir);
            try {
                await this.execCmd(this.gitPath, ['fetch', 'origin'], objectDir);
                // 3) origin/main が存在するかチェック
                const originmain = await this.execCmd(this.gitPath, ['rev-parse', '--verify', 'origin/main'], objectDir);
                if (!originmain.stdout.trim()) {
                    throw new Error("origin/main が存在しません。");
                }
                // リモートに main がある場合 → main ブランチを作ってマージ
                await this.execCmd(this.gitPath, ['checkout', '-b', 'main'], objectDir);
                await this.execCmd(this.gitPath, ['add', '.'], objectDir);
                // --allow-unrelated-histories と -X theirs で強制マージ
                await this.execCmd(this.gitPath, [
                    'merge',
                    '--allow-unrelated-histories',
                    'origin/main',
                    '-X', 'theirs',
                    '-m', 'Merge remote main'
                ], objectDir);

                logMessage("初回リポジトリ作成後、リモートmainをマージしました。");
                return true;
            } catch (error) {
                logMessage("origin/main が存在しないため、mainブランチを新規作成します。error: " + error);
                // origin/main が無い（=空リポジトリ or 本当にブランチが無い）場合
                await this.execCmd(this.gitPath, ['checkout', '-b', 'main'], objectDir);
                // 空のままだとコミットできないので最低限のファイルをコミット
                await this.execCmd(this.gitPath, ['add', '.'], objectDir);
                await this.commitIfNeeded(objectDir, 'Initial commit');
                // リモートにpushしておく
                await this.execCmd(this.gitPath, ['push', '-u', 'origin', 'main'], objectDir);
                logMessage("初回リポジトリ作成後、remote main を新規作成してpushしました。");
                return false;
            }
        }
        // --- 既存リポジトリ ---
        // 1) mainブランチにチェックアウト
        await this.execCmd(this.gitPath, ['checkout', 'main'], objectDir);
        // 2) fetchしてリモートの更新を取得
        await this.execCmd(this.gitPath, ['fetch', 'origin'], objectDir);
        // 3) origin/main をマージ
        const localmain = await this.execCmd(this.gitPath, ['rev-parse', '--verify', 'main'], objectDir);
        const originmain = await this.execCmd(this.gitPath, ['rev-parse', '--verify', 'origin/main'], objectDir);
        if (localmain.stdout.trim() === originmain.stdout.trim()) {
            logMessage("リモートに更新はありません。");
            return false;
        }
        await this.execCmd(this.gitPath, [
            'merge',
            'origin/main',
            '-X', 'theirs',
            '--allow-unrelated-histories',
            '-m', 'Merge remote main'
        ], objectDir);
        logMessage("既存リポジトリでorigin/mainをマージしました。");
        return true;
    }
    // push する
    // ローカル側が更新されていない場合は false を返す
    // ローカル側が更新されている場合はpushして true を返す
    public async upload(): Promise<boolean> {
        logMessage(`gitPath: ${this.gitPath}`);
        const objectDir = remotesDirUri.fsPath;
        const isGitRepo = await this.isGitRepository(objectDir);
        if (!isGitRepo) {
            logMessage("Gitリポジトリではありません。アップロードをスキップします。");
            return false;
        }

        // 1) mainブランチをチェックアウト
        await this.execCmd(this.gitPath, ['checkout', 'main'], objectDir);
        // 3) 変更ファイルをステージング
        await this.execCmd(this.gitPath, ['add', '.'], objectDir);

        // 4) 差分があるか status --porcelain でチェック
        const statusResult = await this.execCmd(this.gitPath, ['status', '--porcelain'], objectDir);
        if (!statusResult.stdout.trim()) {
            logMessage("差分がありません。アップロードは不要です。");
            return false;
        }

        // 5) コミット
        await this.execCmd(this.gitPath, ['commit', '-m', 'commit'], objectDir);

        // 6) リモートへpush
        await this.execCmd(this.gitPath, ['push', 'origin', 'main'], objectDir);
        logMessage("mainブランチをリモートへpushしました。");
        return true;
    }

    // Gitコマンドを実行するヘルパー関数
    private async execCmd(cmd: string, args: string[], cwd: string): Promise<{ stdout: string, stderr: string }> {
        return new Promise((resolve, reject) => {
            cp.execFile(cmd, args, { cwd: cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`execFile error: ${cwd}> ${cmd} ${args.join(' ')} \nstdout: '${stdout}', stderr: '${stderr}'`));
                } else {
                    logMessage(`execFile: ${cwd}> ${cmd} ${args.join(' ')} `);
                    if (stdout !== '') { logMessage(`${stdout} `); }
                    if (stderr !== '') { logMessage(`Err:${stderr} `); }
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    // Check if a directory is a git repository
    private async isGitRepository(dir: string): Promise<boolean> {
        try {
            await this.execCmd(this.gitPath, ['rev-parse', '--is-inside-work-tree'], dir);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
 * ステージに上がっていればコミットする
 */
    private async commitIfNeeded(dir: string, message: string): Promise<void> {
        // 差分チェック
        const statusResult = await this.execCmd(this.gitPath, ['status', '--porcelain'], dir);
        if (!statusResult.stdout.trim()) {
            return;
        }
        // コミット
        await this.execCmd(this.gitPath, ['commit', '-m', message], dir);
    }
}

function findGitExecutable(): string {
    let gitPath: string;

    // First, search for Git in PATH
    try {
        gitPath = which.sync('git');
        return gitPath;
    } catch (e) {
        // Git not found in PATH
    }

    // Define predefined paths based on platform
    const platform = process.platform;
    let predefinedPaths: string[];

    switch (platform) {
        case 'win32': // Windows
            predefinedPaths = [
                'C:\\Program Files\\Git\\bin\\git.exe',
                'C:\\Git\\bin\\git.exe',
                'C:\\Windows\\System32\\git.exe'
            ];
            break;
        case 'darwin': // macOS
            predefinedPaths = [
                '/usr/local/bin/git',
                '/usr/bin/git'
            ];
            break;
        case 'linux': // Linux
            predefinedPaths = [
                '/usr/local/bin/git',
                '/usr/bin/git',
                '/bin/git'
            ];
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
    throw new Error('Git executable not found.');
}