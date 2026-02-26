import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";

export const getActiveStatusIds = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const statuses = await ctx.db
      .query("daktelaStatuses")
      .withIndex("by_active", (q) => q.eq("isActiveForQa", true))
      .collect();

    return statuses.map((status) => status.statusId);
  },
});

export const getActiveStatusIdsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const statuses = await ctx.db
      .query("daktelaStatuses")
      .withIndex("by_active", (q) => q.eq("isActiveForQa", true))
      .collect();

    return statuses.map((status) => status.statusId);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("daktelaStatuses").collect();
  },
});

export const getByStatusId = query({
  args: { statusId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("daktelaStatuses")
      .withIndex("by_status_id", (q) => q.eq("statusId", args.statusId))
      .first();
  },
});

export const upsertInternal = internalMutation({
  args: {
    statusId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("daktelaStatuses")
      .withIndex("by_status_id", (q) => q.eq("statusId", args.statusId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { title: args.title });
      return existing._id;
    }

    return await ctx.db.insert("daktelaStatuses", {
      statusId: args.statusId,
      title: args.title,
      isActiveForQa: false,
      createdAt: Date.now(),
    });
  },
});

export const upsert = mutation({
  args: {
    statusId: v.string(),
    title: v.string(),
    isActiveForQa: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const existing = await ctx.db
      .query("daktelaStatuses")
      .withIndex("by_status_id", (q) => q.eq("statusId", args.statusId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        isActiveForQa: args.isActiveForQa,
      });
      return existing._id;
    }

    return await ctx.db.insert("daktelaStatuses", {
      statusId: args.statusId,
      title: args.title,
      isActiveForQa: args.isActiveForQa,
      createdAt: Date.now(),
    });
  },
});

export const triggerSync = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    await ctx.scheduler.runAfter(0, internal.syncCalls.syncStatuses);
  },
});

export const setActiveForQa = mutation({
  args: {
    statusId: v.string(),
    isActiveForQa: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const status = await ctx.db
      .query("daktelaStatuses")
      .withIndex("by_status_id", (q) => q.eq("statusId", args.statusId))
      .first();

    if (!status) {
      throw new Error(`Status with ID ${args.statusId} not found`);
    }

    await ctx.db.patch(status._id, { isActiveForQa: args.isActiveForQa });
  },
});
