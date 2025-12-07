import Groq, { toFile } from "groq-sdk";
import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface WhisperVocabulary {
  companyName?: string;
}

function buildWhisperPrompt(agentName?: string): string | undefined {
  const vocabPath = join(process.cwd(), "config/whisper-vocabulary.json");
  if (!existsSync(vocabPath)) return undefined;

  try {
    const vocab: WhisperVocabulary = JSON.parse(
      readFileSync(vocabPath, "utf-8")
    );

    const company = vocab.companyName ?? "firmy windykacyjnej";
    const agent = agentName ? `Agent ${agentName} rozmawia` : "Agent rozmawia";

    return `Rozmowa telefoniczna konsultanta windykacyjnego z firmy ${company}. ${agent} z klientem w sprawie informacji o dłużniku i jego sytuacji finansowej.`;
  } catch {
    return undefined;
  }
}

export interface TranscriptionResult {
  text: string;
  language_code: string;
}

export function getFfmpegPath(): string {
  const paths = [
    "/opt/homebrew/bin/ffmpeg", // macOS ARM (local dev)
    "/usr/local/bin/ffmpeg", // macOS Intel
    "/usr/bin/ffmpeg", // Linux/Railway
  ];

  for (const p of paths) {
    try {
      execSync(`${p} -version`, { stdio: "ignore" });
      return p;
    } catch {}
  }

  try {
    return execSync("which ffmpeg").toString().trim();
  } catch {
    throw new Error("ffmpeg not found in system");
  }
}

ffmpeg.setFfmpegPath(getFfmpegPath());

export async function upsampleAudio(audioBuffer: Buffer): Promise<Buffer> {
  const timestamp = Date.now();
  const inputPath = join(tmpdir(), `input-${timestamp}.mp3`);
  const outputPath = join(tmpdir(), `output-${timestamp}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFrequency(16000)
        .audioChannels(1)
        .format("wav")
        .on("end", () => resolve())
        .on("error", reject)
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  filename: string,
  language: string = "pl",
  agentName?: string
): Promise<TranscriptionResult> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const groq = new Groq({ apiKey: groqApiKey });

  const upsampledBuffer = await upsampleAudio(audioBuffer);

  const transcription = await groq.audio.transcriptions.create({
    file: await toFile(upsampledBuffer, filename),
    model: "whisper-large-v3-turbo",
    language,
    prompt: buildWhisperPrompt(agentName),
  });

  return {
    text: transcription.text,
    language_code: language,
  };
}
