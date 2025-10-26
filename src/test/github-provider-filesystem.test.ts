/**
 * GitHubSyncProvider が VS Code の workspace.fs に直接依存せず、
 * 代替ファイルシステムアダプタと Git クライアントで動作することを検証するテスト。
 */

import * as assert from "assert";
import path from "path";
import { getVscode } from "./helpers/getVscode";

const vscode = getVscode();

const fileSystemViolationError = new Error("workspace.fs should not be called directly");

// which.sync('git') の挙動を安定させる
const which = require("which");
const originalWhichSync = which.sync;
which.sync = () => "/usr/bin/git";

async function run() {
  try {
    const { GitHubSyncProvider } = await import("../storage/GithubProvider");

    const fileSystemMock = {
      createDirectoryCalls: [] as string[],
      deleteCalls: [] as string[],
      writeFileCalls: [] as string[],
      async createDirectory(uri: any) {
        this.createDirectoryCalls.push(uri.fsPath);
      },
      async delete(uri: any, _options?: unknown) {
        this.deleteCalls.push(uri.fsPath);
      },
      async writeFile(_uri: any, _data: Uint8Array) {
        throw fileSystemViolationError;
      },
    };

    const safeFileSystem = {
      ...fileSystemMock,
      async writeFile(uri: any, _data: Uint8Array) {
        fileSystemMock.writeFileCalls.push(uri.fsPath);
      },
    };

    const workspaceUri = vscode.Uri.file(path.resolve("/tmp/test-workspace"));
    const gitClientMock = {
      calls: [] as Array<{ args: string[]; cwd: string; silent?: boolean }>,
      async exec(args: string[], options: { cwd: string; silent?: boolean }) {
        this.calls.push({ args, cwd: options.cwd, silent: options.silent });
        return { stdout: "", stderr: "" };
      },
    };

    const provider = new (GitHubSyncProvider as any)(
      "git@github.com:user/repo.git",
      workspaceUri,
      safeFileSystem,
      gitClientMock
    );

    await provider.initializeEmptyRemoteRepository();

    assert.ok(
      fileSystemMock.createDirectoryCalls.length > 0,
      "file system adapter should receive createDirectory calls"
    );
    assert.ok(
      fileSystemMock.writeFileCalls.length > 0,
      "file system adapter should receive writeFile calls"
    );
    assert.ok(
      gitClientMock.calls.length > 0,
      "git client adapter should receive git commands"
    );
    console.log("✅ GitHubSyncProvider file-system abstraction test: PASSED");
    process.exit(0);
  } catch (error) {
    console.error("❌ GitHubSyncProvider file-system abstraction test: FAILED");
    console.error(error);
    process.exit(1);
  } finally {
    which.sync = originalWhichSync;
  }
}

run();
