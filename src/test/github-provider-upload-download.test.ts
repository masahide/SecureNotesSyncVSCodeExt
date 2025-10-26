/**
 * ダウンロード／アップロード API のオーケストレーションを検証するテスト。
 */

import * as assert from "assert";
import { getVscode } from "./helpers/getVscode";
import path from "path";

const vscode = getVscode();

const which = require("which");
const originalWhichSync = which.sync;
which.sync = () => "/usr/bin/git";

async function run() {
  try {
    const { GitHubSyncProvider } = await import("../storage/GithubProvider");
    const fileSystem = {
      async writeFile() {},
      async delete() {},
      async createDirectory() {},
    };
    const gitClient = {
      calls: [] as Array<{ args: string[]; cwd: string; silent?: boolean }>,
      async exec(args: string[], options: { cwd: string; silent?: boolean }) {
        this.calls.push({ args, cwd: options.cwd, silent: options.silent });
        return { stdout: "", stderr: "" };
      },
    };
    const layoutManager = {
      async prepareRemotesLayout() {},
      getRemotesDirUri() {
        return vscode.Uri.joinPath(vscode.Uri.file("/tmp/test-workspace"), ".secureNotes", "remotes");
      },
    };

    const workspaceUri = vscode.Uri.file(path.resolve("/tmp/test-workspace"));

    const provider = new (GitHubSyncProvider as any)(
      "git@github.com:user/repo.git",
      workspaceUri,
      fileSystem,
      gitClient,
      layoutManager
    );

    await provider.upload("main");
    await provider.pullRemoteChanges();

    const fetchCalls = gitClient.calls.filter((call) => call.args[0] === "fetch");
    const pushCalls = gitClient.calls.filter((call) => call.args[0] === "push");
    const resetCalls = gitClient.calls.filter((call) => call.args[0] === "reset");

    assert.ok(fetchCalls.length >= 1, "fetch should be called via high-level API");
    assert.ok(pushCalls.length >= 1, "push should be called via high-level API");
    assert.ok(resetCalls.length >= 1, "reset should be called via high-level API");

    console.log("✅ GitHubSyncProvider upload/download orchestration test: PASSED");
    process.exit(0);
  } catch (error) {
    console.error("❌ GitHubSyncProvider upload/download orchestration test: FAILED");
    console.error(error);
    process.exit(1);
  } finally {
    which.sync = originalWhichSync;
  }
}

run();
