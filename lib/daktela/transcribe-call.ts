import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { getDaktelaToken } from "@/lib/daktela-token";
import { transcribeWithDeepgram } from "@/lib/transcription";

export interface TranscribeCallResult {
  text: string;
  languageCode: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    type: string;
    speaker_id?: string;
  }>;
  utterances: Array<{
    speaker: number;
    transcript: string;
    start: number;
    end: number;
  }>;
  fromCache: boolean;
}

export async function transcribeCall(
  activityName: string,
  callId: string,
  force: boolean = false
): Promise<TranscribeCallResult> {
  const convex = getConvexClient();

  if (force) {
    await convex.mutation(api.transcriptions.deleteTranscription, { callId });
  } else {
    const existingTranscription = await convex.query(
      api.transcriptions.getByCallId,
      { callId }
    );

    if (existingTranscription) {
      return {
        text: existingTranscription.text,
        languageCode: existingTranscription.languageCode,
        words: existingTranscription.words || [],
        utterances: existingTranscription.utterances || [],
        fromCache: true,
      };
    }
  }

  const token = await getDaktelaToken();
  const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");

  if (!daktelaUrl) {
    throw new Error("DAKTELA_URL not configured");
  }

  const audioUrl = `${daktelaUrl}/file/recording/${activityName}?accessToken=${token}`;

  console.log(`Fetching audio from: ${daktelaUrl}/file/recording/${activityName}`);

  let audioResponse: Response;
  try {
    audioResponse = await fetch(audioUrl, {
      headers: {
        "X-AUTH-TOKEN": token,
      },
    });
  } catch (fetchError) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error(`Audio fetch network error: ${errorMessage}`);
    throw new Error(`Failed to fetch audio from Daktela (network error): ${errorMessage}`);
  }

  if (!audioResponse.ok) {
    const errorBody = await audioResponse.text().catch(() => "Unable to read error body");
    console.error(`Audio fetch HTTP error: ${audioResponse.status} ${audioResponse.statusText} - ${errorBody}`);
    throw new Error(`Failed to fetch audio from Daktela: ${audioResponse.status} ${audioResponse.statusText}`);
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

  const call = await convex.query(api.calls.getByCallId, { callId });
  const agentName = call?.agentName ?? undefined;

  const transcription = await transcribeWithDeepgram(audioBuffer, "pl", agentName);

  const transcriptionData = {
    text: transcription.text,
    languageCode: transcription.language_code,
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
    languageCode: transcriptionData.languageCode,
    words: transcriptionData.words,
    utterances: transcriptionData.utterances,
  });

  return {
    ...transcriptionData,
    fromCache: false,
  };
}
