import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuth } from "./authHelpers";

type QaResult = {
  questionId: string;
  question: string;
  answer: string;
  justification: string;
};

function computeQaScore(results: QaResult[]): number {
  if (results.length === 0) return 0;
  const takCount = results.filter((r) => r.answer === "Tak").length;
  return Math.round((takCount / results.length) * 100);
}

async function getOrCreateCallStats(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  questionGroupId: Id<"questionGroups">
): Promise<Doc<"callStats">> {
  const existing = await ctx.db
    .query("callStats")
    .withIndex("by_agent_and_group", (q) =>
      q.eq("agentId", agentId).eq("questionGroupId", questionGroupId)
    )
    .first();

  if (existing) return existing;

  const id = await ctx.db.insert("callStats", {
    agentId,
    questionGroupId,
    analyzedCount: 0,
    totalScore: 0,
    totalDuration: 0,
    lastUpdatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

async function getOrCreateQuestionStats(
  ctx: MutationCtx,
  questionId: string,
  groupId: Id<"questionGroups">
): Promise<Doc<"questionStats">> {
  const existing = await ctx.db
    .query("questionStats")
    .withIndex("by_question", (q) => q.eq("questionId", questionId))
    .first();

  if (existing) return existing;

  const id = await ctx.db.insert("questionStats", {
    questionId,
    groupId,
    takCount: 0,
    nieCount: 0,
    totalCount: 0,
    lastUpdatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

export async function applyStatsAfterAnalysis(
  ctx: MutationCtx,
  callId: string,
  qaResults: QaResult[]
) {
  const call = await ctx.db
    .query("calls")
    .withIndex("by_call_id", (q) => q.eq("callId", callId))
    .first();
  if (!call || !call.agentId || !call.questionGroupId) return;

  const qaScore = computeQaScore(qaResults);
  await ctx.db.patch(call._id, { qaScore });

  const stats = await getOrCreateCallStats(
    ctx,
    call.agentId,
    call.questionGroupId
  );
  await ctx.db.patch(stats._id, {
    analyzedCount: stats.analyzedCount + 1,
    totalScore: stats.totalScore + qaScore,
    totalDuration: stats.totalDuration + (call.duration ?? 0),
    lastUpdatedAt: Date.now(),
  });

  for (const result of qaResults) {
    const qs = await getOrCreateQuestionStats(
      ctx,
      result.questionId,
      call.questionGroupId
    );
    await ctx.db.patch(qs._id, {
      takCount: qs.takCount + (result.answer === "Tak" ? 1 : 0),
      nieCount: qs.nieCount + (result.answer === "Nie" ? 1 : 0),
      totalCount: qs.totalCount + 1,
      lastUpdatedAt: Date.now(),
    });
  }
}

export async function revertStatsForCall(ctx: MutationCtx, callId: string) {
  const call = await ctx.db
    .query("calls")
    .withIndex("by_call_id", (q) => q.eq("callId", callId))
    .first();
  if (!call || !call.agentId || !call.questionGroupId) return;

  const transcription = await ctx.db
    .query("transcriptions")
    .withIndex("by_call_id", (q) => q.eq("callId", callId))
    .first();
  if (!transcription?.qaAnalysis) return;

  const qaScore = call.qaScore ?? 0;

  const stats = await ctx.db
    .query("callStats")
    .withIndex("by_agent_and_group", (q) =>
      q.eq("agentId", call.agentId!).eq("questionGroupId", call.questionGroupId!)
    )
    .first();
  if (stats) {
    await ctx.db.patch(stats._id, {
      analyzedCount: Math.max(0, stats.analyzedCount - 1),
      totalScore: Math.max(0, stats.totalScore - qaScore),
      totalDuration: Math.max(0, stats.totalDuration - (call.duration ?? 0)),
      lastUpdatedAt: Date.now(),
    });
  }

  for (const result of transcription.qaAnalysis.results) {
    const qs = await ctx.db
      .query("questionStats")
      .withIndex("by_question", (q) => q.eq("questionId", result.questionId))
      .first();
    if (qs) {
      await ctx.db.patch(qs._id, {
        takCount: Math.max(0, qs.takCount - (result.answer === "Tak" ? 1 : 0)),
        nieCount: Math.max(0, qs.nieCount - (result.answer === "Nie" ? 1 : 0)),
        totalCount: Math.max(0, qs.totalCount - 1),
        lastUpdatedAt: Date.now(),
      });
    }
  }

  await ctx.db.patch(call._id, { qaScore: undefined });
}

export async function applyStatsAfterAnswerEdit(
  ctx: MutationCtx,
  callId: string,
  questionId: string,
  oldAnswer: string,
  newAnswer: string
) {
  if (oldAnswer === newAnswer) return;

  const call = await ctx.db
    .query("calls")
    .withIndex("by_call_id", (q) => q.eq("callId", callId))
    .first();
  if (!call || !call.agentId || !call.questionGroupId) return;

  const qs = await ctx.db
    .query("questionStats")
    .withIndex("by_question", (q) => q.eq("questionId", questionId))
    .first();
  if (qs) {
    await ctx.db.patch(qs._id, {
      takCount: qs.takCount + (newAnswer === "Tak" ? 1 : 0) - (oldAnswer === "Tak" ? 1 : 0),
      nieCount: qs.nieCount + (newAnswer === "Nie" ? 1 : 0) - (oldAnswer === "Nie" ? 1 : 0),
      lastUpdatedAt: Date.now(),
    });
  }

  const transcription = await ctx.db
    .query("transcriptions")
    .withIndex("by_call_id", (q) => q.eq("callId", callId))
    .first();
  if (!transcription?.qaAnalysis) return;

  const newScore = computeQaScore(transcription.qaAnalysis.results);
  const oldScore = call.qaScore ?? 0;
  const scoreDelta = newScore - oldScore;

  await ctx.db.patch(call._id, { qaScore: newScore });

  if (scoreDelta !== 0) {
    const stats = await ctx.db
      .query("callStats")
      .withIndex("by_agent_and_group", (q) =>
        q.eq("agentId", call.agentId!).eq("questionGroupId", call.questionGroupId!)
      )
      .first();
    if (stats) {
      await ctx.db.patch(stats._id, {
        totalScore: stats.totalScore + scoreDelta,
        lastUpdatedAt: Date.now(),
      });
    }
  }
}

// --- Internal mutations (for scheduling from actions if needed) ---

export const updateStatsAfterAnalysis = internalMutation({
  args: {
    callId: v.string(),
    results: v.array(
      v.object({
        questionId: v.string(),
        question: v.string(),
        answer: v.string(),
        justification: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await applyStatsAfterAnalysis(ctx, args.callId, args.results);
  },
});

export const revertStats = internalMutation({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    await revertStatsForCall(ctx, args.callId);
  },
});

// --- Public queries ---

export const getAgentOverview = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const rows = await ctx.db
      .query("callStats")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    const withGroups = await Promise.all(
      rows.map(async (row) => {
        const group = await ctx.db.get(row.questionGroupId);
        return {
          ...row,
          groupName: group?.displayName ?? "Unknown",
        };
      })
    );

    const totals = rows.reduce(
      (acc, r) => ({
        analyzedCount: acc.analyzedCount + r.analyzedCount,
        totalScore: acc.totalScore + r.totalScore,
        totalDuration: acc.totalDuration + r.totalDuration,
      }),
      { analyzedCount: 0, totalScore: 0, totalDuration: 0 }
    );

    return {
      groups: withGroups,
      analyzedCount: totals.analyzedCount,
      averageScore:
        totals.analyzedCount > 0
          ? Math.round(totals.totalScore / totals.analyzedCount)
          : 0,
      totalDuration: totals.totalDuration,
    };
  },
});

export const listAgentRanking = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const allStats = await ctx.db.query("callStats").collect();

    const byAgent = new Map<
      string,
      { analyzedCount: number; totalScore: number; totalDuration: number }
    >();
    for (const row of allStats) {
      const agentKey = row.agentId as string;
      const existing = byAgent.get(agentKey) ?? {
        analyzedCount: 0,
        totalScore: 0,
        totalDuration: 0,
      };
      byAgent.set(agentKey, {
        analyzedCount: existing.analyzedCount + row.analyzedCount,
        totalScore: existing.totalScore + row.totalScore,
        totalDuration: existing.totalDuration + row.totalDuration,
      });
    }

    const ranking = await Promise.all(
      Array.from(byAgent.entries()).map(async ([agentId, stats]) => {
        const agent = await ctx.db.get(agentId as Id<"agents">);
        return {
          agentId: agentId as Id<"agents">,
          agentName: agent?.displayName ?? "Unknown",
          analyzedCount: stats.analyzedCount,
          averageScore:
            stats.analyzedCount > 0
              ? Math.round(stats.totalScore / stats.analyzedCount)
              : 0,
          totalDuration: stats.totalDuration,
        };
      })
    );

    return ranking.sort((a, b) => b.averageScore - a.averageScore);
  },
});

export const getQuestionPerformance = query({
  args: { groupId: v.id("questionGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const rows = await ctx.db
      .query("questionStats")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_group_active", (q) => q.eq("groupId", args.groupId))
      .collect();
    const questionMap = new Map(questions.map((q) => [q.questionId, q]));

    const performance = rows.map((row) => {
      const question = questionMap.get(row.questionId);
      return {
        questionId: row.questionId,
        questionText: question?.question ?? "Unknown",
        sortOrder: question?.sortOrder ?? 999,
        takCount: row.takCount,
        nieCount: row.nieCount,
        totalCount: row.totalCount,
        passRate:
          row.totalCount > 0
            ? Math.round((row.takCount / row.totalCount) * 100)
            : 0,
      };
    });

    return performance.sort((a, b) => a.passRate - b.passRate);
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const allCallStats = await ctx.db.query("callStats").collect();
    const allQuestionStats = await ctx.db.query("questionStats").collect();

    const totals = allCallStats.reduce(
      (acc, r) => ({
        analyzedCount: acc.analyzedCount + r.analyzedCount,
        totalScore: acc.totalScore + r.totalScore,
      }),
      { analyzedCount: 0, totalScore: 0 }
    );

    const worstQuestions = await Promise.all(
      allQuestionStats
        .filter((qs) => qs.totalCount > 0)
        .sort((a, b) => {
          const rateA = a.takCount / a.totalCount;
          const rateB = b.takCount / b.totalCount;
          return rateA - rateB;
        })
        .slice(0, 5)
        .map(async (qs) => {
          const question = await ctx.db
            .query("questions")
            .withIndex("by_question_id", (q) => q.eq("questionId", qs.questionId))
            .first();
          return {
            questionId: qs.questionId,
            questionText: question?.question ?? "Unknown",
            passRate:
              qs.totalCount > 0
                ? Math.round((qs.takCount / qs.totalCount) * 100)
                : 0,
            totalCount: qs.totalCount,
          };
        })
    );

    return {
      analyzedCount: totals.analyzedCount,
      averageScore:
        totals.analyzedCount > 0
          ? Math.round(totals.totalScore / totals.analyzedCount)
          : 0,
      worstQuestions,
    };
  },
});
