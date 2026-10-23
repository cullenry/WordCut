import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssemblyAIProvider, normalizeAssemblyAIResponse } from "@/server/transcription/assemblyai";
import { normalizeDeepgramResponse } from "@/server/transcription/deepgram";
import { createOpenAIProvider, normalizeOpenAIResponse, punctuateWords } from "@/server/transcription/openai";
import { ProviderError } from "@/server/transcription";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeAssemblyAIResponse", () => {
  it("converts milliseconds to seconds and numbers speakers in order of appearance", () => {
    const r = normalizeAssemblyAIResponse({
      id: "t1",
      status: "completed",
      audio_duration: 4,
      language_code: "en_us",
      words: [
        { text: "Um,", start: 120, end: 380, confidence: 0.71, speaker: "B" },
        { text: "hi.", start: 400, end: 650, confidence: 0.98, speaker: "B" },
        { text: "Hey.", start: 1200, end: 1500, confidence: 0.95, speaker: "A" },
      ],
    });
    expect(r).toEqual({
      words: [
        { text: "Um,", start: 0.12, end: 0.38, confidence: 0.71, speaker: 0 },
        { text: "hi.", start: 0.4, end: 0.65, confidence: 0.98, speaker: 0 },
        { text: "Hey.", start: 1.2, end: 1.5, confidence: 0.95, speaker: 1 },
      ],
      duration: 4,
      language: "en",
    });
  });

  it("omits the speaker when labels are off", () => {
    const r = normalizeAssemblyAIResponse({
      id: "t1",
      status: "completed",
      words: [{ text: "Hello", start: 0, end: 500, confidence: 0.9, speaker: null }],
    });
    expect(r.words[0]).not.toHaveProperty("speaker");
    // No duration reported: fall back to the last word's end.
    expect(r.duration).toBe(0.5);
    expect(r.language).toBeUndefined();
  });

  it("handles a transcript with no speech", () => {
    expect(normalizeAssemblyAIResponse({ id: "t1", status: "completed", words: null, audio_duration: 7 })).toEqual({
      words: [],
      duration: 7,
      language: undefined,
    });
  });
});

describe("punctuateWords", () => {
  it("takes the punctuated form of each word from the full text", () => {
    expect(punctuateWords("Um, so... hello world!", ["Um", "so", "hello", "world"])).toEqual([
      "Um,",
      "so...",
      "hello",
      "world!",
    ]);
  });

  it("keeps the bare word when the text doesn't match, then resyncs", () => {
    // "5" is written "five" in the text; the words after it still line up.
    expect(punctuateWords("I have five apples, really.", ["I", "have", "5", "apples", "really"])).toEqual([
      "I",
      "have",
      "5",
      "apples,",
      "really.",
    ]);
  });

  it("matches repeated words one at a time", () => {
    expect(punctuateWords("the, the the.", ["the", "the", "the"])).toEqual(["the,", "the", "the."]);
  });

  it("ignores case and unicode punctuation when matching", () => {
    expect(punctuateWords("«Ça va?» Oui.", ["ça", "va", "oui"])).toEqual(["«Ça", "va?»", "Oui."]);
  });
});

describe("normalizeOpenAIResponse", () => {
  it("restores punctuation and fills in confidence", () => {
    const r = normalizeOpenAIResponse(
      {
        language: "english",
        duration: 2.5,
        text: "Hello, world.",
        words: [
          { word: "Hello", start: 0, end: 0.4 },
          { word: "world", start: 0.5, end: 0.9 },
        ],
      },
      "en",
    );
    expect(r).toEqual({
      words: [
        { text: "Hello,", start: 0, end: 0.4, confidence: 1 },
        { text: "world.", start: 0.5, end: 0.9, confidence: 1 },
      ],
      duration: 2.5,
      language: "en",
    });
  });

  it("drops empty words and falls back to the last word end", () => {
    const r = normalizeOpenAIResponse({ text: "Yes", words: [{ word: " ", start: 0, end: 0.1 }, { word: "Yes", start: 0.2, end: 0.6 }] });
    expect(r.words.map((w) => w.text)).toEqual(["Yes"]);
    expect(r.duration).toBe(0.6);
  });

  it("handles a response with no words", () => {
    expect(normalizeOpenAIResponse({ text: "", duration: 3 })).toEqual({ words: [], duration: 3, language: undefined });
  });
});

describe("every provider normalises to the same words", () => {
  // The same 1.2 s utterance, "Um, hello there.", as each provider returns it.
  const deepgram = normalizeDeepgramResponse({
    metadata: { duration: 1.2 },
    results: {
      channels: [
        {
          alternatives: [
            {
              words: [
                { word: "um", punctuated_word: "Um,", start: 0, end: 0.25, confidence: 1 },
                { word: "hello", punctuated_word: "hello", start: 0.3, end: 0.6, confidence: 1 },
                { word: "there", punctuated_word: "there.", start: 0.65, end: 1, confidence: 1 },
              ],
            },
          ],
        },
      ],
    },
  });
  const assemblyai = normalizeAssemblyAIResponse({
    id: "t1",
    status: "completed",
    audio_duration: 1.2,
    words: [
      { text: "Um,", start: 0, end: 250, confidence: 1, speaker: null },
      { text: "hello", start: 300, end: 600, confidence: 1, speaker: null },
      { text: "there.", start: 650, end: 1000, confidence: 1, speaker: null },
    ],
  });
  const openai = normalizeOpenAIResponse({
    duration: 1.2,
    text: "Um, hello there.",
    words: [
      { word: "Um", start: 0, end: 0.25 },
      { word: "hello", start: 0.3, end: 0.6 },
      { word: "there", start: 0.65, end: 1 },
    ],
  });

  it("produces identical words and durations", () => {
    expect(assemblyai.words).toEqual(deepgram.words);
    expect(openai.words).toEqual(deepgram.words);
    expect(new Set([deepgram.duration, assemblyai.duration, openai.duration])).toEqual(new Set([1.2]));
  });
});

describe("AssemblyAI provider", () => {
  const req = { audio: new ArrayBuffer(8), mimeType: "audio/ogg", language: "en" };

  it("uploads, submits with fillers kept, polls until done, then deletes the job", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ upload_url: "https://cdn.example/u1" }))
      .mockResolvedValueOnce(json({ id: "t1", status: "queued" }))
      .mockResolvedValueOnce(json({ id: "t1", status: "processing" }))
      .mockResolvedValueOnce(
        json({ id: "t1", status: "completed", audio_duration: 1, words: [{ text: "Hi.", start: 0, end: 400, confidence: 0.9, speaker: "A" }] }),
      )
      .mockResolvedValueOnce(json({ id: "t1", status: "completed" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createAssemblyAIProvider("key", { pollMs: 0 }).transcribe(req);
    expect(result.words).toEqual([{ text: "Hi.", start: 0, end: 0.4, confidence: 0.9, speaker: 0 }]);

    const calls = fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`);
    expect(calls).toEqual([
      "POST https://api.assemblyai.com/v2/upload",
      "POST https://api.assemblyai.com/v2/transcript",
      "GET https://api.assemblyai.com/v2/transcript/t1",
      "GET https://api.assemblyai.com/v2/transcript/t1",
      "DELETE https://api.assemblyai.com/v2/transcript/t1",
    ]);
    const submit = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(submit).toMatchObject({ audio_url: "https://cdn.example/u1", language_code: "en", disfluencies: true });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("key");
  });

  it("reports a failed job as a provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ upload_url: "u" }))
        .mockResolvedValueOnce(json({ id: "t1", status: "error", error: "Audio file is empty" }))
        .mockImplementation(async () => json({})),
    );
    await expect(createAssemblyAIProvider("key", { pollMs: 0 }).transcribe(req)).rejects.toThrow(/Audio file is empty/);
  });

  it("names the env var when the key is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({ error: "bad key" }, 401)));
    const err = await createAssemblyAIProvider("bad").transcribe(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toMatch(/ASSEMBLYAI_API_KEY/);
    expect((err as ProviderError).status).toBe(401);
  });

  it("gives up after the timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ upload_url: "u" }))
        .mockImplementation(async () => json({ id: "t1", status: "processing" })),
    );
    await expect(createAssemblyAIProvider("key", { pollMs: 1, timeoutMs: 5 }).transcribe(req)).rejects.toThrow(
      /too long/,
    );
  });
});

describe("OpenAI provider", () => {
  it("asks whisper-1 for word timestamps with a file name that matches the audio", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json({ duration: 1, text: "Hi there.", words: [{ word: "Hi", start: 0, end: 0.3 }, { word: "there", start: 0.4, end: 0.8 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await createOpenAIProvider("sk-test").transcribe({
      audio: new ArrayBuffer(8),
      mimeType: "audio/ogg; codecs=opus",
      language: "en",
    });
    expect(r.words.map((w) => w.text)).toEqual(["Hi", "there."]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["word"]);
    expect((form.get("file") as File).name).toBe("audio.ogg");
    expect(form.get("prompt")).toBeTruthy();
  });

  it("only sends the English filler prompt for English audio", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ text: "", words: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await createOpenAIProvider("sk").transcribe({ audio: new ArrayBuffer(8), mimeType: "audio/wav", language: "es" });
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.get("prompt")).toBeNull();
    expect((form.get("file") as File).name).toBe("audio.wav");
  });

  it("names the env var when the key is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({}, 401)));
    await expect(
      createOpenAIProvider("bad").transcribe({ audio: new ArrayBuffer(8), mimeType: "audio/ogg", language: "en" }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
