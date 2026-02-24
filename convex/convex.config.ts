import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(workpool, { name: "transcriptionPool" });
app.use(workpool, { name: "analysisPool" });
app.use(betterAuth);

export default app;
