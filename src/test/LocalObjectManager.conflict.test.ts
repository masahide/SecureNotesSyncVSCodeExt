import * as assert from "assert";
import * as vscode from "vscode";
import { LocalObjectManager } from "../storage/LocalObjectManager";
import { EncryptionService } from "../services/EncryptionService";

class ConflictHelperLocalObjectManager extends LocalObjectManager {
  constructor(workspaceUri: vscode.Uri) {
    super(workspaceUri, new EncryptionService());
  }

  public buildPath(prefix: string, filePath: string, timestamp: Date): string {
    return this.buildConflictFilePath(prefix, filePath, timestamp);
  }
}

suite("LocalObjectManager conflict path helper", () => {
  test("buildConflictFilePath で共通フォーマットを提供すること", () => {
    const workspaceUri = vscode.Uri.file("/tmp/workspace");
    const manager = new ConflictHelperLocalObjectManager(workspaceUri);
    const timestamp = new Date("2024-01-02T03:04:05Z");

    const localPath = manager.buildPath(
      "conflict-local",
      "notes/sample.md",
      timestamp,
    );
    const remotePath = manager.buildPath(
      "conflict-remote",
      "notes/sample.md",
      timestamp,
    );

    assert.strictEqual(
      localPath,
      "conflict-local/2024-01-02_12-04-05-000/notes/sample.md",
      "ローカル側のコンフリクトパスが期待通りの形式で生成される必要があります。",
    );

    assert.strictEqual(
      remotePath,
      "conflict-remote/2024-01-02_12-04-05-000/notes/sample.md",
      "リモート側のコンフリクトパスが期待通りの形式で生成される必要があります。",
    );
  });
});
