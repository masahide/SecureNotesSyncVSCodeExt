/**
 * Git コマンド実行が IGitClient ラッパー経由で行われることを確認するテスト。
 */

import * as assert from "assert";
import path from "path";
import { getVscode } from "./helpers/getVscode";

const vscode = getVscode();

const which = require("which");
const originalWhichSync = which.sync;
which.sync = () => "/usr/bin/git";

class FakeFileSystem {
  public writeFileCalls: Array<{ uri: any; data: Uint8Array }> = [];
  public async writeFile(uri: any, data: Uint8Array) {
    this.writeFileCalls.push({ uri, data });
  }
  public async delete() {
    return;
  }
  public async createDirectory() {
    return;
  }
}

async function run() {
  try {
    const { GitHubSyncProvider } = await import("../storage/GithubProvider");
    const fileSystem = new FakeFileSystem();
    const workspaceUri = vscode.Uri.file("/tmp/test-workspace");
    const gitClient = {
      calls: [] as Array<{ args: string[]; cwd: string; silent?: boolean }>,
      async exec(args: string[], options: { cwd: string; silent?: boolean }) {
        this.calls.push({ args, cwd: options.cwd, silent: options.silent });
        return { stdout: "", stderr: "" };
      },
    };

    const provider = new (GitHubSyncProvider as any)(
      "git@github.com:user/repo.git",
      workspaceUri,
      fileSystem,
      gitClient
    );

    await provider.initialize();

    assert.ok(
      gitClient.calls.every((call) => Array.isArray(call.args) && typeof call.args[0] === "string"),
      "Git commands should capture first argument"
    );
    assert.ok(
      gitClient.calls.length >= 3,
      "Should invoke git client multiple times during initialization"
    );
    assert.strictEqual(gitClient.calls[0].args[0], "ls-remote", "First command should be ls-remote");

    console.log("✅ GitHubSyncProvider git client delegation test: PASSED");
    process.exit(0);
  } catch (error) {
    console.error("❌ GitHubSyncProvider git client delegation test: FAILED");
    console.error(error);
    process.exit(1);
  } finally {
    which.sync = originalWhichSync;
  }
}

run();
