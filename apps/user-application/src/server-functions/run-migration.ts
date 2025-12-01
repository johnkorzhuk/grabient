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
    console.log('[runMigration] Function called');
    console.log('[runMigration] Execute mode:', ctx.data.execute);

    const dryRun = !ctx.data.execute;
    const db = getDb();

    try {
      console.log('[runMigration] Starting migration...');
      const result = await migrateSeedsToDefaults(dryRun, db);
      console.log('[runMigration] Migration completed successfully');

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
