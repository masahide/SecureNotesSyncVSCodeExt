/**
 * 手動テスト用スクリプト
 * 実際のワークスペースで増分同期処理をテストする
 */

import * as vscode from "vscode";
import { SyncService } from "../SyncService";
import { SyncServiceFactory } from "../factories/SyncServiceFactory";
import { logMessage, showInfo, showError } from "../logger";

export async function runManualSyncTest(): Promise<void> {
  try {
    logMessage("🧪 手動同期テストを開始します...");

    // 設定を取得
    const config = vscode.workspace.getConfiguration("SecureNotesSync");
    const gitRemoteUrl = config.get<string>("gitRemoteUrl");

    if (!gitRemoteUrl) {
      showError("GitHubリポジトリURLが設定されていません");
      return;
    }

    // テスト用の環境ID
    const testEnvironmentId = "test-env-" + Date.now();

    // テスト用のAESキー（64文字のhex）
    const testEncryptionKey =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const options = {
      environmentId: testEnvironmentId,
      encryptionKey: testEncryptionKey,
    };

    logMessage(`テスト環境ID: ${testEnvironmentId}`);
    logMessage(`GitリモートURL: ${gitRemoteUrl}`);

    // SyncServiceを作成
    const factory = new SyncServiceFactory();
    const syncConfig = {
      storageType: "github" as const,
      remoteUrl: gitRemoteUrl,
      encryptionKey: "0".repeat(64),
    };
    const syncService = factory.createSyncService(
      syncConfig,
      vscode.extensions.getExtension("rovodev.secure-notes-sync")!.exports
        .context,
    );

    // テストケース1: 基本的な増分同期
    logMessage("📝 テストケース1: 基本的な増分同期");
    const result1 = await syncService.performIncrementalSync();
    logMessage(`結果: ${result1 ? "成功" : "更新なし"}`);

    // テストケース2: 連続実行（2回目は更新なしになるはず）
    logMessage("📝 テストケース2: 連続実行");
    const result2 = await syncService.performIncrementalSync();
    logMessage(`結果: ${result2 ? "成功" : "更新なし"}`);

    showInfo("手動同期テストが完了しました");
  } catch (error: any) {
    showError(`手動同期テストでエラーが発生しました: ${error.message}`);
    logMessage(`エラー詳細: ${error.stack}`);
  }
}

// VS Codeコマンドとして登録
export function registerManualSyncTestCommand(
  context: vscode.ExtensionContext,
): void {
  const command = vscode.commands.registerCommand(
    "extension.runManualSyncTest",
    runManualSyncTest,
  );

  context.subscriptions.push(command);
}
