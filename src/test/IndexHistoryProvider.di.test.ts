import * as assert from "assert";
import * as vscode from "vscode";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";
import { IKeyManagementService } from "../interfaces/IKeyManagementService";

suite("IndexHistoryProvider DI enforcement", () => {
  test("WorkspaceContextService を経由して LocalObjectManager を取得すること", async () => {
    let getLocalObjectManagerCallCount = 0;

    const workspaceContextMock: IWorkspaceContextService = {
      getWorkspaceUri: () => vscode.Uri.file("/tmp/workspace"),
      getLocalObjectManager: () => {
        getLocalObjectManagerCallCount++;
        return {
          loadRemoteIndexes: async () => [],
        } as any;
      },
    };

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

    const { IndexHistoryProvider } = await import("../IndexHistoryProvider");
    const provider = new IndexHistoryProvider(
      {} as any,
      workspaceContextMock,
      keyManagementService,
    );
    await provider.getChildren();

    assert.strictEqual(
      getLocalObjectManagerCallCount,
      1,
      "IndexHistoryProvider は WorkspaceContextService 経由で LocalObjectManager を取得する必要があります。",
    );
  });
});
