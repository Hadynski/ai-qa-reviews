import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";
import { revertStatsForCall } from "./stats";

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = args.limit ?? 50;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_call_time")
      .order("desc")
      .take(limit);

    const callsWithAgent = await Promise.all(
      calls.map(async (call) => {
        const agent = call.agentId ? await ctx.db.get(call.agentId) : null;
        const group = call.questionGroupId
          ? await ctx.db.get(call.questionGroupId)
          : null;
        return {
          ...call,
          agentName: agent?.displayName ?? null,
          questionGroupName: group?.displayName ?? null,
        };
      })
    );

    return {
      calls: callsWithAgent,
      total: calls.length,
    };
  },
});

export const get = query({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getWithAgent = query({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const call = await ctx.db.get(args.id);
    if (!call) return null;
    const agent = call.agentId ? await ctx.db.get(call.agentId) : null;
    return { ...call, agentName: agent?.displayName ?? null };
  },
});

export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = args.limit ?? 50;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);

    return Promise.all(
      calls.map(async (call) => {
        const group = call.questionGroupId
          ? await ctx.db.get(call.questionGroupId)
          : null;
        return {
          ...call,
          questionGroupName: group?.displayName ?? null,
        };
      })
    );
  },
});

export const getByCallId = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("calls")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();
  },
});

export const getByCallIdInternal = internalQuery({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calls")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();
  },
});

export const listByStatus = query({
  args: {
    processingStatus: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = args.limit ?? 20;
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_processing_status", (q) =>
        q.eq("processingStatus", args.processingStatus)
      )
      .take(limit);

    return Promise.all(
      calls.map(async (call) => {
        const agent = call.agentId ? await ctx.db.get(call.agentId) : null;
        return { ...call, agentName: agent?.displayName ?? null };
      })
    );
  },
});

export const listByStatusInternal = internalQuery({
  args: {
    processingStatus: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    return await ctx.db
      .query("calls")
      .withIndex("by_processing_status", (q) =>
        q.eq("processingStatus", args.processingStatus)
      )
      .take(limit);
  },
});

export const updateProcessingStatus = internalMutation({
  args: {
    callId: v.id("calls"),
    processingStatus: v.string(),
    processingError: v.optional(v.string()),
    questionGroupId: v.optional(v.id("questionGroups")),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      processingStatus: args.processingStatus,
      lastProcessedAt: Date.now(),
    };

    if (args.processingError !== undefined) {
      patch.processingError = args.processingError;
    }
    if (args.questionGroupId !== undefined) {
      patch.questionGroupId = args.questionGroupId;
    }

    await ctx.db.patch(args.callId, patch);
  },
});

export const retryFailedCall = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "reviewer");
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found");
    }
    if (call.processingStatus !== "failed") {
      throw new Error("Only failed calls can be retried");
    }

    const retryCount = (call.retryCount ?? 0) + 1;
    await ctx.db.patch(args.callId, {
      processingStatus: "synced",
      processingError: undefined,
      retryCount,
      lastProcessedAt: Date.now(),
    });
  },
});

export const reprocessCall = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "reviewer");
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found");
    }

    if (call.processingStatus === "analyzed") {
      await revertStatsForCall(ctx, call.callId);
    }

    await ctx.db.patch(args.callId, {
      processingStatus: "synced",
      processingError: undefined,
      lastProcessedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.delete(args.id);
  },
});
