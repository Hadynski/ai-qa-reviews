import { NextResponse } from "next/server";
import { syncCallsFromDaktela } from "@/lib/daktela/sync-calls";

export async function GET() {
  try {
    const result = await syncCallsFromDaktela();

    if (result.recordings.length === 0 && result.total === 0) {
      return NextResponse.json({
        recordings: [],
        message: "No active statuses configured for QA filtering",
      });
    }

    return NextResponse.json({
      recordings: result.recordings,
      total: result.total,
    });
  } catch (error) {
    console.error("Daktela API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch recordings from Daktela",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
