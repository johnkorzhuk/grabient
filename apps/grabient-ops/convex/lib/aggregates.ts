/**
 * Aggregate instances for efficient counting without full table scans.
 *
 * These use the @convex-dev/aggregate component to maintain O(log n) counts
 * instead of O(n) full table scans.
 *
 * IMPORTANT: Whenever you insert/update/delete from the tracked tables,
 * you must also update the corresponding aggregate to keep them in sync.
 */

import { TableAggregate } from '@convex-dev/aggregate'
import { components } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'

/**
 * Tracks refined seeds - both successful and errored.
 * Each seed should only have one entry per model+cycle.
 *
 * Uses a sumValue to distinguish:
 * - sumValue = 1 for successful refinements
 * - sumValue = 0 for errored refinements
 *
 * This way:
 * - count() gives total refined attempts
 * - sum() gives successful count
 * - count() - sum() gives error count
 *
 * Sync with: palette_tag_refined table inserts/updates
 */
export const refinedSeedsAggregate = new TableAggregate<{
  Key: number
  DataModel: DataModel
  TableName: 'palette_tag_refined'
  SumValue: number
}>(components.refinedSeedsAggregate, {
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => (doc.error ? 0 : 1),
})
