import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { formatUtterancesAsDialog } from "@/lib/transcription";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import type { Langfuse, LangfuseTraceClient } from "langfuse";
import type { QaQuestion, QaResult } from "@/types/qa";

const qaResponseSchema = z.object({
  answer: z.string().describe("The selected answer from the possible answers list"),
  justification: z.string().describe("One sentence explaining why this answer was chosen based on the transcription"),
});

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

export interface AnalyzeCallResult {
  success: boolean;
  results: QaResult[];
  error?: string;
}

export async function analyzeCall(
  callId: string,
  force: boolean = false,
  langfuse?: Langfuse
): Promise<AnalyzeCallResult> {
  const convex = getConvexClient();

  let trace: LangfuseTraceClient | null = null;
  if (langfuse) {
    trace = langfuse.trace({
      name: "qa-analysis-session",
      sessionId: callId,
      metadata: {
        endpoint: "analyzeCall",
        timestamp: Date.now(),
      },
      tags: ["qa-analysis", "production"],
      input: { callId },
    });
  }

  try {
    if (force) {
      await convex.mutation(api.transcriptions.clearQaAnalysis, { callId });
    }

    const [transcription, call] = await Promise.all([
      convex.query(api.transcriptions.getByCallId, { callId }),
      convex.query(api.calls.getByCallId, { callId }),
    ]);

    if (!transcription) {
      return { success: false, results: [], error: "Transcription not found" };
    }

    const formattedTranscript = transcription.utterances?.length
      ? formatUtterancesAsDialog(transcription.utterances)
      : transcription.text;

    const agentName = call?.agentName ?? null;

    if (trace) {
      trace.update({
        metadata: {
          endpoint: "analyzeCall",
          timestamp: Date.now(),
          agentName,
        },
      });
    }

    const questionsPath = join(process.cwd(), "config", "qa-questions.json");
    const questions: QaQuestion[] = JSON.parse(readFileSync(questionsPath, "utf-8"));

    if (questions.length === 0) {
      return { success: false, results: [], error: "No QA questions found in configuration" };
    }

    console.log(`Analyzing ${questions.length} QA questions...`);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const results: QaResult[] = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      console.log(`Processing question ${i + 1}/${questions.length}: ${question.id}`);

      const agentInfo = agentName ? `Agent prowadzący rozmowę: ${agentName}.\n` : '';

      const systemPrompt = `Jesteś analitykiem QA w firmie Hadyński Inkaso i oceniasz transkrypcje rozmów z call center.
${agentInfo}Rozmowę prowadzi agent Hadyński Inkaso, którego zadaniem jest pobranie od klienta informacji o jego sytuacji oraz o jego dłużniku.
Twoim zadaniem jest odpowiadanie na pytania wyłącznie na podstawie dostarczonej transkrypcji.
Musisz wybrać dokładnie jedną odpowiedź z listy możliwych odpowiedzi.
WAŻNE: Odpowiadaj wyłącznie DOKŁADNYM brzmieniem jednej z odpowiedzi z listy – nie używaj numerów ani skrótów.
Do każdej odpowiedzi dołącz jedno zwięzłe zdanie uzasadnienia, które:
- dosłownie cytuje kluczowy fragment transkrypcji (w cudzysłowie),
- jasno wyjaśnia, dlaczego ten cytat spełnia kryteria wybranej odpowiedzi.
Jeśli jest niepewność (np. niepełne informacje, sprzeczne sygnały), wybierz odpowiedź najlepiej wspartą transkrypcją i w uzasadnieniu wyraźnie zaznacz tę niepewność.

PROCES OCENY:
1. Przeczytaj pytanie i kontekst oceny.
2. Znajdź w transkrypcie najważniejsze fragmenty związane z pytaniem (cytuj je dosłownie).
3. Porównaj te fragmenty z kryteriami dla każdej możliwej odpowiedzi (np. Tak / Nie / Nie dotyczy).
4. Wybierz odpowiedź, która NAJLEPIEJ pasuje do znalezionych fragmentów.
5. Uzasadnij decyzję, podając kluczowe cytaty z transkrypcji oraz krótkie, logiczne wyjaśnienie.

Bądź sprawiedliwy, ale wymagający - klient płaci za wysoką jakość obsługi.`;

      const goodExamplesSection = question.goodExamples?.length
        ? `\nGood Examples (patterns that satisfy criteria):\n${question.goodExamples.map((e) => `- "${e}"`).join("\n")}\n`
        : '';
      const badExamplesSection = question.badExamples?.length
        ? `\nBad Examples (patterns that do NOT satisfy criteria):\n${question.badExamples.map((e) => `- "${e}"`).join("\n")}\n`
        : '';

      const userPrompt = `<transcription>
${formattedTranscript}
</transcription>

<evaluation_criteria>
Question: ${question.question}
${question.context ? `Context: ${question.context}\n` : ''}${question.reference_script ? `Reference Script: ${question.reference_script}\n` : ''}${goodExamplesSection}${badExamplesSection}</evaluation_criteria>

<possible_answers>
${question.possibleAnswers.map((a) => `- ${a}`).join("\n")}
</possible_answers>

Select the most appropriate answer and provide a one-sentence justification based on the transcription.`;

      const modelName = "gemini-2.5-flash-lite";
      const generation = trace?.generation({
        name: `qa-question-${question.id}`,
        model: modelName,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        metadata: {
          questionId: question.id,
          question: question.question,
          possibleAnswers: question.possibleAnswers,
        },
      });

      try {
        const maxRetries = 5;
        const baseDelayMs = 5000;
        let lastError: Error | null = null;

        let object: z.infer<typeof qaResponseSchema> | null = null;
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
            const isProhibitedContent = errorString.includes("PROHIBITED_CONTENT");

            if (isProhibitedContent) {
              throw new Error("Content blocked by safety filters (PROHIBITED_CONTENT)");
            }
            const isOverloaded = errorString.includes("overloaded") ||
                                 errorString.includes("503") ||
                                 errorString.includes("UNAVAILABLE");
            const isRateLimited = errorString.includes("429") ||
                                  errorString.includes("RESOURCE_EXHAUSTED") ||
                                  errorString.includes("quota");
            const isRetryable = isOverloaded || isRateLimited;

            if (isRetryable && attempt < maxRetries) {
              const apiDelay = isRateLimited ? extractRetryDelay(err) : null;
              const delayMs = apiDelay ?? baseDelayMs * Math.pow(2, attempt - 1);
              const reason = isRateLimited ? "Rate limited" : "Model overloaded";
              console.log(`${reason} (attempt ${attempt}/${maxRetries}), retrying in ${delayMs / 1000}s...`);
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

        console.log(`\n--- Question ${i + 1}/${questions.length} ---`);
        console.log(`Q: ${question.question}`);
        console.log(`A: ${object.answer}`);
        console.log(`Justification: ${object.justification}`);

        results.push({
          questionId: question.id,
          question: question.question,
          answer: object.answer,
          justification: object.justification,
        });
      } catch (error) {
        console.error(`Error analyzing question ${question.id}:`, error);

        generation?.end({
          output: { error: error instanceof Error ? error.message : String(error) },
        });

        results.push({
          questionId: question.id,
          question: question.question,
          answer: "Error",
          justification: `Failed to analyze: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    await convex.mutation(api.transcriptions.saveQaAnalysis, {
      callId,
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
          results,
        },
      });
    }

    if (langfuse) {
      await langfuse.flushAsync();
    }

    const errorCount = results.filter(r => r.answer === "Error").length;
    const allFailed = errorCount === results.length && results.length > 0;

    if (allFailed) {
      return {
        success: false,
        results,
        error: "All questions failed analysis - content may be blocked by safety filters",
      };
    }

    return { success: true, results };
  } catch (error) {
    console.error("QA analysis error:", error);

    if (trace) {
      trace.update({
        output: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    if (langfuse) {
      await langfuse.flushAsync();
    }

    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
