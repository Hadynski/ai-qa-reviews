import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = args.page ?? 0;
    const limit = args.limit ?? 20;
    const offset = page * limit;

    const allCalls = await ctx.db
      .query("calls")
      .withIndex("by_call_time")
      .order("desc")
      .collect();

    const total = allCalls.length;
    const calls = allCalls.slice(offset, offset + limit);

    return {
      calls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
});

export const get = query({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByCallId = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calls")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();
  },
});

export const upsertCall = mutation({
  args: {
    callId: v.string(),
    activityName: v.string(),
    callTime: v.string(),
    duration: v.union(v.number(), v.null()),
    direction: v.union(v.string(), v.null()),
    answered: v.union(v.boolean(), v.null()),
    clid: v.union(v.string(), v.null()),
    agentName: v.union(v.string(), v.null()),
    agentUsername: v.union(v.string(), v.null()),
    agentExtension: v.union(v.string(), v.null()),
    queueId: v.union(v.number(), v.null()),
    queueName: v.union(v.string(), v.null()),
    contactName: v.union(v.string(), v.null()),
    contactFirstname: v.union(v.string(), v.null()),
    contactLastname: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calls")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        activityName: args.activityName,
        callTime: args.callTime,
        duration: args.duration ?? null,
        direction: args.direction ?? null,
        answered: args.answered ?? null,
        clid: args.clid ?? null,
        agentName: args.agentName ?? null,
        agentUsername: args.agentUsername ?? null,
        agentExtension: args.agentExtension ?? null,
        queueId: args.queueId ?? null,
        queueName: args.queueName ?? null,
        contactName: args.contactName ?? null,
        contactFirstname: args.contactFirstname ?? null,
        contactLastname: args.contactLastname ?? null,
        accountName: args.accountName ?? null,
      });
      return existing._id;
    }

    return await ctx.db.insert("calls", {
      callId: args.callId,
      activityName: args.activityName,
      callTime: args.callTime,
      duration: args.duration ?? null,
      direction: args.direction ?? null,
      answered: args.answered ?? null,
      clid: args.clid ?? null,
      agentName: args.agentName ?? null,
      agentUsername: args.agentUsername ?? null,
      agentExtension: args.agentExtension ?? null,
      queueId: args.queueId ?? null,
      queueName: args.queueName ?? null,
      contactName: args.contactName ?? null,
      contactFirstname: args.contactFirstname ?? null,
      contactLastname: args.contactLastname ?? null,
      accountName: args.accountName ?? null,
      createdAt: Date.now(),
    });
  },
});

export const syncNewCalls = mutation({
  args: {
    calls: v.array(
      v.object({
        callId: v.string(),
        activityName: v.string(),
        callTime: v.string(),
        duration: v.optional(v.union(v.number(), v.null())),
        direction: v.optional(v.union(v.string(), v.null())),
        answered: v.optional(v.union(v.boolean(), v.null())),
        clid: v.optional(v.union(v.string(), v.null())),
        agentName: v.optional(v.union(v.string(), v.null())),
        agentUsername: v.optional(v.union(v.string(), v.null())),
        agentExtension: v.optional(v.union(v.string(), v.null())),
        queueId: v.optional(v.union(v.number(), v.null())),
        queueName: v.optional(v.union(v.string(), v.null())),
        contactName: v.optional(v.union(v.string(), v.null())),
        contactFirstname: v.optional(v.union(v.string(), v.null())),
        contactLastname: v.optional(v.union(v.string(), v.null())),
        accountName: v.optional(v.union(v.string(), v.null())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const call of args.calls) {
      const existing = await ctx.db
        .query("calls")
        .withIndex("by_call_id", (q) => q.eq("callId", call.callId))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("calls", {
          callId: call.callId,
          activityName: call.activityName,
          callTime: call.callTime,
          duration: call.duration ?? null,
          direction: call.direction ?? null,
          answered: call.answered ?? null,
          clid: call.clid ?? null,
          agentName: call.agentName ?? null,
          agentUsername: call.agentUsername ?? null,
          agentExtension: call.agentExtension ?? null,
          queueId: call.queueId ?? null,
          queueName: call.queueName ?? null,
          contactName: call.contactName ?? null,
          contactFirstname: call.contactFirstname ?? null,
          contactLastname: call.contactLastname ?? null,
          accountName: call.accountName ?? null,
          createdAt: Date.now(),
        });
        results.push({ callId: call.callId, id, isNew: true });
      } else {
        results.push({ callId: call.callId, id: existing._id, isNew: false });
      }
    }
    return results;
  },
});

export const remove = mutation({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
