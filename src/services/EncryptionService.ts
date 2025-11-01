import * as crypto from "crypto";
import { IEncryptionService } from "../interfaces/IEncryptionService";

export class EncryptionService implements IEncryptionService {
  encrypt(content: Buffer, encryptionKey: string): Buffer {
    const keyBuffer = this.toKeyBuffer(encryptionKey);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
  }

  decrypt(content: Buffer, encryptionKey: string): Buffer {
    if (content.byteLength < 16) {
      throw new Error("Encrypted payload is too short to contain an IV");
    }

    const keyBuffer = this.toKeyBuffer(encryptionKey);
    const iv = content.subarray(0, 16);
    const encryptedText = content.subarray(16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
    return Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  }

  private toKeyBuffer(encryptionKey: string): Buffer {
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      throw new Error("Encryption key must be a 64-character hex string");
    }
    return Buffer.from(encryptionKey, "hex");
  }
}
