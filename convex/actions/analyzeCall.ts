"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

interface Utterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
}

interface LangfuseGeneration {
  update: (args: { output?: unknown; metadata?: unknown }) => void;
}

interface LangfuseTrace {
  generation: (args: unknown) => LangfuseGeneration;
  update: (args: { output?: unknown; metadata?: unknown }) => void;
}

interface LangfuseClient {
  trace: (args: unknown) => LangfuseTrace;
  flushAsync?: () => Promise<void>;
}

function mergeConsecutiveUtterances(utterances: Utterance[]): Utterance[] {
  if (utterances.length === 0) return [];

  const merged: Utterance[] = [];
  let current = { ...utterances[0] };

  for (let i = 1; i < utterances.length; i++) {
    if (utterances[i].speaker === current.speaker) {
      current.transcript += " " + utterances[i].transcript;
      current.end = utterances[i].end;
    } else {
      merged.push(current);
      current = { ...utterances[i] };
    }
  }
  merged.push(current);

  return merged;
}

function formatUtterancesAsDialog(utterances: Utterance[]): string {
  if (!utterances.length) return "";

  return mergeConsecutiveUtterances(utterances)
    .map((u) => `[Speaker ${u.speaker}]: ${u.transcript}`)
    .join("\n\n");
}

function extractRetryDelay(error: unknown): number | null {
  const errorStr = String(error);
  const patterns = [
    /retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i,
    /"retryDelay":\s*"(\d+(?:\.\d+)?)\s*s"/i,
  ];
  for (const pattern of patterns) {
    const match = errorStr.match(pattern);
    if (match) {
      return Math.ceil(parseFloat(match[1]) * 1000);
    }
  }
  return null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const analyzeCall = internalAction({
  args: {
    callId: v.string(),
    questionGroupId: v.id("questionGroups"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; resultsCount: number; errorCount: number }> => {
    const { google } = await import("@ai-sdk/google");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const qaResponseSchema = z.object({
      thought_process: z
        .string()
        .describe(
          "Chain of thought analysis with quotes from transcription and logical reasoning"
        ),
      answer: z
        .string()
        .describe("The selected answer from the possible answers list"),
      justification: z
        .string()
        .describe(
          "One sentence explaining why this answer was chosen based on the transcription"
        ),
    });

    const transcription = await ctx.runQuery(
      internal.transcriptions.getByCallIdInternal,
      { callId: args.callId }
    );

    if (!transcription) {
      throw new Error(`Transcription not found for callId: ${args.callId}`);
    }

    const call = await ctx.runQuery(internal.calls.getByCallIdInternal, {
      callId: args.callId,
    });

    const group = await ctx.runQuery(internal.questionGroups.getInternal, {
      id: args.questionGroupId,
    });

    if (!group) {
      throw new Error(`Question group not found: ${args.questionGroupId}`);
    }

    const questions = await ctx.runQuery(
      internal.questions.listActiveByGroupInternal,
      { groupId: args.questionGroupId }
    );

    if (questions.length === 0) {
      throw new Error("No active questions found for this group");
    }

    const formattedTranscript = transcription.utterances?.length
      ? formatUtterancesAsDialog(transcription.utterances)
      : transcription.text;

    let agentName: string | null = null;
    if (call?.agentId) {
      const agent = await ctx.runQuery(internal.agents.getInternal, {
        id: call.agentId,
      });
      if (agent) agentName = agent.displayName;
    }
    const agentInfo = agentName
      ? `Agent prowadzacy rozmowe: ${agentName}.\n`
      : "";

    let langfuse: LangfuseClient | null = null;
    let trace: LangfuseTrace | null = null;

    try {
      const { Langfuse } = await import("langfuse");
      if (
        process.env.LANGFUSE_SECRET_KEY &&
        process.env.LANGFUSE_PUBLIC_KEY
      ) {
        langfuse = new Langfuse({
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          baseUrl: process.env.LANGFUSE_BASE_URL,
        }) as LangfuseClient;
        trace = langfuse.trace({
          name: "qa-analysis-session",
          sessionId: args.callId,
          metadata: { timestamp: Date.now(), agentName, groupName: group.name },
          tags: ["qa-analysis", "pipeline"],
          input: { callId: args.callId, questionGroupId: args.questionGroupId },
        });
      }
    } catch {
      // Langfuse not available, continue without tracing
    }

    console.log(
      `[AnalyzeCall] Analyzing ${questions.length} questions for ${args.callId} (group: ${group.name})`
    );

    const results = await Promise.all(
      questions.map(async (question, i) => {
        const systemPrompt = group.systemPrompt.includes("{{agentName}}")
          ? group.systemPrompt.replaceAll("{{agentName}}", agentName ?? "")
          : `${group.systemPrompt}\n${agentInfo}`;

        const contextSection = question.context
          ? `\n<rules>\n${question.context}\n</rules>\n`
          : "";

        const referenceSection = question.referenceScript
          ? `\n<reference_script>\n${question.referenceScript}\n</reference_script>\n`
          : "";

        const goodExamplesSection = question.goodExamples?.length
          ? `\n<examples_positive>\n${question.goodExamples.map((e) => `- "${e}"`).join("\n")}\n</examples_positive>\n`
          : "";

        const badExamplesSection = question.badExamples?.length
          ? `\n<examples_negative>\n${question.badExamples.map((e) => `- "${e}"`).join("\n")}\n</examples_negative>\n`
          : "";

        const userPrompt = `<transcription>
${formattedTranscript}
</transcription>

<question>
${question.question}
</question>
${contextSection}${referenceSection}${goodExamplesSection}${badExamplesSection}
<possible_answers>
${question.possibleAnswers.map((a) => `- ${a}`).join("\n")}
</possible_answers>`;

        const modelName = "gemini-3-flash-preview";
        const generation = trace?.generation({
          name: `qa-question-${question.questionId}`,
          model: modelName,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          metadata: {
            questionId: question.questionId,
            question: question.question,
            possibleAnswers: question.possibleAnswers,
          },
        }) as { end: (data: unknown) => void } | undefined;

        try {
          const maxRetries = 5;
          const baseDelayMs = 5000;
          let lastError: Error | null = null;
          let object: { thought_process: string; answer: string; justification: string } | null = null;
          let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null = null;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const result = await generateObject({
                model: google(modelName),
                schema: qaResponseSchema,
                system: systemPrompt,
                prompt: userPrompt,
                maxRetries: 0,
              });
              object = result.object;
              usage = {
                inputTokens: result.usage.inputTokens ?? 0,
                outputTokens: result.usage.outputTokens ?? 0,
                totalTokens: result.usage.totalTokens ?? 0,
              };
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));

              const errorString = lastError.message + String(err);
              const isProhibitedContent =
                errorString.includes("PROHIBITED_CONTENT");

              if (isProhibitedContent) {
                throw new Error(
                  "Content blocked by safety filters (PROHIBITED_CONTENT)"
                );
              }

              const isRetryable =
                errorString.includes("overloaded") ||
                errorString.includes("503") ||
                errorString.includes("UNAVAILABLE") ||
                errorString.includes("429") ||
                errorString.includes("RESOURCE_EXHAUSTED") ||
                errorString.includes("quota");

              const isRateLimited =
                errorString.includes("429") ||
                errorString.includes("RESOURCE_EXHAUSTED");

              if (isRetryable && attempt < maxRetries) {
                const apiDelay = isRateLimited
                  ? extractRetryDelay(err)
                  : null;
                const delayMs =
                  apiDelay ?? baseDelayMs * Math.pow(2, attempt - 1);
                console.log(
                  `[AnalyzeCall] Retry ${attempt}/${maxRetries} for question ${question.questionId}, waiting ${delayMs / 1000}s`
                );
                await delay(delayMs);
              } else {
                throw err;
              }
            }
          }

          if (!object || !usage) {
            throw lastError || new Error("Failed to generate response");
          }

          generation?.end({
            output: object,
            usage: {
              input: usage.inputTokens,
              output: usage.outputTokens,
              total: usage.totalTokens,
            },
          });

          console.log(
            `[AnalyzeCall] Q${i + 1}/${questions.length} ${question.questionId}: ${object.answer}`
          );

          return {
            questionId: question.questionId,
            question: question.question,
            answer: object.answer,
            justification: object.justification,
          };
        } catch (error) {
          console.error(
            `[AnalyzeCall] Error analyzing ${question.questionId}:`,
            error
          );

          generation?.end({
            output: {
              error:
                error instanceof Error ? error.message : String(error),
            },
          });

          return {
            questionId: question.questionId,
            question: question.question,
            answer: "Error",
            justification: `Failed to analyze: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      })
    );

    await ctx.runMutation(internal.transcriptions.saveQaAnalysisInternal, {
      callId: args.callId,
      qaAnalysis: {
        completedAt: Date.now(),
        results,
      },
    });

    if (trace) {
      trace.update({
        output: {
          success: true,
          resultsCount: results.length,
        },
      });
    }

    if (langfuse?.flushAsync) {
      await langfuse.flushAsync();
    }

    const errorCount = results.filter((r) => r.answer === "Error").length;
    if (errorCount === results.length && results.length > 0) {
      throw new Error(
        "All questions failed analysis - content may be blocked by safety filters"
      );
    }

    console.log(
      `[AnalyzeCall] Completed analysis for ${args.callId}: ${results.length} questions, ${errorCount} errors`
    );

    return { success: true, resultsCount: results.length, errorCount };
  },
});
