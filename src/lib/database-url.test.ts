import { buildDatabaseUrl } from '@/lib/database-url';

jest.mock('@/lib/env', () => ({
  env: {
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PORT: 5432,
    POSTGRES_USER: 'apple',
    POSTGRES_PASSWORD: '',
    POSTGRES_DATABASE: 'bia',
  },
}));

describe('buildDatabaseUrl', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('builds the default postgres url with an empty password', () => {
    delete process.env.DATABASE_URL;

    expect(buildDatabaseUrl()).toBe('postgresql://apple@127.0.0.1:5432/bia');
  });

  it('appends a database suffix for test databases', () => {
    delete process.env.DATABASE_URL;

    expect(buildDatabaseUrl({ dbNameSuffix: '_ci' })).toBe(
      'postgresql://apple@127.0.0.1:5432/bia_ci',
    );
  });

  it('uses DATABASE_URL when it is explicitly provided', () => {
    process.env.DATABASE_URL = 'postgresql://custom:secret@db.internal:5544/hiring';

    expect(buildDatabaseUrl()).toBe('postgresql://custom:secret@db.internal:5544/hiring');
  });

  it('appends suffixes to explicit DATABASE_URL databases', () => {
    process.env.DATABASE_URL = 'postgresql://custom:secret@db.internal:5544/hiring?schema=public';

    expect(buildDatabaseUrl({ dbNameSuffix: '_ci' })).toBe(
      'postgresql://custom:secret@db.internal:5544/hiring_ci?schema=public',
    );
  });
});
