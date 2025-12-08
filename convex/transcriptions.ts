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
        words: args.words,
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

export const saveClientReview = mutation({
  args: {
    callId: v.string(),
    questionId: v.string(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const transcription = await ctx.db
      .query("transcriptions")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (!transcription) {
      throw new Error(`Transcription not found for callId: ${args.callId}`);
    }

    const now = Date.now();
    const existingReviews = transcription.clientReview?.reviews ?? [];
    const existingIndex = existingReviews.findIndex(
      (r) => r.questionId === args.questionId
    );

    let updatedReviews;
    if (existingIndex >= 0) {
      updatedReviews = existingReviews.map((r, i) =>
        i === existingIndex
          ? { questionId: args.questionId, comment: args.comment, createdAt: now }
          : r
      );
    } else {
      updatedReviews = [
        ...existingReviews,
        { questionId: args.questionId, comment: args.comment, createdAt: now },
      ];
    }

    await ctx.db.patch(transcription._id, {
      clientReview: {
        reviews: updatedReviews,
        updatedAt: now,
      },
    });

    return transcription._id;
  },
});

export const getPromptAnalysisData = query({
  args: {
    questionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const transcriptions = await ctx.db
      .query("transcriptions")
      .collect();

    const withBothReviews = transcriptions.filter(
      (t) => t.qaAnalysis && t.humanQaReview
    );

    const comparisons = withBothReviews.flatMap((t) => {
      const aiResults = t.qaAnalysis!.results;
      const humanAnswers = t.humanQaReview!.qareviewAnswers as Record<string, string[]>;

      return aiResults
        .filter((ai) => !args.questionId || ai.questionId === args.questionId)
        .map((ai) => {
          const humanAnswer = humanAnswers[ai.questionId];
          const aiNormalized = ai.answer.toLowerCase().trim();
          const humanNormalized = humanAnswer?.[0]?.toLowerCase().trim();

          return {
            callId: t.callId,
            questionId: ai.questionId,
            question: ai.question,
            aiAnswer: ai.answer,
            aiJustification: ai.justification,
            humanAnswer: humanAnswer?.[0] ?? null,
            isMatch: aiNormalized === humanNormalized,
            transcriptExcerpt: t.text.slice(0, 500),
          };
        });
    });

    const disagreements = comparisons.filter((c) => !c.isMatch && c.humanAnswer);

    const stats = {
      totalComparisons: comparisons.length,
      matches: comparisons.filter((c) => c.isMatch).length,
      disagreements: disagreements.length,
      aiOnly: comparisons.filter((c) => !c.humanAnswer).length,
    };

    return {
      stats,
      disagreements,
      allComparisons: comparisons,
    };
  },
});
