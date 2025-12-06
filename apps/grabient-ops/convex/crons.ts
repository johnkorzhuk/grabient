import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Poll active batches every 5 minutes
crons.interval(
  'poll-active-batches',
  { minutes: 5 },
  internal.backfillActions.pollActiveBatchesInternal,
)

export default crons
