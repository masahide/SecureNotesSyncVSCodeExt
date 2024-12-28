import * as crypto from "crypto";

// Encrypt content using AES
export function encryptContent(content: Uint8Array, key: string): Buffer {
  const iv = crypto.randomBytes(16);
  const keyBuffer = Buffer.from(key, "hex");
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return Buffer.concat([iv, encrypted]); // Prepend IV for decryption
}

// Decrypt content using AES
export function decryptContent(encryptedContent: Buffer, key: string): Uint8Array {
  const iv = encryptedContent.subarray(0, 16);
  const encryptedText = encryptedContent.subarray(16);
  const keyBuffer = Buffer.from(key, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted;
}
