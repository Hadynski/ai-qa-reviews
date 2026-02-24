import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./authHelpers";

const MAX_KEYTERMS = 100;
const MAX_KEYTERM_LENGTH = 50;

export const getElevenLabsKeyterms = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "elevenlabs_keyterms"))
      .unique();
    return (setting?.value as string[]) ?? [];
  },
});

export const getElevenLabsKeytermsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "elevenlabs_keyterms"))
      .unique();
    return (setting?.value as string[]) ?? [];
  },
});

export const setElevenLabsKeyterms = mutation({
  args: { keyterms: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    if (args.keyterms.length > MAX_KEYTERMS) {
      throw new Error(`Maximum ${MAX_KEYTERMS} keyterms allowed`);
    }

    for (const term of args.keyterms) {
      if (term.trim().length === 0) {
        throw new Error("Empty keyterms are not allowed");
      }
      if (term.length > MAX_KEYTERM_LENGTH) {
        throw new Error(
          `Keyterm "${term.slice(0, 20)}..." exceeds ${MAX_KEYTERM_LENGTH} characters`
        );
      }
    }

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "elevenlabs_keyterms"))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.keyterms,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("settings", {
        key: "elevenlabs_keyterms",
        value: args.keyterms,
        updatedAt: Date.now(),
      });
    }
  },
});
