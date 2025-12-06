import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config.js";

const app = defineApp();
app.use(r2);
export default app;
