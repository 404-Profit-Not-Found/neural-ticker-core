import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { inProcessJobsEnabled } from './background-jobs';

describe('inProcessJobsEnabled (BACKGROUND_JOBS switch)', () => {
  it.each([
    ['unset', {}],
    ['empty', { BACKGROUND_JOBS: '' }],
    ['"on"', { BACKGROUND_JOBS: 'on' }],
    ['"true"', { BACKGROUND_JOBS: 'true' }],
    [
      '"false" — only "off" switches the jobs off',
      { BACKGROUND_JOBS: 'false' },
    ],
    ['"0"', { BACKGROUND_JOBS: '0' }],
  ])(
    'outside production the jobs run when BACKGROUND_JOBS is %s',
    (_l, env) => {
      expect(inProcessJobsEnabled({ NODE_ENV: 'development', ...env })).toBe(
        true,
      );
      expect(inProcessJobsEnabled(env)).toBe(true);
    },
  );

  it.each(['off', 'OFF', ' Off '])(
    'BACKGROUND_JOBS=%j switches them off',
    (value) => {
      expect(
        inProcessJobsEnabled({
          NODE_ENV: 'development',
          BACKGROUND_JOBS: value,
        }),
      ).toBe(false);
      expect(inProcessJobsEnabled({ BACKGROUND_JOBS: value })).toBe(false);
    },
  );

  it('production never runs them in-process, whatever the switch says', () => {
    expect(inProcessJobsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      inProcessJobsEnabled({ NODE_ENV: 'production', BACKGROUND_JOBS: 'on' }),
    ).toBe(false);
  });

  it('reads process.env by default', () => {
    const before = process.env.BACKGROUND_JOBS;
    try {
      process.env.BACKGROUND_JOBS = 'off';
      expect(inProcessJobsEnabled()).toBe(false);
      delete process.env.BACKGROUND_JOBS;
      expect(inProcessJobsEnabled()).toBe(true); // NODE_ENV is 'test' here
    } finally {
      if (before === undefined) delete process.env.BACKGROUND_JOBS;
      else process.env.BACKGROUND_JOBS = before;
    }
  });
});

/**
 * The switch is only worth something if EVERY scheduled job honours it. This
 * reads the source: each `@Cron` / `@Interval` / `@Timeout` handler must start
 * with the gate, and nothing may schedule work with a bare setInterval.
 */
describe('every scheduled job in the codebase is behind the switch', () => {
  const SRC = join(__dirname, '..');

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
    });

  const files = sourceFiles(SRC).map((path) => ({
    path: path.slice(SRC.length + 1),
    lines: readFileSync(path, 'utf8').split('\n'),
  }));

  it('finds the scheduled handlers (sanity: the scan is not vacuous)', () => {
    const count = files.reduce(
      (n, f) => n + f.lines.filter((l) => /^\s*@Cron\(/.test(l)).length,
      0,
    );
    expect(count).toBeGreaterThanOrEqual(12);
  });

  it('each @Cron / @Interval / @Timeout handler returns early unless jobs are enabled', () => {
    const ungated: string[] = [];
    for (const { path, lines } of files) {
      lines.forEach((line, i) => {
        if (!/^\s*@(Cron|Interval|Timeout)\(/.test(line)) return;
        // The gate must be the first statement of the handler body.
        const body = lines.slice(i + 1, i + 6).join('\n');
        if (!/\)\s*\{\s*\n\s*if \(!this\.isDevMode\) return;/.test(body)) {
          ungated.push(`${path}:${i + 1}`);
        }
      });
    }
    expect(ungated).toEqual([]);
  });

  it('isDevMode is the switch in every class that schedules work', () => {
    for (const { path, lines } of files) {
      if (!lines.some((l) => /^\s*@(Cron|Interval|Timeout)\(/.test(l)))
        continue;
      const source = lines.join('\n');
      expect({
        path,
        gated:
          /private get isDevMode\(\): boolean \{\s*return inProcessJobsEnabled\(\);\s*\}/.test(
            source,
          ),
      }).toEqual({ path, gated: true });
    }
  });

  it('nothing schedules work with setInterval', () => {
    const hits = files.flatMap(({ path, lines }) =>
      lines
        .map((line, i) =>
          /\bsetInterval\(/.test(line) ? `${path}:${i + 1}` : '',
        )
        .filter(Boolean),
    );
    expect(hits).toEqual([]);
  });
});
