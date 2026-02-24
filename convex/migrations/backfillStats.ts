import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingCallStats = await ctx.db.query("callStats").collect();
    for (const row of existingCallStats) {
      await ctx.db.delete(row._id);
    }
    const existingQuestionStats = await ctx.db.query("questionStats").collect();
    for (const row of existingQuestionStats) {
      await ctx.db.delete(row._id);
    }

    const analyzedCalls = await ctx.db
      .query("calls")
      .withIndex("by_processing_status", (q) =>
        q.eq("processingStatus", "analyzed")
      )
      .collect();

    const callStatsMap = new Map<
      string,
      {
        agentId: Id<"agents">;
        questionGroupId: Id<"questionGroups">;
        analyzedCount: number;
        totalScore: number;
        totalDuration: number;
      }
    >();
    const questionStatsMap = new Map<
      string,
      {
        questionId: string;
        groupId: Id<"questionGroups">;
        takCount: number;
        nieCount: number;
        totalCount: number;
      }
    >();

    let processed = 0;

    for (const call of analyzedCalls) {
      if (!call.agentId || !call.questionGroupId) continue;

      const transcription = await ctx.db
        .query("transcriptions")
        .withIndex("by_call_id", (q) => q.eq("callId", call.callId))
        .first();
      if (!transcription?.qaAnalysis) continue;

      const results = transcription.qaAnalysis.results;
      const takCount = results.filter((r) => r.answer === "Tak").length;
      const qaScore =
        results.length > 0
          ? Math.round((takCount / results.length) * 100)
          : 0;

      await ctx.db.patch(call._id, { qaScore });

      const csKey = `${call.agentId}:${call.questionGroupId}`;
      const cs = callStatsMap.get(csKey) ?? {
        agentId: call.agentId,
        questionGroupId: call.questionGroupId,
        analyzedCount: 0,
        totalScore: 0,
        totalDuration: 0,
      };
      cs.analyzedCount += 1;
      cs.totalScore += qaScore;
      cs.totalDuration += call.duration ?? 0;
      callStatsMap.set(csKey, cs);

      for (const result of results) {
        const existing = questionStatsMap.get(result.questionId) ?? {
          questionId: result.questionId,
          groupId: call.questionGroupId,
          takCount: 0,
          nieCount: 0,
          totalCount: 0,
        };
        existing.takCount += result.answer === "Tak" ? 1 : 0;
        existing.nieCount += result.answer === "Nie" ? 1 : 0;
        existing.totalCount += 1;
        questionStatsMap.set(result.questionId, existing);
      }

      processed++;
    }

    const now = Date.now();
    for (const cs of callStatsMap.values()) {
      await ctx.db.insert("callStats", { ...cs, lastUpdatedAt: now });
    }
    for (const qs of questionStatsMap.values()) {
      await ctx.db.insert("questionStats", { ...qs, lastUpdatedAt: now });
    }

    console.log(
      `Backfill complete: ${processed} calls, ${callStatsMap.size} callStats rows, ${questionStatsMap.size} questionStats rows`
    );

    return {
      processedCalls: processed,
      callStatsRows: callStatsMap.size,
      questionStatsRows: questionStatsMap.size,
    };
  },
});
