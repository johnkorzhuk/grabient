import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(r2);
app.use(migrations);

// Aggregate for efficient refinement counting without full table scans
app.use(aggregate, { name: "refinedSeedsAggregate" });

export default app;
