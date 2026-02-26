import { Workpool } from "@convex-dev/workpool";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

function formatPipelineError(raw: string): string {
  const lines = raw.split("\n");
  const meaningful = lines.filter(
    (line) => !line.trimStart().startsWith("at ")
  );
  const joined = meaningful.join("\n");

  const msgMatch = joined.match(/"message"\s*:\s*"([^"]+)"/);
  if (msgMatch) {
    return msgMatch[1];
  }

  const first = meaningful.find((l) => l.trim().length > 0) ?? raw;
  return first
    .replace(/^Uncaught\s+\w+Error:\s*/, "")
    .replace(/^Error:\s*/, "")
    .trim()
    .slice(0, 200);
}

const transcriptionPool = new Workpool(components.transcriptionPool, {
    maxParallelism: 3,
    retryActionsByDefault: true,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 5000,
      base: 2,
    },
    logLevel: "INFO",
  }
);

const analysisPool = new Workpool(components.analysisPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 5000,
    base: 2,
  },
  logLevel: "INFO",
});

export const processPipeline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pipelineEnabled = process.env.PIPELINE_ENABLED === "true";
    if (!pipelineEnabled) {
      return { skipped: true };
    }

    const syncedCalls = await ctx.db
      .query("calls")
      .withIndex("by_processing_status", (q) =>
        q.eq("processingStatus", "synced")
      )
      .take(10);

    for (const call of syncedCalls) {
      const agent = call.agentId ? await ctx.db.get(call.agentId) : null;
      const agentName = agent?.displayName;

      await ctx.db.patch(call._id, {
        processingStatus: "transcribing",
        lastProcessedAt: Date.now(),
      });

      await transcriptionPool.enqueueAction(
        ctx,
        internal.actions.transcribeCall.transcribeCall,
        {
          callId: call.callId,
          activityName: call.activityName,
          agentName,
        },
        {
          onComplete: internal.pipeline.onTranscriptionComplete,
          context: {
            callDocId: call._id,
            callId: call.callId,
            questionGroupId: call.questionGroupId ?? null,
          },
        }
      );
    }

    const transcribedCalls = await ctx.db
      .query("calls")
      .withIndex("by_processing_status", (q) =>
        q.eq("processingStatus", "transcribed")
      )
      .take(10);

    for (const call of transcribedCalls) {
      if (!call.questionGroupId) {
        await ctx.db.patch(call._id, {
          processingStatus: "skipped",
          processingError: "No question group assigned",
          lastProcessedAt: Date.now(),
        });
        continue;
      }

      await ctx.db.patch(call._id, {
        processingStatus: "analyzing",
        lastProcessedAt: Date.now(),
      });

      await analysisPool.enqueueAction(
        ctx,
        internal.actions.analyzeCall.analyzeCall,
        {
          callId: call.callId,
          questionGroupId: call.questionGroupId,
        },
        {
          onComplete: internal.pipeline.onAnalysisComplete,
          context: {
            callDocId: call._id,
            callId: call.callId,
          },
        }
      );
    }

    const STALE_THRESHOLD_MS = 15 * 60 * 1000;
    const now = Date.now();

    for (const status of ["transcribing", "analyzing"] as const) {
      const staleCalls = await ctx.db
        .query("calls")
        .withIndex("by_processing_status", (q) =>
          q.eq("processingStatus", status)
        )
        .take(50);

      for (const call of staleCalls) {
        if (
          call.lastProcessedAt &&
          now - call.lastProcessedAt > STALE_THRESHOLD_MS
        ) {
          const retryCount = (call.retryCount ?? 0) + 1;
          if (retryCount >= 3) {
            await ctx.db.patch(call._id, {
              processingStatus: "failed",
              processingError: `Stale job after ${retryCount} attempts`,
              retryCount,
              lastProcessedAt: now,
            });
          } else {
            await ctx.db.patch(call._id, {
              processingStatus: "synced",
              retryCount,
              lastProcessedAt: now,
            });
          }
        }
      }
    }

    return {
      skipped: false,
      enqueuedTranscriptions: syncedCalls.length,
      enqueuedAnalyses: transcribedCalls.length,
    };
  },
});

export const onTranscriptionComplete = transcriptionPool.defineOnComplete({
  context: v.object({
    callDocId: v.id("calls"),
    callId: v.string(),
    questionGroupId: v.union(v.id("questionGroups"), v.null()),
  }),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "success") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "transcribed",
        processingError: undefined,
        lastProcessedAt: Date.now(),
      });
      console.log(
        `[Pipeline] Transcription complete for ${context.callId}`
      );
    } else if (result.kind === "failed") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "failed",
        processingError: `Transcription failed: ${formatPipelineError(result.error)}`,
        lastProcessedAt: Date.now(),
      });
      console.error(
        `[Pipeline] Transcription failed for ${context.callId}: ${result.error}`
      );
    } else if (result.kind === "canceled") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "synced",
        lastProcessedAt: Date.now(),
      });
    }
  },
});

export const onAnalysisComplete = analysisPool.defineOnComplete({
  context: v.object({
    callDocId: v.id("calls"),
    callId: v.string(),
  }),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "success") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "analyzed",
        processingError: undefined,
        lastProcessedAt: Date.now(),
      });
      console.log(
        `[Pipeline] Analysis complete for ${context.callId}`
      );
    } else if (result.kind === "failed") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "failed",
        processingError: `Analysis failed: ${formatPipelineError(result.error)}`,
        lastProcessedAt: Date.now(),
      });
      console.error(
        `[Pipeline] Analysis failed for ${context.callId}: ${result.error}`
      );
    } else if (result.kind === "canceled") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "transcribed",
        lastProcessedAt: Date.now(),
      });
    }
  },
});
