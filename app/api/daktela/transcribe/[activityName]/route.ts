import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { getDaktelaToken } from "@/lib/daktela-token";
import { transcribeWithDeepgram } from "@/lib/transcription";

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

    const { searchParams } = new URL(request.url);
    const callId = searchParams.get("callId");
    const force = searchParams.get("force") === "true";

    if (!callId) {
      return NextResponse.json(
        { error: "callId is required" },
        { status: 400 }
      );
    }

    if (force) {
      await convex.mutation(api.transcriptions.deleteTranscription, { callId });
    } else {
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
            utterances: existingTranscription.utterances || [],
          },
          fromCache: true,
        });
      }
    }

    const token = await getDaktelaToken();
    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");

    if (!daktelaUrl) {
      throw new Error("DAKTELA_URL not configured");
    }

    const audioUrl = `${daktelaUrl}/file/recording/${activityName}?accessToken=${token}`;

    console.log(
      `Fetching audio from: ${daktelaUrl}/file/recording/${activityName}`
    );

    let audioResponse: Response;
    try {
      audioResponse = await fetch(audioUrl, {
        headers: {
          "X-AUTH-TOKEN": token,
        },
      });
    } catch (fetchError) {
      const errorMessage =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`Audio fetch network error: ${errorMessage}`);
      throw new Error(
        `Failed to fetch audio from Daktela (network error): ${errorMessage}`
      );
    }

    if (!audioResponse.ok) {
      const errorBody = await audioResponse
        .text()
        .catch(() => "Unable to read error body");
      console.error(
        `Audio fetch HTTP error: ${audioResponse.status} ${audioResponse.statusText} - ${errorBody}`
      );
      throw new Error(
        `Failed to fetch audio from Daktela: ${audioResponse.status} ${audioResponse.statusText}`
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    const call = await convex.query(api.calls.getByCallId, { callId });
    const agentName = call?.agentName ?? undefined;

    const transcription = await transcribeWithDeepgram(audioBuffer, "pl", agentName);

    const transcriptionData = {
      text: transcription.text,
      language_code: transcription.language_code,
      words: transcription.words.map((w) => ({
        text: w.word,
        start: w.start,
        end: w.end,
        type: "word",
        speaker_id: String(w.speaker),
      })),
      utterances: transcription.utterances,
    };

    await convex.mutation(api.transcriptions.upsertTranscription, {
      callId,
      text: transcriptionData.text,
      languageCode: transcriptionData.language_code,
      words: transcriptionData.words,
      utterances: transcriptionData.utterances,
    });

    return NextResponse.json({
      activityName,
      transcription: transcriptionData,
      fromCache: false,
    });
  } catch (error) {
    console.error("Transcription error:", error);

    if (error instanceof Error) {
      const errorMessage = error.message || "";

      if (
        errorMessage.includes("413") ||
        errorMessage.includes("Too Large") ||
        errorMessage.includes("PAYLOAD_TOO_LARGE")
      ) {
        return NextResponse.json(
          {
            error:
              "Audio file too large for transcription. This call recording is too long.",
            code: "FILE_TOO_LARGE",
          },
          { status: 413 }
        );
      }

      if (
        errorMessage.includes("429") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("RATE_LIMIT")
      ) {
        return NextResponse.json(
          {
            error:
              "Transcription rate limit exceeded. Please wait a moment and try again.",
            code: "RATE_LIMIT",
          },
          { status: 429 }
        );
      }

      if (errorMessage.includes("Failed to fetch audio")) {
        return NextResponse.json(
          {
            error:
              "Could not download audio recording from Daktela. The recording may not exist.",
            code: "AUDIO_NOT_FOUND",
          },
          { status: 404 }
        );
      }

      if (errorMessage.includes("DEEPGRAM_API_KEY")) {
        return NextResponse.json(
          {
            error: "Deepgram API key not configured",
            code: "INVALID_API_KEY",
          },
          { status: 401 }
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
