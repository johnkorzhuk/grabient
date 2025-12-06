import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";

const app = defineApp();
app.use(workflow);
app.use(r2);
export default app;
