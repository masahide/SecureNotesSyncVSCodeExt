import * as assert from "assert";
import * as vscode from "vscode";
import { IWorkspaceContextService } from "../interfaces/IWorkspaceContextService";

suite("IndexHistoryProvider DI enforcement", () => {
  test("WorkspaceContextService を経由して LocalObjectManager を取得すること", async () => {
    let getLocalObjectManagerCallCount = 0;

    const Module = require("module");
    const originalRequire = Module.prototype.require;

    const workspaceContextMock: IWorkspaceContextService = {
      getWorkspaceUri: () => vscode.Uri.file("/tmp/workspace"),
      getLocalObjectManager: () => {
        getLocalObjectManagerCallCount++;
        return {
          loadRemoteIndexes: async () => [],
        } as any;
      },
    };

    const mockSecrets = {
      get: async () => "should-not-be-used",
    };

    Module.prototype.require = function (id: string) {
      if (id.endsWith("/extension") || id.endsWith("\\extension")) {
        return {
          getAESKey: async () =>
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        };
      }
      return originalRequire.apply(this, arguments as any);
    };

    try {
      const { IndexHistoryProvider } = await import("../IndexHistoryProvider");
      const provider = new IndexHistoryProvider({ secrets: mockSecrets } as any, workspaceContextMock);
      await provider.getChildren();
    } finally {
      Module.prototype.require = originalRequire;
    }

    assert.strictEqual(
      getLocalObjectManagerCallCount,
      1,
      "IndexHistoryProvider は WorkspaceContextService 経由で LocalObjectManager を取得する必要があります。"
    );
  });
});
