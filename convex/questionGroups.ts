import { query, mutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";

export async function matchQuestionGroup(
  ctx: Pick<QueryCtx, "db">,
  statusNames: string[]
): Promise<Id<"questionGroups"> | undefined> {
  const groups = await ctx.db
    .query("questionGroups")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect();
  groups.sort((a, b) => a.name.localeCompare(b.name));

  for (const group of groups) {
    if (statusNames.some((sn) => group.statusIds.includes(sn))) {
      return group._id;
    }
  }
  return undefined;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("questionGroups")
      .withIndex("by_name")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("questionGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("questionGroups") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listActiveInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("questionGroups")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export const create = mutation({
  args: {
    displayName: v.string(),
    systemPrompt: v.string(),
    isActive: v.boolean(),
    statusIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const now = Date.now();
    return await ctx.db.insert("questionGroups", {
      ...args,
      name: slugify(args.displayName),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("questionGroups"),
    displayName: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    statusIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Question group not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    if (updates.displayName) {
      patch.name = slugify(updates.displayName);
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("questionGroups") },
  handler: async (ctx, args): Promise<{ deleted: boolean; deactivated: boolean; questionsCount: number }> => {
    await requireRole(ctx, "admin");
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_group_active", (q) => q.eq("groupId", args.id))
      .collect();

    if (questions.length > 0) {
      const group = await ctx.db.get(args.id);
      if (group) {
        await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
      }

      const pendingCalls = await ctx.db
        .query("calls")
        .withIndex("by_processing_status", (q) => q.eq("processingStatus", "synced"))
        .collect();
      const transcribedCalls = await ctx.db
        .query("calls")
        .withIndex("by_processing_status", (q) => q.eq("processingStatus", "transcribed"))
        .collect();

      const affectedCalls = [...pendingCalls, ...transcribedCalls].filter(
        (c) => c.questionGroupId === args.id
      );

      for (const call of affectedCalls) {
        const newGroupId = call.statusNames
          ? await matchQuestionGroup(ctx, call.statusNames)
          : undefined;
        await ctx.db.patch(call._id, {
          questionGroupId: newGroupId,
          processingStatus: newGroupId ? call.processingStatus : "skipped",
          processingError: newGroupId ? undefined : "Question group deactivated, no alternative found",
        });
      }

      return { deleted: false, deactivated: true, questionsCount: questions.length };
    }

    await ctx.db.delete(args.id);
    return { deleted: true, deactivated: false, questionsCount: 0 };
  },
});
