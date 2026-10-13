import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encryption at rest for small per-user secrets (today: a user's personal
 * Gemini API key).
 *
 *   AES-256-GCM, a fresh random 12-byte IV per value, and the OWNER'S USER ID
 *   as additional authenticated data — so a ciphertext copied onto another
 *   user's row does not decrypt there.
 *
 * A stored value is the text
 *
 *   v1:<keyId>:<iv>:<tag>:<ciphertext>          (iv, tag, ciphertext: base64)
 *
 * Keys come from the environment:
 *
 *   USER_SECRETS_KEYS="k2:<base64 of 32 bytes>,k1:<base64 of 32 bytes>"
 *
 * The FIRST key encrypts; every listed key can decrypt (that is how a key is
 * rotated: put the new one first, keep the old one until everything has been
 * re-encrypted). The variable is validated when the application starts and a
 * malformed value stops it — better than discovering it at the first save.
 * Not set at all = encryption is off (`enabled` is false) and callers keep
 * storing what they stored before.
 *
 * Nothing here ever logs, returns or puts into an error message a key, a
 * plaintext or a ciphertext.
 */

export class SecretBoxError extends Error {}

interface BoxKey {
  id: string;
  key: Buffer;
}

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Strict base64 → bytes, or null (Buffer.from silently skips garbage). */
function fromBase64(text: string): Buffer | null {
  if (!BASE64.test(text) || text.length % 4 !== 0) return null;
  const bytes = Buffer.from(text, 'base64');
  return bytes.toString('base64') === text ? bytes : null;
}

@Injectable()
export class SecretBox {
  private readonly keys: BoxKey[];

  constructor(configService: ConfigService) {
    this.keys = SecretBox.parseKeys(
      configService.get<string>('userSecrets.keys'),
    );
  }

  /**
   * `"k2:<b64>,k1:<b64>"` → keys, first = active. Throws on anything
   * malformed, naming the entry by position / id and never quoting it.
   */
  static parseKeys(raw: string | undefined | null): BoxKey[] {
    if (raw === undefined || raw === null || raw.trim() === '') return [];

    const keys: BoxKey[] = [];
    const entries = raw.split(',').map((entry) => entry.trim());
    entries.forEach((entry, index) => {
      const where = `USER_SECRETS_KEYS entry ${index + 1}`;
      const separator = entry.indexOf(':');
      if (separator < 0) {
        throw new SecretBoxError(`${where}: expected "<id>:<base64 key>"`);
      }
      const id = entry.slice(0, separator).trim();
      if (!KEY_ID.test(id)) {
        throw new SecretBoxError(
          `${where}: the key id must be 1-32 characters of A-Z a-z 0-9 _ -`,
        );
      }
      if (keys.some((k) => k.id === id)) {
        throw new SecretBoxError(
          `USER_SECRETS_KEYS: key id "${id}" is listed more than once`,
        );
      }
      const key = fromBase64(entry.slice(separator + 1).trim());
      if (!key) {
        throw new SecretBoxError(
          `USER_SECRETS_KEYS: key "${id}" is not valid base64`,
        );
      }
      if (key.length !== KEY_BYTES) {
        throw new SecretBoxError(
          `USER_SECRETS_KEYS: key "${id}" must be ${KEY_BYTES} bytes (it is ${key.length})`,
        );
      }
      keys.push({ id, key });
    });
    return keys;
  }

  /** False when no key is configured: encryption at rest is off. */
  get enabled(): boolean {
    return this.keys.length > 0;
  }

  /** The id of the key new values are encrypted with (null when disabled). */
  get activeKeyId(): string | null {
    return this.keys[0]?.id ?? null;
  }

  /** Whether `token` was produced with the active key (no re-encrypt needed). */
  isCurrent(token: string): boolean {
    return this.enabled && token.startsWith(`${VERSION}:${this.activeKeyId}:`);
  }

  /**
   * @param aad What the value is bound to — the owner's user id. Decryption
   *            needs the same value.
   */
  encrypt(plaintext: string, aad: string): string {
    const active = this.keys[0];
    if (!active) throw new SecretBoxError('No encryption key is configured');

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', active.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      VERSION,
      active.id,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /**
   * Throws SecretBoxError when the value cannot be decrypted: unknown format
   * or key id (the key was lost / not deployed), a different owner (AAD), or
   * any modification of the stored text.
   */
  decrypt(token: string, aad: string): string {
    const parts = typeof token === 'string' ? token.split(':') : [];
    if (parts.length !== 5 || parts[0] !== VERSION) {
      throw new SecretBoxError('Unrecognised secret format');
    }
    const [, keyId, ivText, tagText, ciphertextText] = parts;
    const entry = this.keys.find((k) => k.id === keyId);
    if (!entry) {
      throw new SecretBoxError(
        'The key this secret was encrypted with is not configured',
      );
    }
    const iv = fromBase64(ivText);
    const tag = fromBase64(tagText);
    // An empty plaintext has an empty ciphertext.
    const ciphertext =
      ciphertextText === '' ? Buffer.alloc(0) : fromBase64(ciphertextText);
    if (
      !iv ||
      iv.length !== IV_BYTES ||
      !tag ||
      tag.length !== TAG_BYTES ||
      !ciphertext
    ) {
      throw new SecretBoxError('Malformed secret');
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', entry.key, iv);
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Node's message ("Unsupported state or unable to authenticate data")
      // says nothing useful and must not be mistaken for a bug of ours.
      throw new SecretBoxError('The secret could not be authenticated');
    }
  }
}
