import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { transcribeCall } from '@/lib/daktela/transcribe-call';
import { HumanQaReview } from '@/types/qa';

interface ProcessReviewRequest {
  activityName: string;
  callId: string;
  qareviewAnswers: Record<string, string[]>;
  reviewId: string;
  reviewedBy?: string;
  reviewedAt?: string;
  forceTranscribe?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ProcessReviewRequest = await request.json();
    const { activityName, callId, qareviewAnswers, reviewId, reviewedBy, reviewedAt, forceTranscribe = false } = body;

    if (!activityName || !callId) {
      return NextResponse.json(
        { error: 'activityName and callId are required' },
        { status: 400 }
      );
    }

    const results: {
      transcription: boolean;
      transcriptionFromCache: boolean;
      aiAnalysis: boolean;
      humanQaReview: boolean;
      error?: string;
    } = {
      transcription: false,
      transcriptionFromCache: false,
      aiAnalysis: false,
      humanQaReview: false,
    };

    // Step 1: Get or create transcription (direct call, no HTTP)
    try {
      const transcribeResult = await transcribeCall(activityName, callId, forceTranscribe);
      results.transcription = true;
      results.transcriptionFromCache = transcribeResult.fromCache;
    } catch (error) {
      results.error = `Transcription error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return NextResponse.json(results, { status: 500 });
    }

    // Step 2: Run AI analysis
    try {
      const baseUrl = request.nextUrl.origin;
      const analyzeResponse = await fetch(`${baseUrl}/api/qa/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, force: forceTranscribe }),
      });

      const analyzeData = await analyzeResponse.json();

      if (analyzeResponse.ok && analyzeData.success !== false) {
        results.aiAnalysis = true;
      } else {
        results.error = `AI analysis failed: ${analyzeData.error || 'Unknown error'}`;
        results.aiAnalysis = false;
      }
    } catch (error) {
      results.error = `AI analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    // Step 3: Save human QA review
    try {
      const convex = getConvexClient();
      const humanQaReview: HumanQaReview = {
        reviewId,
        activityName,
        qareviewAnswers,
        fetchedAt: Date.now(),
        // Only include optional fields if they have values
        ...(reviewedAt && { reviewedAt }),
        ...(reviewedBy && { reviewedBy }),
      };

      await convex.mutation(api.transcriptions.saveHumanQaReview, {
        callId,
        humanQaReview,
      });

      results.humanQaReview = true;
    } catch (error) {
      // This might fail if transcription wasn't saved yet
      console.error('Failed to save human QA review:', error);
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('Error processing review:', error);
    return NextResponse.json(
      { error: 'Failed to process review' },
      { status: 500 }
    );
  }
}
