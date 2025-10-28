import * as assert from "assert";
import * as vscode from "vscode";
import { KeyManagementService } from "../services/KeyManagementService";

class InMemorySecrets {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  async storeValue(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // VS Code Secrets API との互換メソッド
  get storeFunction(): (key: string, value: string) => Promise<void> {
    return this.storeValue.bind(this);
  }
}

function createContext(secrets: InMemorySecrets): vscode.ExtensionContext {
  return {
    secrets: {
      get: (key: string) => secrets.get(key),
      store: (key: string, value: string) => secrets.storeValue(key, value),
      delete: (key: string) => secrets.delete(key),
    },
  } as unknown as vscode.ExtensionContext;
}

function stubConfig(values: Record<string, any>) {
  const original = vscode.workspace.getConfiguration;
  vscode.workspace.getConfiguration = () =>
    ({
      get: (key: string, defaultValue?: any) => {
        if (key in values) {
          return values[key];
        }
        return defaultValue;
      },
    }) as any;
  return () => {
    vscode.workspace.getConfiguration = original;
  };
}

suite("KeyManagementService", () => {
  test("ローカルシークレットから鍵を取得できること", async () => {
    const restoreConfig = stubConfig({
      onePasswordUri: "",
      onePasswordCacheTimeout: "30d",
      onePasswordAccount: "",
    });

    const secrets = new InMemorySecrets();
    const context = createContext(secrets);
    const service = new KeyManagementService(context);

    const key =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    await service.saveKey(key);

    const resolved = await service.getKey();
    assert.strictEqual(resolved, key, "保存した鍵が取得できる必要があります");

    restoreConfig();
  });

  test("invalidateCache と markKeyFetched でキャッシュ状態が更新されること", async () => {
    const restoreConfig = stubConfig({
      onePasswordUri: "",
      onePasswordCacheTimeout: "30d",
      onePasswordAccount: "",
    });

    const secrets = new InMemorySecrets();
    const context = createContext(secrets);
    const service = new KeyManagementService(context);

    await service.markKeyFetched(1234);
    const fetchedTimeBefore = await secrets.get("aesEncryptionKeyFetchedTime");
    assert.strictEqual(
      fetchedTimeBefore,
      "1234",
      "指定したタイムスタンプで更新される必要があります",
    );

    await service.invalidateCache();
    const fetchedTimeAfter = await secrets.get("aesEncryptionKeyFetchedTime");
    assert.strictEqual(
      fetchedTimeAfter,
      "0",
      "invalidateCache 呼び出しでフェッチタイムがリセットされる必要があります",
    );

    restoreConfig();
  });

  test("1Password 経由で鍵を取得し、キャッシュを再利用すること", async () => {
    const restoreConfig = stubConfig({
      onePasswordUri: "op://vault/item/field",
      onePasswordCacheTimeout: "30d",
      onePasswordAccount: "account-name",
    });

    const secrets = new InMemorySecrets();
    const context = createContext(secrets);
    const service = new KeyManagementService(context);

    const whichModule = require("which");
    const childProcess = require("child_process");
    const originalWhichSync = whichModule.sync;
    const originalExecFile = childProcess.execFile;

    let execCallCount = 0;

    whichModule.sync = () => "/usr/bin/op";
    childProcess.execFile = (
      _path: string,
      _args: string[],
      callback: (error: any, stdout: string, stderr: string) => void,
    ) => {
      execCallCount++;
      callback(
        null,
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n",
        "",
      );
    };

    try {
      const first = await service.getKey();
      assert.strictEqual(
        execCallCount,
        1,
        "初回取得では 1Password CLI を呼び出す必要があります",
      );
      assert.strictEqual(
        first?.trim(),
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const second = await service.getKey();
      assert.strictEqual(
        execCallCount,
        1,
        "キャッシュ有効時は CLI を再度呼び出さない必要があります",
      );
      assert.strictEqual(
        second,
        first,
        "キャッシュから同じ鍵が取得できる必要があります",
      );
    } finally {
      whichModule.sync = originalWhichSync;
      childProcess.execFile = originalExecFile;
      restoreConfig();
    }
  });
});
