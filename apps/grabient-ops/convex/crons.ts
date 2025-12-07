import { cronJobs } from 'convex/server'

const crons = cronJobs()

// All cron jobs disabled - run manually when needed:
// - internal.backfillActions.pollActiveBatchesInternal
// - internal.refinementActions.pollActiveRefinementBatchesInternal
// - internal.refinement.refreshRefinementStatusCache

export default crons
