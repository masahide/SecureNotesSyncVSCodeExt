import * as assert from "assert";

suite("Auto sync configuration usage", () => {
  test("setupAutoSyncListeners は config ヘルパー経由で設定を参照する", async () => {
    const Module = require("module");
    const originalRequire = Module.prototype.require;

    const windowStateListeners: Array<(state: { focused: boolean }) => void> = [];
    const saveListeners: Array<() => void> = [];
    const commandsExecuted: string[] = [];

    const configCallCounts = {
      auto: 0,
      inactivity: 0,
      save: 0,
    };

    Module.prototype.require = function (id: string) {
      if (id === "./config") {
        const realConfig = originalRequire.apply(this, arguments as any);
        return {
          ...realConfig,
          isAutoSyncEnabled: () => {
            configCallCounts.auto += 1;
            return true;
          },
          getInactivityTimeoutSec: () => {
            configCallCounts.inactivity += 1;
            return 120;
          },
          getSaveSyncTimeoutSec: () => {
            configCallCounts.save += 1;
            return 2;
          },
        };
      }

      if (id === "vscode") {
        return {
          window: {
            onDidChangeWindowState: (listener: (state: { focused: boolean }) => void) => {
              windowStateListeners.push(listener);
              return { dispose: () => undefined };
            },
            showErrorMessage: () => undefined,
            showInformationMessage: () => undefined,
          },
          workspace: {
            onDidSaveTextDocument: (listener: () => void) => {
              saveListeners.push(listener);
              return { dispose: () => undefined };
            },
            getConfiguration: () => {
              throw new Error("legacy configuration access");
            },
            fs: {
              writeFile: async () => undefined,
              delete: async () => undefined,
              createDirectory: async () => undefined,
            },
          },
          commands: {
            executeCommand: async (command: string) => {
              commandsExecuted.push(command);
              return undefined;
            },
          },
        };
      }

      return originalRequire.apply(this, arguments as any);
    };

    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const scheduledCallbacks: Array<() => void> = [];
    (global as any).setTimeout = (callback: (...args: any[]) => void) => {
      scheduledCallbacks.push(() => callback());
      return 0;
    };
    (global as any).clearTimeout = () => undefined;

    try {
      const extension = await import("../extension");
      extension.__test.setupAutoSyncListeners();

      assert.ok(windowStateListeners.length > 0, "ウィンドウ状態のリスナーが登録されていること");
      assert.ok(saveListeners.length > 0, "保存イベントのリスナーが登録されていること");

      // ウィンドウフォーカスで自動同期チェック
      windowStateListeners[0]({ focused: true });
      assert.ok(configCallCounts.auto > 0, "isAutoSyncEnabled が呼び出されること");
      assert.ok(configCallCounts.inactivity > 0, "getInactivityTimeoutSec が呼び出されること");

      // 保存イベントでの自動同期チェック
      saveListeners[0]();
      assert.ok(configCallCounts.save > 0, "getSaveSyncTimeoutSec が呼び出されること");

      // 遅延実行も即時消化してコマンド呼び出しを検証
      scheduledCallbacks.forEach((run) => run());
      assert.ok(commandsExecuted.includes("secureNotes.sync"), "sync コマンドがスケジュールされること");
    } finally {
      Module.prototype.require = originalRequire;
      (global as any).setTimeout = originalSetTimeout;
      (global as any).clearTimeout = originalClearTimeout;
    }
  });
});
