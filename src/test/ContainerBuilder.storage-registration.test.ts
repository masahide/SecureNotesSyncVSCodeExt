import * as assert from "assert";
import * as vscode from "vscode";
import { ContainerBuilder } from "../container/ContainerBuilder";
import { ServiceKeys } from "../container/ServiceKeys";

suite("ContainerBuilder storage service registration", () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

  test("registerStorageServices なしではストレージ依存が解決できないこと", () => {
    const container = new ContainerBuilder()
      .registerCoreServices()
      .registerVSCodeServices(context)
      .build();

    assert.strictEqual(container.isRegistered(ServiceKeys.FILE_SYSTEM), false);
    assert.strictEqual(container.isRegistered(ServiceKeys.GIT_CLIENT), false);
    assert.strictEqual(
      container.isRegistered(ServiceKeys.LAYOUT_MANAGER),
      false,
    );
  });

  test("registerStorageServices でストレージ依存が登録されること", () => {
    const container = new ContainerBuilder()
      .registerCoreServices()
      .registerVSCodeServices(context)
      .registerStorageServices()
      .build();

    assert.strictEqual(container.isRegistered(ServiceKeys.FILE_SYSTEM), true);
    assert.strictEqual(container.isRegistered(ServiceKeys.GIT_CLIENT), true);
    assert.strictEqual(
      container.isRegistered(ServiceKeys.LAYOUT_MANAGER),
      true,
    );
  });
});
