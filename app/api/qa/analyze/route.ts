import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import type { Langfuse } from "langfuse";
import type { QaQuestion, QaResult } from "@/types/qa";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const qaResponseSchema = z.object({
  answer: z.string().describe("The selected answer from the possible answers list"),
  justification: z.string().describe("One sentence explaining why this answer was chosen based on the transcription"),
});

export async function POST(request: NextRequest) {
  // Get global Langfuse instance
  const langfuse = (global as any).langfuse as Langfuse;

  if (!langfuse) {
    console.error("Langfuse not initialized");
    return NextResponse.json(
      { error: "Observability service not available" },
      { status: 500 }
    );
  }

  // Create Langfuse trace for this QA analysis session
  const trace = langfuse.trace({
    name: "qa-analysis-session",
    metadata: {
      endpoint: "/api/qa/analyze",
      timestamp: Date.now(),
    },
    tags: ["qa-analysis", "production"],
  });

  try {
    const body = await request.json();
    const { callId, force = false } = body;

    if (!callId) {
      return NextResponse.json(
        { error: "Missing required field: callId" },
        { status: 400 }
      );
    }

    if (force) {
      await convex.mutation(api.transcriptions.clearQaAnalysis, { callId });
    }

    // Update trace with callId as session ID
    trace.update({
      sessionId: callId,
      input: { callId },
    });

    const [transcription, call] = await Promise.all([
      convex.query(api.transcriptions.getByCallId, { callId }),
      convex.query(api.calls.getByCallId, { callId }),
    ]);

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcription not found" },
        { status: 404 }
      );
    }

    const agentName = call?.agentName ?? null;

    trace.update({
      metadata: {
        endpoint: "/api/qa/analyze",
        timestamp: Date.now(),
        agentName,
      },
    });

    const questionsPath = join(process.cwd(), "config", "qa-questions.json");
    const questions: QaQuestion[] = JSON.parse(readFileSync(questionsPath, "utf-8"));

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No QA questions found in configuration" },
        { status: 400 }
      );
    }

    console.log(`Analyzing ${questions.length} QA questions...`);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const results: QaResult[] = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      // Rate limiting: 4s delay between requests (15 RPM for Gemini free tier)
      if (i > 0) {
        await delay(4000);
      }

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
3. Porównaj te fragmenty z kryteriami dla każdej możliwej odpowiedzi (np. Tak / Częściowo / Nie).
4. Wybierz odpowiedź, która NAJLEPIEJ pasuje do znalezionych fragmentów.
5. Uzasadnij decyzję, podając kluczowe cytaty z transkrypcji oraz krótkie, logiczne wyjaśnienie.

Bądź sprawiedliwy, ale wymagający - klient płaci za wysoką jakość obsługi.`;

      const userPrompt = `<transcription>
${transcription.text}
</transcription>

<evaluation_criteria>
Question: ${question.question}
${question.context ? `Context: ${question.context}\n` : ''}${question.reference_script ? `Reference Script: ${question.reference_script}\n` : ''}</evaluation_criteria>

<possible_answers>
${question.possibleAnswers.map((a) => `- ${a}`).join("\n")}
</possible_answers>

Select the most appropriate answer and provide a one-sentence justification based on the transcription.`;

      const modelName = "gemini-2.5-flash-lite";
      const generation = trace.generation({
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
        // Retry logic with exponential backoff for 503 errors
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
              maxRetries: 0, // Disable built-in retries, we handle them ourselves
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

            // Check for PROHIBITED_CONTENT (content blocked by safety filters)
            const errorString = String(err);
            const isProhibitedContent = errorString.includes("PROHIBITED_CONTENT") ||
              lastError.message.includes("PROHIBITED_CONTENT");

            if (isProhibitedContent) {
              throw new Error("Content blocked by safety filters (PROHIBITED_CONTENT)");
            }

            const isOverloaded = lastError.message.includes("overloaded") ||
                                 lastError.message.includes("503") ||
                                 lastError.message.includes("UNAVAILABLE");

            if (isOverloaded && attempt < maxRetries) {
              const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // 5s, 10s, 20s, 40s
              console.log(`Model overloaded (attempt ${attempt}/${maxRetries}), retrying in ${delayMs / 1000}s...`);
              await delay(delayMs);
            } else if (!isOverloaded) {
              throw err; // Non-retryable error
            } else {
              throw err; // Max retries exceeded
            }
          }
        }

        if (!object || !usage) {
          throw lastError || new Error("Failed to generate response");
        }

        generation.end({
          output: object,
          usage: {
            input: usage.inputTokens,
            output: usage.outputTokens,
            total: usage.totalTokens,
          },
        });

        // Temporary logging for live comparison
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

        generation.end({
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

    // Update trace with final output
    trace.update({
      output: {
        success: true,
        resultsCount: results.length,
        results,
      },
    });

    // Flush Langfuse data before response (important for serverless)
    await langfuse.flushAsync();

    // Check if all questions failed
    const errorCount = results.filter(r => r.answer === "Error").length;
    const allFailed = errorCount === results.length && results.length > 0;

    if (allFailed) {
      return NextResponse.json({
        success: false,
        error: "All questions failed analysis - content may be blocked by safety filters",
        results,
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("QA analysis error:", error);

    // Update trace with error
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
    });

    // Flush even on error
    await langfuse.flushAsync();

    return NextResponse.json(
      {
        error: "Failed to analyze QA",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
