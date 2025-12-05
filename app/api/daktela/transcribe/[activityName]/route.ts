import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { getDaktelaToken } from "@/lib/daktela-token";
import { transcribeWithWhisper } from "@/lib/transcription";
import Groq from "groq-sdk";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ activityName: string }> }
) {
  try {
    const convex = getConvexClient();
    const { activityName } = await params;

    if (!activityName) {
      return NextResponse.json(
        { error: "Activity name is required" },
        { status: 400 }
      );
    }

    // Get callId and force from query
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');
    const force = searchParams.get('force') === 'true';

    if (!callId) {
      return NextResponse.json(
        { error: "callId is required" },
        { status: 400 }
      );
    }

    // If force, delete existing transcription first
    if (force) {
      await convex.mutation(api.transcriptions.deleteTranscription, { callId });
    } else {
      // Check if transcription already exists in Convex
      const existingTranscription = await convex.query(
        api.transcriptions.getByCallId,
        { callId }
      );

      if (existingTranscription) {
        return NextResponse.json({
          activityName,
          transcription: {
            text: existingTranscription.text,
            language_code: existingTranscription.languageCode,
            words: existingTranscription.words || [],
          },
          fromCache: true,
        });
      }
    }

    // Step 1: Fetch the audio file from Daktela
    const token = await getDaktelaToken();
    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, '');

    if (!daktelaUrl) {
      throw new Error("DAKTELA_URL not configured");
    }

    const audioUrl = `${daktelaUrl}/file/recording/${activityName}?accessToken=${token}`;

    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio from Daktela: ${audioResponse.statusText}`);
    }

    // Convert to buffer
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // Step 2: Transcribe with Groq Whisper (includes upsampling)
    const transcription = await transcribeWithWhisper(
      audioBuffer,
      `${activityName}.wav`
    );

    // Map response to existing format
    const transcriptionData = {
      text: transcription.text,
      language_code: transcription.language_code,
      words: [],
    };

    // Save to Convex
    await convex.mutation(api.transcriptions.upsertTranscription, {
      callId,
      text: transcriptionData.text,
      languageCode: transcriptionData.language_code,
      words: transcriptionData.words,
    });

    return NextResponse.json({
      activityName,
      transcription: transcriptionData,
      fromCache: false,
    });
  } catch (error) {
    console.error("Transcription error:", error);

    // Handle Groq-specific errors
    if (error instanceof Groq.AuthenticationError) {
      return NextResponse.json(
        { error: "Invalid Groq API key", code: "INVALID_API_KEY" },
        { status: 401 }
      );
    }

    // Check for file size error (413)
    if (error instanceof Error) {
      const errorMessage = error.message || '';
      const errorObj = error as any;

      if (errorObj.status === 413 || errorMessage.includes('413') || errorMessage.includes('Too Large')) {
        return NextResponse.json(
          {
            error: "Audio file too large for transcription (max ~25MB). This call recording is too long.",
            code: "FILE_TOO_LARGE",
          },
          { status: 413 }
        );
      }

      if (errorObj.status === 429 || errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        return NextResponse.json(
          {
            error: "Transcription rate limit exceeded. Please wait a moment and try again.",
            code: "RATE_LIMIT",
          },
          { status: 429 }
        );
      }

      if (errorMessage.includes('Failed to fetch audio')) {
        return NextResponse.json(
          {
            error: "Could not download audio recording from Daktela. The recording may not exist.",
            code: "AUDIO_NOT_FOUND",
          },
          { status: 404 }
        );
      }

      if (errorMessage.includes('ffmpeg')) {
        return NextResponse.json(
          {
            error: "Audio processing failed. FFmpeg error during audio conversion.",
            code: "FFMPEG_ERROR",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to transcribe audio",
        code: "UNKNOWN_ERROR",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
