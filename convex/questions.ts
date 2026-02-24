import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";

export const listByGroup = query({
  args: { groupId: v.id("questionGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("questions")
      .withIndex("by_group_active", (q) =>
        q.eq("groupId", args.groupId).eq("isActive", true)
      )
      .collect();
  },
});

export const listAllByGroup = query({
  args: { groupId: v.id("questionGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("questions")
      .withIndex("by_group_active", (q) => q.eq("groupId", args.groupId))
      .collect();
  },
});

export const listActiveByGroupInternal = internalQuery({
  args: { groupId: v.id("questionGroups") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("questions")
      .withIndex("by_group_active", (q) =>
        q.eq("groupId", args.groupId).eq("isActive", true)
      )
      .collect();
  },
});

export const get = query({
  args: { id: v.id("questions") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    groupId: v.id("questionGroups"),
    question: v.string(),
    context: v.string(),
    referenceScript: v.optional(v.string()),
    goodExamples: v.optional(v.array(v.string())),
    badExamples: v.optional(v.array(v.string())),
    sortOrder: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const now = Date.now();
    return await ctx.db.insert("questions", {
      ...args,
      questionId: crypto.randomUUID(),
      possibleAnswers: ["Tak", "Nie"],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("questions"),
    question: v.optional(v.string()),
    context: v.optional(v.string()),
    referenceScript: v.optional(v.string()),
    goodExamples: v.optional(v.array(v.string())),
    badExamples: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { id, ...updates } = args;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("questions") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.delete(args.id);
  },
});

export const reorder = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("questions"),
        sortOrder: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    for (const update of args.updates) {
      await ctx.db.patch(update.id, {
        sortOrder: update.sortOrder,
        updatedAt: Date.now(),
      });
    }
  },
});
