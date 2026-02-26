import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createClient } from "@deepgram/sdk";

export interface Utterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  language_code: string;
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
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

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

  const duration = Date.now() - startTime;
  console.log(`[ElevenLabs] Completed in ${duration}ms`);

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

interface DeepgramKeytermsConfig {
  companyName?: string;
  additionalTerms?: string[];
}

function buildKeyterms(
  agentName?: string,
  keytermsConfig?: DeepgramKeytermsConfig
): string[] {
  const keyterms: string[] = [];

  if (keytermsConfig?.companyName) {
    keyterms.push(keytermsConfig.companyName);
  }
  if (keytermsConfig?.additionalTerms) {
    keyterms.push(...keytermsConfig.additionalTerms);
  }
  if (agentName) {
    keyterms.push(agentName);
  }

  return keyterms;
}

async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  language: string = "pl",
  agentName?: string,
  keytermsConfig?: DeepgramKeytermsConfig
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  const deepgram = createClient(apiKey);
  const keyterms = buildKeyterms(agentName, keytermsConfig);

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

  const duration = Date.now() - startTime;

  if (error) {
    console.error(`[Deepgram] Failed after ${duration}ms:`, error.message);
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  console.log(`[Deepgram] Completed in ${duration}ms`);

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

export async function transcribe(
  audioBuffer: Buffer,
  language: string = "pl",
  agentName?: string,
  keytermsConfig?: DeepgramKeytermsConfig,
  elevenLabsKeyterms?: string[]
): Promise<TranscriptionResult> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;

  if (elevenLabsKey) {
    console.log("[Transcription] Using ElevenLabs Scribe v2");
    return transcribeWithElevenLabs(audioBuffer, language, elevenLabsKeyterms);
  }

  if (deepgramKey) {
    console.log("[Transcription] Falling back to Deepgram");
    return transcribeWithDeepgram(audioBuffer, language, agentName, keytermsConfig);
  }

  throw new Error(
    "No transcription API configured. Set ELEVENLABS_API_KEY or DEEPGRAM_API_KEY"
  );
}
