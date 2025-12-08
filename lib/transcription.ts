import { createClient } from "@deepgram/sdk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface DeepgramKeytermsConfig {
  companyName?: string;
  additionalTerms?: string[];
}

function buildKeyterms(agentName?: string): string[] {
  const configPath = join(process.cwd(), "config/deepgram-keywords.json");
  const keyterms: string[] = [];

  if (existsSync(configPath)) {
    try {
      const config: DeepgramKeytermsConfig = JSON.parse(
        readFileSync(configPath, "utf-8")
      );

      if (config.companyName) {
        keyterms.push(config.companyName);
      }

      if (config.additionalTerms) {
        keyterms.push(...config.additionalTerms);
      }
    } catch {
      // Config read failed, continue without keyterms
    }
  }

  if (agentName) {
    keyterms.push(agentName);
  }

  return keyterms;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  speaker_confidence?: number;
}

export interface Utterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  language_code: string;
  words: TranscriptionWord[];
  utterances: Utterance[];
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

export function formatUtterancesAsDialog(utterances: Utterance[]): string {
  if (!utterances.length) return "";

  return mergeConsecutiveUtterances(utterances)
    .map((u) => `[Speaker ${u.speaker}]: ${u.transcript}`)
    .join("\n\n");
}

export async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  language: string = "pl",
  agentName?: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  const deepgram = createClient(apiKey);
  const keyterms = buildKeyterms(agentName);

  console.log(`[Deepgram] Starting transcription, buffer size: ${audioBuffer.length} bytes, language: ${language}`);
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

  const duration = Date.now() - startTime;

  if (error) {
    console.error(`[Deepgram] Failed after ${duration}ms. Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  console.log(`[Deepgram] Completed successfully in ${duration}ms`);

  const channel = result.results.channels[0];
  const alternative = channel.alternatives[0];

  return {
    text: alternative.transcript,
    language_code: language,
    words: alternative.words.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      speaker: w.speaker ?? 0,
      speaker_confidence: w.speaker_confidence,
    })),
    utterances: result.results.utterances?.map((u) => ({
      speaker: u.speaker ?? 0,
      transcript: u.transcript,
      start: u.start,
      end: u.end,
    })) ?? [],
  };
}
