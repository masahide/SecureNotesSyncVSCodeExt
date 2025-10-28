import * as assert from "assert";
import { EncryptionService } from "../services/EncryptionService";

suite("EncryptionService", () => {
  test("encrypt したデータを decrypt で元に戻せること", () => {
    const service = new EncryptionService();
    const key =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const original = Buffer.from("Hello Secure Notes", "utf8");

    const encrypted = service.encrypt(original, key);
    assert.notDeepStrictEqual(
      encrypted,
      original,
      "暗号化後のデータは元データと異なる必要があります",
    );

    const decrypted = service.decrypt(encrypted, key);
    assert.deepStrictEqual(
      decrypted,
      original,
      "復号結果が元データと一致する必要があります",
    );
  });

  test("無効な鍵長の場合はエラーになること", () => {
    const service = new EncryptionService();
    const invalidKey = "short-key";
    const buffer = Buffer.from("dummy", "utf8");

    assert.throws(
      () => service.encrypt(buffer, invalidKey),
      /64-character hex string/,
      "不正な鍵長ではエラーが発生する必要があります",
    );
  });
});
