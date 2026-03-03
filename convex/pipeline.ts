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

    const partiallyAnalyzedCalls = await ctx.db
      .query("calls")
      .withIndex("by_processing_status", (q) =>
        q.eq("processingStatus", "partially_analyzed")
      )
      .take(10);

    for (const call of partiallyAnalyzedCalls) {
      if (!call.questionGroupId) continue;

      const transcription = await ctx.db
        .query("transcriptions")
        .withIndex("by_call_id", (q) => q.eq("callId", call.callId))
        .first();

      if (!transcription?.qaAnalysis) {
        await ctx.db.patch(call._id, {
          processingStatus: "analyzed",
          processingError: "No analysis found for partial retry",
          lastProcessedAt: Date.now(),
        });
        continue;
      }

      const failedQuestionIds = transcription.qaAnalysis.results
        .filter((r) => r.answer === "Error")
        .map((r) => r.questionId);

      if (failedQuestionIds.length === 0) {
        await ctx.db.patch(call._id, {
          processingStatus: "analyzed",
          processingError: undefined,
          lastProcessedAt: Date.now(),
        });
        continue;
      }

      await ctx.db.patch(call._id, {
        processingStatus: "retrying_analysis",
        lastProcessedAt: Date.now(),
      });

      await analysisPool.enqueueAction(
        ctx,
        internal.actions.analyzeCall.retryPartialAnalysis,
        {
          callId: call.callId,
          questionGroupId: call.questionGroupId,
          failedQuestionIds,
        },
        {
          onComplete: internal.pipeline.onPartialRetryComplete,
          context: {
            callDocId: call._id,
            callId: call.callId,
          },
        }
      );
    }

    const STALE_THRESHOLD_MS = 15 * 60 * 1000;
    const now = Date.now();

    for (const status of ["transcribing", "analyzing", "retrying_analysis"] as const) {
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
            const resetStatus = status === "retrying_analysis"
              ? "partially_analyzed" as const
              : "synced" as const;
            await ctx.db.patch(call._id, {
              processingStatus: resetStatus,
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
      enqueuedPartialRetries: partiallyAnalyzedCalls.length,
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
      const isNoRecording = result.error.includes("RECORDING_NOT_FOUND");
      await ctx.db.patch(context.callDocId, {
        processingStatus: isNoRecording ? "no_recording" : "failed",
        processingError: isNoRecording
          ? "Recording not available in Daktela (404)"
          : `Transcription failed: ${formatPipelineError(result.error)}`,
        lastProcessedAt: Date.now(),
      });
      console.error(
        `[Pipeline] Transcription ${isNoRecording ? "skipped (no recording)" : "failed"} for ${context.callId}: ${result.error}`
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
      const returnValue = result.returnValue as {
        errorCount: number;
        failedQuestionIds: string[];
      } | null;

      const hasPartialErrors =
        returnValue &&
        returnValue.errorCount > 0 &&
        returnValue.failedQuestionIds.length > 0;

      if (hasPartialErrors) {
        const call = await ctx.db.get(context.callDocId);
        const qaRetryCount = (call?.qaRetryCount as number | undefined) ?? 0;

        if (qaRetryCount < 3) {
          await ctx.db.patch(context.callDocId, {
            processingStatus: "partially_analyzed",
            processingError: `${returnValue.failedQuestionIds.length} question(s) failed analysis`,
            lastProcessedAt: Date.now(),
            qaRetryCount: qaRetryCount + 1,
          });
          console.log(
            `[Pipeline] Partial analysis for ${context.callId}: ${returnValue.failedQuestionIds.length} errors, scheduling retry ${qaRetryCount + 1}/3`
          );
        } else {
          const allFailed = returnValue.errorCount === (result.returnValue as { resultsCount: number }).resultsCount;
          await ctx.db.patch(context.callDocId, {
            processingStatus: allFailed ? "failed" : "analyzed",
            processingError: allFailed
              ? `All questions failed after 3 retries`
              : `Completed with ${returnValue.failedQuestionIds.length} unresolved error(s) after 3 retries`,
            lastProcessedAt: Date.now(),
          });
          console.log(
            `[Pipeline] Analysis for ${context.callId}: max retries reached, status=${allFailed ? "failed" : "analyzed"}`
          );
        }
      } else {
        await ctx.db.patch(context.callDocId, {
          processingStatus: "analyzed",
          processingError: undefined,
          lastProcessedAt: Date.now(),
        });
        console.log(
          `[Pipeline] Analysis complete for ${context.callId}`
        );
      }
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

export const onPartialRetryComplete = analysisPool.defineOnComplete({
  context: v.object({
    callDocId: v.id("calls"),
    callId: v.string(),
  }),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "success") {
      const returnValue = result.returnValue as {
        errorCount: number;
        failedQuestionIds: string[];
      } | null;

      const hasRemainingErrors =
        returnValue &&
        returnValue.errorCount > 0 &&
        returnValue.failedQuestionIds.length > 0;

      if (hasRemainingErrors) {
        const call = await ctx.db.get(context.callDocId);
        const qaRetryCount = (call?.qaRetryCount as number | undefined) ?? 0;

        if (qaRetryCount < 3) {
          await ctx.db.patch(context.callDocId, {
            processingStatus: "partially_analyzed",
            processingError: `${returnValue.failedQuestionIds.length} question(s) still failing`,
            lastProcessedAt: Date.now(),
          });
          console.log(
            `[Pipeline] Partial retry for ${context.callId}: ${returnValue.failedQuestionIds.length} still failing, will retry (attempt ${qaRetryCount}/3)`
          );
        } else {
          const allFailed = returnValue.errorCount === (result.returnValue as { totalCount: number }).totalCount;
          await ctx.db.patch(context.callDocId, {
            processingStatus: allFailed ? "failed" : "analyzed",
            processingError: allFailed
              ? `All questions failed after retries`
              : `Completed with ${returnValue.failedQuestionIds.length} unresolved error(s) after retries`,
            lastProcessedAt: Date.now(),
          });
          console.log(
            `[Pipeline] Partial retry for ${context.callId}: max retries reached, status=${allFailed ? "failed" : "analyzed"}`
          );
        }
      } else {
        await ctx.db.patch(context.callDocId, {
          processingStatus: "analyzed",
          processingError: undefined,
          lastProcessedAt: Date.now(),
        });
        console.log(
          `[Pipeline] Partial retry resolved all errors for ${context.callId}`
        );
      }
    } else if (result.kind === "failed") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "partially_analyzed",
        processingError: `Retry failed: ${formatPipelineError(result.error)}`,
        lastProcessedAt: Date.now(),
      });
      console.error(
        `[Pipeline] Partial retry action failed for ${context.callId}: ${result.error}`
      );
    } else if (result.kind === "canceled") {
      await ctx.db.patch(context.callDocId, {
        processingStatus: "partially_analyzed",
        lastProcessedAt: Date.now(),
      });
    }
  },
});
