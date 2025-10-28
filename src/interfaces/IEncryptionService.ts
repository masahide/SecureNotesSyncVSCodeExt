export interface IEncryptionService {
  encrypt(content: Buffer, encryptionKey: string): Buffer;
  decrypt(content: Buffer, encryptionKey: string): Buffer;
}
