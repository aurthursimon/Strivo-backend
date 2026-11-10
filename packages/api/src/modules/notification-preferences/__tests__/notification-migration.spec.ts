import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('routine notification opt-in migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260812183000_opt_in_routine_notifications/migration.sql',
    ),
    'utf8',
  );

  it('changes future defaults without overwriting existing explicit preferences', () => {
    expect(migration).toContain('ALTER COLUMN "dinner" SET DEFAULT false');
    expect(migration).toContain('ALTER COLUMN "water" SET DEFAULT false');
    expect(migration).not.toMatch(/UPDATE\s+"notification_preferences"/i);
  });
});
