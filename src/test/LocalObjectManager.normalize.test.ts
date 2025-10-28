import * as assert from "assert";
import * as vscode from "vscode";
import { LocalObjectManager } from "../storage/LocalObjectManager";
import { EncryptionService } from "../services/EncryptionService";
import { IndexFile } from "../types";

class TestableLocalObjectManager extends LocalObjectManager {
  constructor(workspaceUri: vscode.Uri) {
    super(workspaceUri, new EncryptionService());
  }

  public normalizeForTest(index: IndexFile): IndexFile {
    return this.normalizeIndexFile(index);
  }
}

suite("LocalObjectManager index normalization", () => {
  test("normalizeIndexFile でパス正規化とソートを一括適用すること", () => {
    const workspaceUri = vscode.Uri.file("/tmp/workspace");
    const manager = new TestableLocalObjectManager(workspaceUri);

    const rawIndex: IndexFile = {
      uuid: "uuid-1",
      environmentId: "env",
      parentUuids: [],
      timestamp: 123,
      files: [
        { path: "b\\file.txt", hash: "hash2", timestamp: 2, deleted: false },
        { path: "a/file.txt", hash: "hash1", timestamp: 1, deleted: false },
      ],
    };

    const normalized = manager.normalizeForTest(rawIndex);

    assert.deepStrictEqual(
      normalized.files.map((f) => f.path),
      ["a/file.txt", "b/file.txt"],
      "ファイルパスは正規化され、ソートされている必要があります。",
    );
  });
});
