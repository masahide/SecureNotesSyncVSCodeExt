import * as assert from "assert";
import * as vscode from "vscode";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";
import { IKeyManagementService } from "../interfaces/IKeyManagementService";

suite("BranchTreeViewProvider DI enforcement", () => {
  test("WorkspaceContextService を経由して LocalObjectManager を取得すること", async () => {
    let getLocalObjectManagerCallCount = 0;

    const workspaceContextMock: IWorkspaceContextService = {
      getWorkspaceUri: () => vscode.Uri.file("/tmp/workspace"),
      getLocalObjectManager: () => {
        getLocalObjectManagerCallCount++;
        return {
          getRefsDirUri: () =>
            vscode.Uri.file("/tmp/workspace/.secureNotes/remotes/refs"),
        } as any;
      },
    };

    const originalReadDirectory = vscode.workspace.fs.readDirectory;
    vscode.workspace.fs.readDirectory = async () => [];

    const keyManagementService: IKeyManagementService = {
      getKey: async () =>
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      saveKey: async () => {
        throw new Error("saveKey should not be called in this test");
      },
      invalidateCache: async () => {
        throw new Error("invalidateCache should not be called in this test");
      },
      refreshKey: async () => {
        throw new Error("refreshKey should not be called in this test");
      },
      markKeyFetched: async () => {
        throw new Error("markKeyFetched should not be called in this test");
      },
    };

    try {
      const { BranchTreeViewProvider } = await import(
        "../BranchTreeViewProvider"
      );
      const provider = new BranchTreeViewProvider(
        {} as vscode.ExtensionContext,
        workspaceContextMock,
        keyManagementService,
      );
      await provider.getChildren();
    } finally {
      vscode.workspace.fs.readDirectory = originalReadDirectory;
    }

    assert.strictEqual(
      getLocalObjectManagerCallCount,
      1,
      "BranchTreeViewProvider は WorkspaceContextService 経由で LocalObjectManager を取得する必要があります。",
    );
  });
});
