import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("agents").collect();
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const upsertInternal = internalMutation({
  args: {
    username: v.string(),
    displayName: v.string(),
    extension: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        extension: args.extension,
      });
      return existing._id;
    }

    return await ctx.db.insert("agents", {
      username: args.username,
      displayName: args.displayName,
      extension: args.extension,
      createdAt: Date.now(),
    });
  },
});
