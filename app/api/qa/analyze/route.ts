import { NextRequest, NextResponse } from "next/server";
import { analyzeCall } from "@/lib/qa/analyze-call";
import type { Langfuse } from "langfuse";

export async function POST(request: NextRequest) {
  const langfuse = (global as any).langfuse as Langfuse | undefined;

  if (!langfuse) {
    console.error("Langfuse not initialized");
    return NextResponse.json(
      { error: "Observability service not available" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { callId, force = false } = body;

    if (!callId) {
      return NextResponse.json(
        { error: "Missing required field: callId" },
        { status: 400 }
      );
    }

    const result = await analyzeCall(callId, force, langfuse);

    if (!result.success) {
      const status = result.error === "Transcription not found" ? 404 :
                     result.error?.includes("All questions failed") ? 422 : 500;
      return NextResponse.json({
        success: false,
        error: result.error,
        results: result.results,
      }, { status });
    }

    return NextResponse.json({
      success: true,
      results: result.results,
    });
  } catch (error) {
    console.error("QA analysis error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze QA",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
