/**
 * SecureNotesLayoutManager を経由して remotes レイアウトを初期化することを確認するテスト。
 */

import * as assert from "assert";
import path from "path";
import { getVscode } from "./helpers/getVscode";

const vscode = getVscode();

const which = require("which");
const originalWhichSync = which.sync;
which.sync = () => "/usr/bin/git";

async function run() {
  try {
    const { GitHubSyncProvider } = await import("../storage/GithubProvider");
    const fileSystem = {
      async writeFile() {
        return;
      },
      async delete() {
        return;
      },
      async createDirectory() {
        return;
      },
    };
    const layoutManager = {
      calls: [] as string[],
      async prepareRemotesLayout() {
        this.calls.push("prepareRemotesLayout");
      },
      getRemotesDirUri() {
        return vscode.Uri.joinPath(vscode.Uri.file("/tmp/test-workspace"), ".secureNotes", "remotes");
      },
    };

    const workspaceUri = vscode.Uri.file(path.resolve("/tmp/test-workspace"));
    const gitClient = {
      async exec() {
        return { stdout: "", stderr: "" };
      },
    };

    const provider = new (GitHubSyncProvider as any)(
      "git@github.com:user/repo.git",
      workspaceUri,
      fileSystem,
      gitClient,
      layoutManager
    );

    await provider.initializeEmptyRemoteRepository();

    assert.strictEqual(
      layoutManager.calls.length,
      1,
      "Layout manager should prepare remotes layout exactly once"
    );

    console.log("✅ GitHubSyncProvider layout manager delegation test: PASSED");
    process.exit(0);
  } catch (error) {
    console.error("❌ GitHubSyncProvider layout manager delegation test: FAILED");
    console.error(error);
    process.exit(1);
  } finally {
    which.sync = originalWhichSync;
  }
}

run();
