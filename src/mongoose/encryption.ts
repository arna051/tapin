import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { CredentialVault, EncryptedSecret } from './index.js';

export type AesGcmKeyring = Readonly<Record<string, Uint8Array>>;
const keyFor = (keys: AesGcmKeyring, keyId: string): Buffer => {
  const value = keys[keyId];
  if (!value) throw new Error(`Credential key ${keyId} is unavailable`);
  const key = Buffer.from(value);
  if (key.byteLength !== 32)
    throw new TypeError(`Credential key ${keyId} must contain exactly 32 bytes`);
  return key;
};

export function createAesGcmCredentialVault(
  keys: AesGcmKeyring,
  activeKeyId: string,
): CredentialVault {
  keyFor(keys, activeKeyId);
  return {
    async encrypt(plaintext: string): Promise<EncryptedSecret> {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyFor(keys, activeKeyId), iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return {
        algorithm: 'aes-256-gcm',
        keyId: activeKeyId,
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        authTag: cipher.getAuthTag().toString('base64url'),
      };
    },
    async decrypt(secret: EncryptedSecret): Promise<string> {
      if (secret.algorithm !== 'aes-256-gcm')
        throw new Error('Unsupported credential encryption algorithm');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        keyFor(keys, secret.keyId),
        Buffer.from(secret.iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(secret.authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(secret.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

export async function rotateEncryptedSecret(
  secret: EncryptedSecret,
  from: CredentialVault,
  to: CredentialVault,
): Promise<EncryptedSecret> {
  return to.encrypt(await from.decrypt(secret));
}
