import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync calls from daktela",
  { minutes: 10 },
  internal.syncCalls.syncFromDaktela
);

crons.interval(
  "process call pipeline",
  { minutes: 2 },
  internal.pipeline.processPipeline
);

export default crons;
