import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("transcriptions").collect();
  },
});

export const get = query({
  args: { id: v.id("transcriptions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByCallId = query({
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
    words: v.optional(
      v.array(
        v.object({
          text: v.string(),
          start: v.number(),
          end: v.number(),
          type: v.string(),
          speaker_id: v.optional(v.string()),
          logprob: v.optional(v.number()),
          characters: v.optional(v.array(v.any())),
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
        words: args.words,
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
    const transcription = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (!transcription) {
      throw new Error(`Transcription not found for callId: ${args.callId}`);
    }

    await ctx.db.patch(transcription._id, {
      qaAnalysis: args.qaAnalysis,
    });

    return transcription._id;
  },
});

export const saveHumanQaReview = mutation({
  args: {
    callId: v.string(),
    humanQaReview: v.object({
      reviewId: v.string(),
      activityName: v.string(),
      qareviewAnswers: v.any(),
      reviewedAt: v.optional(v.string()),
      reviewedBy: v.optional(v.string()),
      fetchedAt: v.number(),
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

    await ctx.db.patch(transcription._id, {
      humanQaReview: args.humanQaReview,
    });

    return transcription._id;
  },
});

export const clearQaAnalysis = mutation({
  args: { callId: v.string() },
  handler: async (ctx, { callId }) => {
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", callId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { qaAnalysis: undefined });
    }
  },
});

export const deleteTranscription = mutation({
  args: { callId: v.string() },
  handler: async (ctx, { callId }) => {
    const existing = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", callId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
