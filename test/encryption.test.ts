import { describe, expect, it } from 'vitest';
import { createAesGcmCredentialVault, rotateEncryptedSecret } from '../src/mongoose/encryption.js';

describe('credential encryption', () => {
  const key1 = new Uint8Array(32).fill(1);
  const key2 = new Uint8Array(32).fill(2);
  it('round-trips without exposing plaintext in the record', async () => {
    const vault = createAesGcmCredentialVault({ one: key1 }, 'one');
    const secret = await vault.encrypt('tapin-token');
    expect(JSON.stringify(secret)).not.toContain('tapin-token');
    expect(await vault.decrypt(secret)).toBe('tapin-token');
  });
  it('rejects tampered ciphertext', async () => {
    const vault = createAesGcmCredentialVault({ one: key1 }, 'one');
    const secret = await vault.encrypt('tapin-token');
    await expect(
      vault.decrypt({ ...secret, ciphertext: `${secret.ciphertext}A` }),
    ).rejects.toThrow();
  });
  it('rejects missing and wrong keys', async () => {
    const vault = createAesGcmCredentialVault({ one: key1 }, 'one');
    const secret = await vault.encrypt('tapin-token');
    await expect(
      createAesGcmCredentialVault({ one: key2 }, 'one').decrypt(secret),
    ).rejects.toThrow();
  });
  it('rotates to a new key id', async () => {
    const oldVault = createAesGcmCredentialVault({ old: key1 }, 'old');
    const nextVault = createAesGcmCredentialVault({ next: key2 }, 'next');
    const rotated = await rotateEncryptedSecret(
      await oldVault.encrypt('tapin-token'),
      oldVault,
      nextVault,
    );
    expect(rotated.keyId).toBe('next');
    expect(await nextVault.decrypt(rotated)).toBe('tapin-token');
  });
});
