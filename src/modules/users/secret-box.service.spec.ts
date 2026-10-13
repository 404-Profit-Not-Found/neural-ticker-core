import { randomBytes } from 'crypto';
import { SecretBox, SecretBoxError } from './secret-box.service';

// Throwaway keys, generated per run: nothing here is a real secret.
const key = () => randomBytes(32).toString('base64');
const box = (keys?: string) =>
  new SecretBox({
    get: (name: string) => (name === 'userSecrets.keys' ? keys : undefined),
  } as any);

describe('SecretBox', () => {
  const K1 = key();
  const K2 = key();
  const USER = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const OTHER = 'b1ffcd00-1d2c-4f09-8c7e-7cc0ce491b22';
  const SECRET = 'AIza-not-a-real-key-0123456789';

  describe('round trip', () => {
    it('decrypts what it encrypted, for the same owner', () => {
      const b = box(`k1:${K1}`);
      const token = b.encrypt(SECRET, USER);

      expect(b.decrypt(token, USER)).toBe(SECRET);
    });

    it('stores v1:<keyId>:<iv>:<tag>:<ciphertext> — 12-byte IV, 16-byte tag, no plaintext', () => {
      const token = box(`k1:${K1}`).encrypt(SECRET, USER);
      const [version, keyId, iv, tag, ciphertext] = token.split(':');

      expect(token.split(':')).toHaveLength(5);
      expect(version).toBe('v1');
      expect(keyId).toBe('k1');
      expect(Buffer.from(iv, 'base64')).toHaveLength(12);
      expect(Buffer.from(tag, 'base64')).toHaveLength(16);
      expect(Buffer.from(ciphertext, 'base64')).toHaveLength(
        Buffer.byteLength(SECRET),
      );
      expect(token).not.toContain(SECRET);
      expect(Buffer.from(ciphertext, 'base64').toString('utf8')).not.toContain(
        'AIza',
      );
    });

    it('uses a fresh random IV every time: the same value never encrypts the same way', () => {
      const b = box(`k1:${K1}`);
      const tokens = new Set(
        Array.from({ length: 200 }, () => b.encrypt(SECRET, USER)),
      );
      expect(tokens.size).toBe(200);
      expect(new Set([...tokens].map((t) => t.split(':')[2])).size).toBe(200);
    });

    it.each(['', 'x', 'kľúč s diakritikou 🔑', 'a'.repeat(4096)])(
      'handles %j',
      (value) => {
        const b = box(`k1:${K1}`);
        expect(b.decrypt(b.encrypt(value, USER), USER)).toBe(value);
      },
    );
  });

  describe('the owner is authenticated (AAD)', () => {
    it('a ciphertext copied onto another user does not decrypt there', () => {
      const b = box(`k1:${K1}`);
      const token = b.encrypt(SECRET, USER);

      expect(() => b.decrypt(token, OTHER)).toThrow(SecretBoxError);
      expect(b.decrypt(token, USER)).toBe(SECRET);
    });
  });

  describe('tamper detection', () => {
    const b = box(`k1:${K1}`);
    const token = b.encrypt(SECRET, USER);
    const parts = token.split(':');
    const flip = (text: string) => {
      const bytes = Buffer.from(text, 'base64');
      bytes[0] ^= 0x01;
      return bytes.toString('base64');
    };
    const withPart = (index: number, value: string) =>
      parts.map((p, i) => (i === index ? value : p)).join(':');

    it.each([
      ['one bit of the ciphertext', withPart(4, flip(parts[4]))],
      ['one bit of the IV', withPart(2, flip(parts[2]))],
      ['one bit of the tag', withPart(3, flip(parts[3]))],
      ['a truncated ciphertext', withPart(4, parts[4].slice(0, 8))],
      ['a truncated tag', withPart(3, Buffer.alloc(8).toString('base64'))],
      ['a short IV', withPart(2, Buffer.alloc(8).toString('base64'))],
      ['another version', withPart(0, 'v2')],
      ['a missing part', parts.slice(0, 4).join(':')],
      ['an extra part', `${token}:AAAA`],
      ['non-base64 in a part', withPart(4, '!!!not base64!!!')],
      ['a plain string (an unencrypted value in the column)', SECRET],
      ['an empty string', ''],
    ])('rejects %s', (_label, tampered) => {
      expect(() => b.decrypt(tampered, USER)).toThrow(SecretBoxError);
    });

    it('rejects a ciphertext re-labelled with another configured key id', () => {
      const two = box(`k1:${K1},k2:${K2}`);
      const relabelled = two.encrypt(SECRET, USER).replace(/^v1:k1:/, 'v1:k2:');
      expect(() => two.decrypt(relabelled, USER)).toThrow(SecretBoxError);
    });

    it('never throws anything but SecretBoxError, and never quotes the value', () => {
      for (const bad of [null, undefined, 42, {}, 'v1:k1:a:b:c'] as any[]) {
        let error: unknown;
        try {
          b.decrypt(bad, USER);
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(SecretBoxError);
        expect(String((error as Error).message)).not.toContain(SECRET);
        expect(String((error as Error).message)).not.toContain(K1);
      }
    });
  });

  describe('key rotation', () => {
    it('the first key encrypts; every listed key decrypts', () => {
      const old = box(`k1:${K1}`);
      const legacy = old.encrypt(SECRET, USER);

      const rotated = box(`k2:${K2},k1:${K1}`);
      expect(rotated.activeKeyId).toBe('k2');
      // old values still open…
      expect(rotated.decrypt(legacy, USER)).toBe(SECRET);
      expect(rotated.isCurrent(legacy)).toBe(false);
      // …new ones are written with the new key
      const fresh = rotated.encrypt(SECRET, USER);
      expect(fresh.startsWith('v1:k2:')).toBe(true);
      expect(rotated.isCurrent(fresh)).toBe(true);
      expect(rotated.decrypt(fresh, USER)).toBe(SECRET);
      // …and a deployment that only has the old key cannot read them
      expect(() => old.decrypt(fresh, USER)).toThrow(SecretBoxError);
    });

    it('once the old key is removed, values still under it are unreadable — "lost key"', () => {
      const legacy = box(`k1:${K1}`).encrypt(SECRET, USER);
      const onlyNew = box(`k2:${K2}`);

      expect(() => onlyNew.decrypt(legacy, USER)).toThrow(
        'The key this secret was encrypted with is not configured',
      );
    });

    it('a key id is not trusted: the right id with the wrong key fails', () => {
      const legacy = box(`k1:${K1}`).encrypt(SECRET, USER);
      expect(() => box(`k1:${K2}`).decrypt(legacy, USER)).toThrow(
        SecretBoxError,
      );
    });
  });

  describe('not configured', () => {
    it.each([undefined, null, '', '   '])(
      'USER_SECRETS_KEYS=%j → disabled',
      (raw) => {
        const b = box(raw as any);
        expect(b.enabled).toBe(false);
        expect(b.activeKeyId).toBeNull();
        expect(b.isCurrent('v1:k1:a:b:c')).toBe(false);
        expect(() => b.encrypt(SECRET, USER)).toThrow(SecretBoxError);
        expect(() => b.decrypt('v1:k1:a:b:c', USER)).toThrow(SecretBoxError);
      },
    );
  });

  describe('validation at start-up: a malformed value stops the application', () => {
    it('accepts one or several keys, with spaces around the entries', () => {
      expect(box(`k1:${K1}`).enabled).toBe(true);
      expect(box(` k2:${K2} , k1:${K1} `).activeKeyId).toBe('k2');
      expect(box(`prod-2026_10:${K1}`).activeKeyId).toBe('prod-2026_10');
    });

    it.each([
      [
        'a key that is not 32 bytes (16)',
        `k1:${randomBytes(16).toString('base64')}`,
        'must be 32 bytes (it is 16)',
      ],
      [
        'a key that is not 32 bytes (48)',
        `k1:${randomBytes(48).toString('base64')}`,
        'must be 32 bytes (it is 48)',
      ],
      [
        'a key that is not base64',
        'k1:this is not base64!!',
        'is not valid base64',
      ],
      [
        'a hex key',
        `k1:${randomBytes(32).toString('hex')}`,
        'must be 32 bytes',
      ],
      ['no id', K1, 'expected "<id>:<base64 key>"'],
      ['an empty id', `:${K1}`, 'the key id must be'],
      ['an id with a space', `my key:${K1}`, 'the key id must be'],
      ['an empty key', 'k1:', 'is not valid base64'],
      ['a duplicate id', `k1:${K1},k1:${K2}`, 'is listed more than once'],
      ['a trailing comma', `k1:${K1},`, 'expected "<id>:<base64 key>"'],
      ['one good and one bad entry', `k1:${K1},k2:short`, 'key "k2"'],
    ])('%s', (_label, raw, message) => {
      expect(() => box(raw)).toThrow(SecretBoxError);
      expect(() => box(raw)).toThrow(message);
    });

    it('the error never quotes key material', () => {
      const almost = randomBytes(31).toString('base64');
      let error: Error | undefined;
      try {
        box(`k1:${K1},k2:${almost}`);
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeInstanceOf(SecretBoxError);
      expect(error!.message).not.toContain(almost);
      expect(error!.message).not.toContain(K1);
      expect(error!.message).toBe(
        'USER_SECRETS_KEYS: key "k2" must be 32 bytes (it is 31)',
      );
    });
  });
});
