/** A word as returned by a transcription provider, timed relative to the audio it was given. */
export interface RawWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

/** A word in the project transcript, timed in source-video seconds. Never mutated after creation. */
export interface Word extends RawWord {
  id: string;
}

export interface Transcript {
  words: Word[];
  duration: number;
  language?: string;
  provider: string;
  createdAt: number;
}
