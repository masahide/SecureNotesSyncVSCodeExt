import * as assert from "assert";
import * as vscode from "vscode";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";
import { IKeyManagementService } from "../interfaces/IKeyManagementService";

suite("IndexHistoryProvider AES key retrieval", () => {
  test("KeyManagementService を通じて鍵を取得すること", async () => {
    let getKeyCallCount = 0;
    const keyManagementService: IKeyManagementService = {
      getKey: async () => {
        getKeyCallCount++;
        return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      },
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

    const workspaceContextMock: IWorkspaceContextService = {
      getWorkspaceUri: () => vscode.Uri.file("/tmp/workspace"),
      getLocalObjectManager: () =>
        ({
          loadRemoteIndexes: async () => [],
        }) as any,
    };

    const { IndexHistoryProvider } = await import("../IndexHistoryProvider");
    const provider = new IndexHistoryProvider(
      {} as any,
      workspaceContextMock,
      keyManagementService,
    );
    await provider.getChildren();

    assert.strictEqual(
      getKeyCallCount,
      1,
      "IndexHistoryProvider は KeyManagementService 経由で AES 鍵を取得する必要があります。",
    );
  });
});
