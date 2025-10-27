import * as assert from "assert";
import * as vscode from "vscode";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";

suite("IndexHistoryProvider AES key retrieval", () => {
  test("getAESKey を通じて鍵を取得すること", async () => {
    const Module = require("module");
    const originalRequire = Module.prototype.require;
    let getAesKeyCallCount = 0;

    Module.prototype.require = function (id: string) {
      if (id.endsWith("/extension") || id.endsWith("\\extension")) {
        return {
          getAESKey: async () => {
            getAesKeyCallCount++;
            return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
          },
        };
      }
      return originalRequire.apply(this, arguments as any);
    };

    const workspaceContextMock: IWorkspaceContextService = {
      getWorkspaceUri: () => vscode.Uri.file("/tmp/workspace"),
      getLocalObjectManager: () => ({
        loadRemoteIndexes: async () => [],
      }) as any,
    };

    const mockSecrets = {
      get: async () => {
        throw new Error("secrets.get should not be called directly");
      },
    };

    try {
      const { IndexHistoryProvider } = await import("../IndexHistoryProvider");
      const provider = new IndexHistoryProvider({ secrets: mockSecrets } as any, workspaceContextMock);
      await provider.getChildren();
    } finally {
      Module.prototype.require = originalRequire;
    }

    assert.strictEqual(
      getAesKeyCallCount,
      1,
      "IndexHistoryProvider は getAESKey 経由で AES 鍵を取得する必要があります。"
    );
  });
});
