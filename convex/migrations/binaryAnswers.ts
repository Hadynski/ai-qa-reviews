import { internalMutation } from "../_generated/server";

export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    let updated = 0;

    for (const question of questions) {
      const current = question.possibleAnswers;
      const isBinary =
        current.length === 2 &&
        current[0] === "Tak" &&
        current[1] === "Nie";

      if (!isBinary) {
        await ctx.db.patch(question._id, {
          possibleAnswers: ["Tak", "Nie"],
          updatedAt: Date.now(),
        });
        updated++;
      }
    }

    console.log(
      `Binary answers migration: ${updated}/${questions.length} questions updated`
    );
    return { total: questions.length, updated };
  },
});

export const migrateAnswers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const transcriptions = await ctx.db.query("transcriptions").collect();
    let updated = 0;

    for (const transcription of transcriptions) {
      if (!transcription.qaAnalysis) continue;

      let changed = false;
      const results = transcription.qaAnalysis.results.map((result) => {
        if (result.answer !== "Tak" && result.answer !== "Nie") {
          changed = true;
          return { ...result, answer: "Nie" };
        }
        return result;
      });

      if (changed) {
        await ctx.db.patch(transcription._id, {
          qaAnalysis: { ...transcription.qaAnalysis, results },
        });
        updated++;
      }
    }

    console.log(
      `Answer migration: ${updated}/${transcriptions.length} transcriptions updated`
    );
    return { total: transcriptions.length, updated };
  },
});
