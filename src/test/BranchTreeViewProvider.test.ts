import * as assert from "assert";
import * as vscode from "vscode";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";

suite("BranchTreeViewProvider DI enforcement", () => {
  test("WorkspaceContextService を経由して LocalObjectManager を取得すること", async () => {
    let getLocalObjectManagerCallCount = 0;

    const workspaceContextMock: IWorkspaceContextService = {
      getWorkspaceUri: () => vscode.Uri.file("/tmp/workspace"),
      getLocalObjectManager: () => {
        getLocalObjectManagerCallCount++;
        return {
          getRefsDirUri: () => vscode.Uri.file("/tmp/workspace/.secureNotes/remotes/refs"),
        } as any;
      },
    };

    const originalReadDirectory = vscode.workspace.fs.readDirectory;
    vscode.workspace.fs.readDirectory = async () => [];

    try {
      const { BranchTreeViewProvider } = await import("../BranchTreeViewProvider");
      const provider = new BranchTreeViewProvider({} as vscode.ExtensionContext, workspaceContextMock);
      await provider.getChildren();
    } finally {
      vscode.workspace.fs.readDirectory = originalReadDirectory;
    }

    assert.strictEqual(
      getLocalObjectManagerCallCount,
      1,
      "BranchTreeViewProvider は WorkspaceContextService 経由で LocalObjectManager を取得する必要があります。"
    );
  });
});
