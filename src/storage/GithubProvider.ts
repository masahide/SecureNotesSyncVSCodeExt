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
            await this.execCmd(this.gitPath, ['fetch', 'origin'], objectDir);
            // Check if 'main' local exists on remote
            const checkMainBranch = await this.execCmd(this.gitPath, ['ls-remote', '--heads', 'origin', 'main'], objectDir);
            await this.execCmd(this.gitPath, ['add', '.'], objectDir);
            await this.execCmd(this.gitPath, ['commit', '-m', 'add'], objectDir);
            if (checkMainBranch.stdout.trim() === '') { // remoteが空の場合はpush
                await this.execCmd(this.gitPath, ['branch', '-M', 'main'], objectDir);
                await this.execCmd(this.gitPath, ['push', 'origin', 'main'], objectDir);
                await this.execCmd(this.gitPath, ['checkout', '-b', 'local'], objectDir);
                return false;
            }
            // 強制的にオブジェクトディレクトリとマージ
            await this.execCmd(this.gitPath, ['branch', '-M', 'backup'], objectDir);
            await this.execCmd(this.gitPath, ['fetch', 'origin', 'main'], objectDir);
            await this.execCmd(this.gitPath, ['checkout', 'main'], objectDir);
            // 強制マージ
            // -X ours でmain(リモート側)を優先
            await this.execCmd(this.gitPath, ['merge', 'backup', '--allow-unrelated-histories', '-X', 'ours', '-m', 'force merge'], objectDir);
            await this.execCmd(this.gitPath, ['branch', '-D', 'backup'], objectDir);
            await this.execCmd(this.gitPath, ['checkout', '-b', 'local'], objectDir);
            logMessage("オブジェクトディレクトリをGitHubと強制マージしました");
            return true;
        }
        await this.execCmd(this.gitPath, ['checkout', 'main'], objectDir);
        const orgHash = await this.execCmd(this.gitPath, ['rev-parse', 'main'], objectDir);
        await this.execCmd(this.gitPath, ['pull', 'origin', 'main'], objectDir);
        const newHash = await this.execCmd(this.gitPath, ['rev-parse', 'main'], objectDir);
        if (orgHash.stdout.trim() === newHash.stdout.trim()) {
            logMessage("変更がありません。");
            await this.execCmd(this.gitPath, ['checkout', 'local'], objectDir);
            return false;
        }
        await this.execCmd(this.gitPath, ['merge', 'local', '-X', 'ours', '-m', 'merge local'], objectDir);
        await this.execCmd(this.gitPath, ['branch', '-D', 'local'], objectDir);
        await this.execCmd(this.gitPath, ['checkout', '-b', 'local'], objectDir);
        return true;
    }
    // push する
    // ローカル側が更新されていない場合は false を返す
    // ローカル側が更新されている場合はpushして true を返す
    public async upload(): Promise<boolean> {
        logMessage(`gitPath: ${this.gitPath}`);
        const objectDir = remotesDirUri.fsPath;
        const branch = await this.execCmd(this.gitPath, ['branch', '--show-current'], objectDir);
        if (branch.stdout.trim() !== 'local') {
            await this.execCmd(this.gitPath, ['checkout', 'local'], objectDir);
        }
        await this.execCmd(this.gitPath, ['add', '.'], objectDir);
        try {
            await this.execCmd(this.gitPath, ['diff', '--cached', '--quiet'], objectDir);
            logMessage("変更がありません。");
            return false;
        } catch { }
        try {
            await this.execCmd(this.gitPath, ['commit', '-m', 'commit'], objectDir);
        } catch {
            logMessage("commitに失敗しました。");
            await this.execCmd(this.gitPath, ['reset', '--soft', 'HEAD'], objectDir);
            return false;
        }
        await this.execCmd(this.gitPath, ['checkout', 'main'], objectDir);
        const orgHash = await this.execCmd(this.gitPath, ['rev-parse', 'main'], objectDir);
        try {
            // ローカルの変更をmainにマージしてリモートにpush
            await this.execCmd(this.gitPath, ['merge', 'local'], objectDir);
            await this.execCmd(this.gitPath, ['push', 'origin', 'main'], objectDir);
        } catch {
            logMessage("オブジェクトディレクトリの同期に失敗しました。");
            await this.execCmd(this.gitPath, ['reset', '--hard', orgHash.stdout.trim()], objectDir);
            await this.execCmd(this.gitPath, ['checkout', 'local'], objectDir);
            return false;
        }
        await this.execCmd(this.gitPath, ['branch', '-D', 'local'], objectDir);
        await this.execCmd(this.gitPath, ['checkout', '-b', 'local'], objectDir);
        logMessage("オブジェクトディレクトリをGitHubと同期しました。");
        return true;
    }

    // Gitコマンドを実行するヘルパー関数
    private async execCmd(cmd: string, args: string[], cwd: string): Promise<{ stdout: string, stderr: string }> {
        return new Promise((resolve, reject) => {
            cp.execFile(cmd, args, { cwd: cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`execFile error: ${cwd}> ${cmd} ${args.join(' ')}\nstdout:'${stdout}', stderr:'${stderr}'`));
                } else {
                    logMessage(`execFile: ${cwd}> ${cmd} ${args.join(' ')}`);
                    if (stdout !== '') { logMessage(`${stdout}`); }
                    if (stderr !== '') { logMessage(`Err:${stderr}`); }
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
            throw new Error(`Unsupported platform: ${platform}`);
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