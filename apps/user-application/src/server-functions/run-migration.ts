import { createServerFn } from '@tanstack/react-start';
import { migrateSeedsToDefaults } from '@repo/data-ops/scripts/normalize-seeds';
import { getDb } from '@repo/data-ops/database/setup';
import * as v from 'valibot';

const migrationSchema = v.object({
  execute: v.optional(v.boolean(), false),
});

export const runMigration = createServerFn({ method: 'GET' })
  .inputValidator((input) => v.parse(migrationSchema, input))
  .handler(async (ctx) => {
    const dryRun = !ctx.data.execute;
    const db = getDb();

    try {
      const result = await migrateSeedsToDefaults(dryRun, db);

      return {
        success: true,
        mode: dryRun ? 'dry-run' : 'execute',
        timestamp: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      console.error('[runMigration] Migration failed:', error);
      throw error;
    }
  });
