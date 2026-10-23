/**
 * Conservative (high) estimate of audio length from upload size, used to
 * pre-authorize usage before the provider reports the exact duration.
 * Lower bytes-per-second assumptions give longer, safer estimates.
 */
const MIN_BYTES_PER_SECOND: Record<string, number> = {
  "audio/wav": 32_000, // 16 kHz mono s16
  "audio/ogg": 2_000, // Opus, ~16 kbps floor
  "audio/webm": 2_000,
};

export function estimateAudioSeconds(bytes: number, mimeType: string): number {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const bps = MIN_BYTES_PER_SECOND[base] ?? 2_000;
  return Math.ceil(bytes / bps);
}

export function isAcceptedAudioType(mimeType: string): boolean {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return base in MIN_BYTES_PER_SECOND;
}
