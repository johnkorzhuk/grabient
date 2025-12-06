import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";

const app = defineApp();
app.use(r2);
app.use(migrations);
export default app;
