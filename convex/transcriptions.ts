import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";
import {
  applyStatsAfterAnalysis,
  revertStatsForCall,
  applyStatsAfterAnswerEdit,
} from "./stats";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("transcriptions")
      .take(args.limit ?? 200);
  },
});

export const get = query({
  args: { id: v.id("transcriptions") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getByCallId = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();
  },
});

export const getByCallIdInternal = internalQuery({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();
  },
});

export const upsertTranscription = mutation({
  args: {
    callId: v.string(),
    text: v.string(),
    languageCode: v.string(),
    utterances: v.optional(
      v.array(
        v.object({
          speaker: v.number(),
          transcript: v.string(),
          start: v.number(),
          end: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        languageCode: args.languageCode,
        utterances: args.utterances,
      });
      return existing._id;
    }

    return await ctx.db.insert("transcriptions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const upsertTranscriptionInternal = internalMutation({
  args: {
    callId: v.string(),
    text: v.string(),
    languageCode: v.string(),
    utterances: v.optional(
      v.array(
        v.object({
          speaker: v.number(),
          transcript: v.string(),
          start: v.number(),
          end: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        languageCode: args.languageCode,
        utterances: args.utterances,
      });
      return existing._id;
    }

    return await ctx.db.insert("transcriptions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("transcriptions") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.delete(args.id);
  },
});

export const saveQaAnalysis = mutation({
  args: {
    callId: v.string(),
    qaAnalysis: v.object({
      completedAt: v.number(),
      results: v.array(
        v.object({
          questionId: v.string(),
          question: v.string(),
          answer: v.string(),
          justification: v.string(),
        })
      ),
    }),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const transcription = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (!transcription) {
      throw new Error(`Transcription not found for callId: ${args.callId}`);
    }

    if (transcription.qaAnalysis) {
      await revertStatsForCall(ctx, args.callId);
    }

    await ctx.db.patch(transcription._id, {
      qaAnalysis: args.qaAnalysis,
    });

    await applyStatsAfterAnalysis(ctx, args.callId, args.qaAnalysis.results);

    return transcription._id;
  },
});

export const saveQaAnalysisInternal = internalMutation({
  args: {
    callId: v.string(),
    qaAnalysis: v.object({
      completedAt: v.number(),
      results: v.array(
        v.object({
          questionId: v.string(),
          question: v.string(),
          answer: v.string(),
          justification: v.string(),
        })
      ),
    }),
  },
  handler: async (ctx, args) => {
    const transcription = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (!transcription) {
      throw new Error(`Transcription not found for callId: ${args.callId}`);
    }

    if (transcription.qaAnalysis) {
      await revertStatsForCall(ctx, args.callId);
    }

    await ctx.db.patch(transcription._id, {
      qaAnalysis: args.qaAnalysis,
    });

    await applyStatsAfterAnalysis(ctx, args.callId, args.qaAnalysis.results);

    return transcription._id;
  },
});

export const clearQaAnalysis = mutation({
  args: { callId: v.string() },
  handler: async (ctx, { callId }) => {
    await requireRole(ctx, "admin");
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", callId))
      .first();
    if (existing?.qaAnalysis) {
      await revertStatsForCall(ctx, callId);
      await ctx.db.patch(existing._id, { qaAnalysis: undefined });
    }

    const call = await ctx.db
      .query("calls")
      .withIndex("by_call_id", (q) => q.eq("callId", callId))
      .first();
    if (call && call.processingStatus === "analyzed") {
      await ctx.db.patch(call._id, { processingStatus: "transcribed" });
    }
  },
});

export const deleteTranscription = mutation({
  args: { callId: v.string() },
  handler: async (ctx, { callId }) => {
    await requireRole(ctx, "admin");
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", callId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const updateSingleQaAnswer = mutation({
  args: {
    callId: v.string(),
    questionId: v.string(),
    answer: v.string(),
    justification: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "reviewer");
    const transcription = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (!transcription || !transcription.qaAnalysis) {
      throw new Error(
        `Transcription or QA analysis not found for callId: ${args.callId}`
      );
    }

    const oldResult = transcription.qaAnalysis.results.find(
      (r) => r.questionId === args.questionId
    );
    const oldAnswer = oldResult?.answer ?? "";

    const updatedResults = transcription.qaAnalysis.results.map((result) =>
      result.questionId === args.questionId
        ? { ...result, answer: args.answer, justification: args.justification }
        : result
    );

    await ctx.db.patch(transcription._id, {
      qaAnalysis: {
        ...transcription.qaAnalysis,
        completedAt: Date.now(),
        results: updatedResults,
      },
    });

    await applyStatsAfterAnswerEdit(
      ctx,
      args.callId,
      args.questionId,
      oldAnswer,
      args.answer
    );

    return transcription._id;
  },
});

export const listWithQaAnalysis = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const all = await ctx.db
      .query("transcriptions")
      .take(args.limit ?? 500);
    return all.filter((t) => t.qaAnalysis);
  },
});
