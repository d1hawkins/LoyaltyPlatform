// Stub secret decryption. In production this will wrap Key Vault /
// envelope-encrypted values produced by the admin-api when the hook is
// registered. For local/dev/test we treat `secret_encrypted` as either:
//   - plaintext (prefixed with `plain:`)
//   - base64 (prefixed with `b64:`)
//   - otherwise, returned verbatim.
export function decryptHookSecret(encrypted: string, _envKey?: string): string {
  if (!encrypted) return '';
  if (encrypted.startsWith('plain:')) return encrypted.slice('plain:'.length);
  if (encrypted.startsWith('b64:')) {
    return Buffer.from(encrypted.slice('b64:'.length), 'base64').toString('utf8');
  }
  return encrypted;
}
