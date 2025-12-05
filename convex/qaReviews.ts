import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("qaReviews")
      .withIndex("by_created")
      .order("desc")
      .collect();
  },
});

export const getByReviewId = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("qaReviews")
      .withIndex("by_review_id", (q) => q.eq("reviewId", args.reviewId))
      .first();
  },
});

export const upsertReviews = mutation({
  args: {
    reviews: v.array(
      v.object({
        reviewId: v.string(),
        activityName: v.union(v.string(), v.null()),
        callId: v.union(v.string(), v.null()),
        qaformName: v.string(),
        created: v.string(),
        edited: v.union(v.string(), v.null()),
        reviewedBy: v.union(v.string(), v.null()),
        reviewedOperator: v.optional(v.union(v.string(), v.null())),
        qareviewAnswers: v.any(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const review of args.reviews) {
      const existing = await ctx.db
        .query("qaReviews")
        .withIndex("by_review_id", (q) => q.eq("reviewId", review.reviewId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          activityName: review.activityName,
          callId: review.callId,
          qaformName: review.qaformName,
          created: review.created,
          edited: review.edited,
          reviewedBy: review.reviewedBy,
          reviewedOperator: review.reviewedOperator,
          qareviewAnswers: review.qareviewAnswers,
          fetchedAt: Date.now(),
        });
        results.push({ reviewId: review.reviewId, action: "updated" });
      } else {
        await ctx.db.insert("qaReviews", {
          ...review,
          processingStatus: "idle",
          fetchedAt: Date.now(),
        });
        results.push({ reviewId: review.reviewId, action: "inserted" });
      }
    }
    return results;
  },
});

export const updateStatus = mutation({
  args: {
    reviewId: v.string(),
    processingStatus: v.string(),
    callId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db
      .query("qaReviews")
      .withIndex("by_review_id", (q) => q.eq("reviewId", args.reviewId))
      .first();

    if (!review) {
      throw new Error(`QA Review not found: ${args.reviewId}`);
    }

    const updateData: { processingStatus: string; callId?: string } = {
      processingStatus: args.processingStatus,
    };

    if (args.callId) {
      updateData.callId = args.callId;
    }

    await ctx.db.patch(review._id, updateData);
    return review._id;
  },
});

export const updateCallId = mutation({
  args: {
    reviewId: v.string(),
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db
      .query("qaReviews")
      .withIndex("by_review_id", (q) => q.eq("reviewId", args.reviewId))
      .first();

    if (!review) {
      throw new Error(`QA Review not found: ${args.reviewId}`);
    }

    await ctx.db.patch(review._id, { callId: args.callId });
    return review._id;
  },
});
