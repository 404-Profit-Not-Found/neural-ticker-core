import {
  isReservedNickname,
  nicknameProblem,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
} from './nickname.rules';
import { NicknameGeneratorService } from './nickname-generator.service';
import { toPublicUser } from './public-user';

describe('nickname rules', () => {
  describe('nicknameProblem', () => {
    it.each([
      'abc',
      'FunnyPanda123',
      'super.trader',
      'Super_Trader-7',
      'a1b',
      '7seas',
      'x'.repeat(NICKNAME_MAX_LENGTH),
      'Systematic', // contains "system" — only whole reserved names are blocked
      'Supportive.Bull',
      'Adminton',
    ])('accepts %s', (nickname) => {
      expect(nicknameProblem(nickname)).toBeNull();
    });

    it.each([
      ['shorter than the minimum', 'x'.repeat(NICKNAME_MIN_LENGTH - 1)],
      ['longer than the maximum', 'x'.repeat(NICKNAME_MAX_LENGTH + 1)],
      ['empty', ''],
    ])('rejects a nickname %s', (_l, nickname) => {
      expect(nicknameProblem(nickname)).toMatch(/characters long/);
    });

    it.each([
      ['a space', 'super trader'],
      ['a tab', 'super\ttrader'],
      ['a leading dot', '.trader'],
      ['a leading underscore', '_trader'],
      ['a leading hyphen', '-trader'],
      ['a trailing dot', 'trader.'],
      ['a trailing hyphen', 'trader-'],
      ['an @', 'me@home'],
      ['a slash', 'a/b/c'],
      ['angle brackets', '<script>'],
      ['an emoji', 'trader🚀x'],
      ['an accented letter', 'tradér'],
      ['a Cyrillic look-alike', 'Аdmin2000x'],
      ['a zero-width space', 'tra​der'],
      ['a mention token', '<@3f9a1c2e>'],
    ])('rejects a nickname with %s', (_l, nickname) => {
      expect(nicknameProblem(nickname)).toMatch(/only letters, digits/);
    });

    it.each([
      'admin',
      'Admin',
      'ADMIN',
      'ad.min',
      'a-d-m-i-n',
      'admin1',
      'Admin_2024',
      'administrator',
      'root',
      'system',
      'System.7',
      'support',
      'Support',
      'help',
      'moderator',
      'Moderator99',
      'mod',
      'staff',
      'official',
      'security',
      'neuralticker',
      'Neural.Ticker',
      'NeuralTicker_Support',
      'neuralticker-official',
      'bot',
      'anonymous',
      'Unknown',
      'someone',
      'Trader',
      'user',
      'null',
      'undefined',
    ])('rejects the reserved name %s', (nickname) => {
      expect(isReservedNickname(nickname)).toBe(true);
      expect(nicknameProblem(nickname)).toMatch(/reserved/);
    });

    it('reserves the handle generated for accounts without a nickname', () => {
      const fallback = toPublicUser({
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        nickname: null as any,
      })?.nickname as string;

      expect(fallback).toBe('Trader-3f9a1c');
      expect(nicknameProblem(fallback)).toMatch(/reserved/);
      expect(nicknameProblem('trader-0a1b2c')).toMatch(/reserved/);
    });

    it('accepts every nickname the generator can hand out', () => {
      const generator = new NicknameGeneratorService();
      for (let i = 0; i < 500; i++) {
        const nickname = generator.generate();
        expect([nickname, nicknameProblem(nickname)]).toEqual([nickname, null]);
      }
    });
  });
});
