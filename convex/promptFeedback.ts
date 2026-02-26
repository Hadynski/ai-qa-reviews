import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";

export const create = mutation({
  args: {
    questionId: v.string(),
    callId: v.string(),
    aiAnswer: v.string(),
    reviewerAnswer: v.optional(v.string()),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "reviewer");

    const call = await ctx.db
      .query("calls")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .unique();

    if (!call) {
      throw new Error("Call not found");
    }

    return await ctx.db.insert("promptFeedback", {
      questionId: args.questionId,
      callId: args.callId,
      callDocId: call._id,
      authorId: user._id,
      authorName: user.name ?? user.email ?? "Unknown",
      aiAnswer: args.aiAnswer,
      reviewerAnswer: args.reviewerAnswer,
      comment: args.comment,
      status: "open",
      createdAt: Date.now(),
    });
  },
});

export const resolve = mutation({
  args: {
    id: v.id("promptFeedback"),
    status: v.union(v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    await ctx.db.patch(args.id, {
      status: args.status,
      resolvedBy: user.name ?? user.email ?? "Unknown",
      resolvedAt: Date.now(),
    });
  },
});

export const listByCall = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("promptFeedback")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
  },
});

export const listOpenByQuestion = query({
  args: { questionId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("promptFeedback")
      .withIndex("by_question_status", (q) =>
        q.eq("questionId", args.questionId).eq("status", "open")
      )
      .collect();
  },
});

export const countOpenByQuestions = query({
  args: { questionIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const counts: Record<string, number> = {};
    for (const questionId of args.questionIds) {
      const items = await ctx.db
        .query("promptFeedback")
        .withIndex("by_question_status", (q) =>
          q.eq("questionId", questionId).eq("status", "open")
        )
        .collect();
      if (items.length > 0) {
        counts[questionId] = items.length;
      }
    }
    return counts;
  },
});
