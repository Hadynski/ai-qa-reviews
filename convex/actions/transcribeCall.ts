"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

interface Utterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
}

interface TranscriptionResult {
  text: string;
  language_code: string;
  utterances: Utterance[];
}

interface ElevenLabsWord {
  text: string;
  start?: number;
  end?: number;
  speakerId?: string;
}

function generateUtterancesFromElevenLabsWords(
  words: ElevenLabsWord[]
): Utterance[] {
  if (!words?.length) return [];

  const speakerToNumber = (speakerId?: string): number => {
    if (!speakerId) return 0;
    const num = parseInt(speakerId, 10);
    return isNaN(num) ? 0 : num;
  };

  const utterances: Utterance[] = [];
  let current = {
    speaker: speakerToNumber(words[0].speakerId),
    transcript: words[0].text,
    start: words[0].start ?? 0,
    end: words[0].end ?? 0,
  };

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const speaker = speakerToNumber(word.speakerId);
    if (speaker === current.speaker) {
      current.transcript += " " + word.text;
      current.end = word.end ?? current.end;
    } else {
      utterances.push(current);
      current = {
        speaker,
        transcript: word.text,
        start: word.start ?? 0,
        end: word.end ?? 0,
      };
    }
  }
  utterances.push(current);

  return utterances;
}

async function transcribeWithElevenLabs(
  audioBuffer: Buffer,
  language: string = "pl",
  keyterms?: string[]
): Promise<TranscriptionResult> {

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const client = new ElevenLabsClient({ apiKey });

  console.log(
    `[ElevenLabs] Starting transcription, buffer size: ${audioBuffer.length} bytes`
  );
  const startTime = Date.now();

  const audioBlob = new Blob([new Uint8Array(audioBuffer)]);

  const result = await client.speechToText.convert({
    file: audioBlob,
    modelId: "scribe_v2",
    languageCode: language,
    diarize: true,
    timestampsGranularity: "word",
    ...(keyterms?.length ? { keyterms } : {}),
  });

  console.log(`[ElevenLabs] Completed in ${Date.now() - startTime}ms`);

  const responseData = result as unknown as {
    text: string;
    languageCode?: string;
    words?: ElevenLabsWord[];
  };

  const words: ElevenLabsWord[] = responseData.words ?? [];
  const utterances = generateUtterancesFromElevenLabsWords(words);

  return {
    text: responseData.text,
    language_code: responseData.languageCode ?? language,
    utterances,
  };
}

async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  language: string = "pl",
  agentName?: string
): Promise<TranscriptionResult> {
  const { createClient } = await import("@deepgram/sdk");

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");

  const deepgram = createClient(apiKey);
  const keyterms: string[] = [];
  if (agentName) keyterms.push(agentName);

  console.log(
    `[Deepgram] Starting transcription, buffer size: ${audioBuffer.length} bytes`
  );
  const startTime = Date.now();

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: "nova-3",
      language,
      diarize: true,
      punctuate: true,
      utterances: true,
      smart_format: true,
      keyterm: keyterms.length > 0 ? keyterms : undefined,
    }
  );

  console.log(`[Deepgram] Completed in ${Date.now() - startTime}ms`);

  if (error) {
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  const channel = result.results.channels[0];
  const alternative = channel.alternatives[0];

  return {
    text: alternative.transcript,
    language_code: language,
    utterances:
      result.results.utterances?.map((u) => ({
        speaker: u.speaker ?? 0,
        transcript: u.transcript,
        start: u.start,
        end: u.end,
      })) ?? [],
  };
}

async function getDaktelaToken(): Promise<string> {
  const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");
  const daktelaLogin = process.env.DAKTELA_LOGIN;
  const daktelaPassword = process.env.DAKTELA_PASSWORD;

  if (!daktelaUrl || !daktelaLogin || !daktelaPassword) {
    throw new Error("Missing Daktela credentials");
  }

  const response = await fetch(`${daktelaUrl}/api/v6/login.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: daktelaLogin,
      password: daktelaPassword,
      only_token: 1,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.result) {
    throw new Error(`Daktela login failed: ${JSON.stringify(data.error)}`);
  }

  return data.result;
}

export const transcribeCall = internalAction({
  args: {
    callId: v.string(),
    activityName: v.string(),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingTranscription = await ctx.runQuery(
      internal.transcriptions.getByCallIdInternal,
      { callId: args.callId }
    );

    if (existingTranscription) {
      console.log(
        `[TranscribeCall] Transcription already exists for ${args.callId}`
      );
      return { fromCache: true };
    }

    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");
    if (!daktelaUrl) throw new Error("DAKTELA_URL not configured");

    const token = await getDaktelaToken();
    const audioUrl = `${daktelaUrl}/file/recording/${args.activityName}?accessToken=${token}`;

    console.log(`[TranscribeCall] Fetching audio for ${args.activityName}`);

    const audioResponse = await fetch(audioUrl, {
      headers: { "X-AUTH-TOKEN": token },
    });

    if (!audioResponse.ok) {
      throw new Error(
        `Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    let transcription: TranscriptionResult;

    if (process.env.ELEVENLABS_API_KEY) {
      console.log("[TranscribeCall] Using ElevenLabs");
      const keyterms = await ctx.runQuery(
        internal.settings.getElevenLabsKeytermsInternal
      );
      transcription = await transcribeWithElevenLabs(
        audioBuffer,
        "pl",
        keyterms.length > 0 ? keyterms : undefined
      );
    } else if (process.env.DEEPGRAM_API_KEY) {
      console.log("[TranscribeCall] Using Deepgram");
      transcription = await transcribeWithDeepgram(
        audioBuffer,
        "pl",
        args.agentName
      );
    } else {
      throw new Error("No transcription API configured");
    }

    await ctx.runMutation(internal.transcriptions.upsertTranscriptionInternal, {
      callId: args.callId,
      text: transcription.text,
      languageCode: transcription.language_code,
      utterances: transcription.utterances,
    });

    console.log(
      `[TranscribeCall] Saved transcription: ${transcription.utterances.length} utterances`
    );

    return { fromCache: false };
  },
});
