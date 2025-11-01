import * as assert from "assert";
import * as vscode from "vscode";
import { LocalObjectManager } from "../storage/LocalObjectManager";
import { IEncryptionService } from "../interfaces/IEncryptionService";

suite("LocalObjectManager encryption delegation", () => {
  test("EncryptionService に委譲して暗号化・復号を行うこと", async () => {
    const workspaceUri = vscode.Uri.file("/tmp/workspace");
    const callLog: string[] = [];

    const encryptionService: IEncryptionService = {
      encrypt: (content: Buffer, key: string) => {
        callLog.push(`encrypt:${key}:${content.toString()}`);
        return Buffer.from("encrypted-content", "utf8");
      },
      decrypt: (content: Buffer, key: string) => {
        callLog.push(`decrypt:${key}:${content.toString()}`);
        return Buffer.from("decrypted-uuid", "utf8");
      },
    };

    const manager = new LocalObjectManager(workspaceUri, encryptionService);

    const originalWriteFile = vscode.workspace.fs.writeFile;
    const originalReadFile = vscode.workspace.fs.readFile;
    let storedData: Uint8Array | null = null;

    vscode.workspace.fs.writeFile = async (
      _uri: vscode.Uri,
      data: Uint8Array,
    ) => {
      storedData = data;
    };
    vscode.workspace.fs.readFile = async () => {
      if (!storedData) {
        throw new Error("No data written");
      }
      return storedData;
    };

    try {
      const encryptionKey = "a".repeat(64);
      await manager.saveBranchRef("main", "uuid-1234", { encryptionKey });
      const result = await manager.readBranchRef("main", { encryptionKey });

      assert.ok(
        callLog.some((entry) => entry.startsWith("encrypt:")),
        "encrypt が呼び出される必要があります",
      );
      assert.ok(
        callLog.some((entry) => entry.startsWith("decrypt:")),
        "decrypt が呼び出される必要があります",
      );
      assert.strictEqual(
        result,
        "decrypted-uuid",
        "復号結果が期待通りである必要があります",
      );
    } finally {
      vscode.workspace.fs.writeFile = originalWriteFile;
      vscode.workspace.fs.readFile = originalReadFile;
    }
  });
});
