import * as assert from "assert";
import path from "path";
import { getVscode } from "./helpers/getVscode";
import { GitHubSyncProvider } from "../storage/GithubProvider";

const vscode = getVscode();

const which = require("which");
const originalWhichSync = which.sync;

class TestableGitHubSyncProvider extends GitHubSyncProvider {
  public syncCalls: Array<{ mode: "pull" | "download"; branch: string }> = [];
  private readonly testObjectDir: string;

  constructor(workspaceUri: any, dependencies: any) {
    super(
      "git@github.com:user/repo.git",
      workspaceUri,
      dependencies.fileSystem,
      dependencies.gitClient,
      dependencies.layoutManager,
    );
    this.testObjectDir = dependencies.layoutManager.getRemotesDirUri().fsPath;
  }

  protected async syncBranchFromRemote(
    branchName: string,
    mode: "pull" | "download",
  ): Promise<{ objectDir: string; beforeHash?: string }> {
    this.syncCalls.push({ mode, branch: branchName });
    return {
      objectDir: this.testObjectDir,
      beforeHash: mode === "pull" ? "localhash" : undefined,
    };
  }
}

suite("GitHubSyncProvider sync flow", () => {
  setup(() => {
    which.sync = () => "/usr/bin/git";
  });

  teardown(() => {
    which.sync = originalWhichSync;
  });

  test("download と pullRemoteChanges が共通ヘルパーを経由すること", async () => {
    const workspaceUri = vscode.Uri.file(path.resolve("/tmp/test-workspace"));

    const layoutManager = {
      getRemotesDirUri() {
        return vscode.Uri.joinPath(workspaceUri, ".secureNotes", "remotes");
      },
      async prepareRemotesLayout() {},
    };

    const gitClient = {
      async exec(args: string[], _options: { cwd: string; silent?: boolean }) {
        if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
          return { stdout: "true\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "origin/main") {
          return { stdout: "newhash\n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
    };

    const fileSystem = {
      async writeFile() {},
      async delete() {},
      async createDirectory() {},
    };

    const provider = new TestableGitHubSyncProvider(workspaceUri, {
      layoutManager,
      gitClient,
      fileSystem,
    });

    const pullResult = await provider.pullRemoteChanges("main");
    assert.strictEqual(
      pullResult,
      true,
      "pullRemoteChanges should resolve successfully",
    );

    const downloadResult = await provider.download("main");
    assert.strictEqual(
      downloadResult,
      true,
      "download should resolve successfully",
    );

    assert.deepStrictEqual(
      provider.syncCalls,
      [
        { mode: "pull", branch: "main" },
        { mode: "download", branch: "main" },
      ],
      "両メソッドが syncBranchFromRemote を経由する必要があります。",
    );
  });
});
