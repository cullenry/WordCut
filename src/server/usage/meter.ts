/**
 * Billing hook. Every transcription goes through a UsageMeter, so the paid
 * hosted tier can swap in a credits-backed meter without touching the route.
 */
export interface UsageContext {
  /** Signed-in user, once accounts exist. */
  userId: string | null;
}

export interface UsageMeter {
  /** Throws UsageLimitError if the caller may not spend this many audio seconds. */
  authorize(ctx: UsageContext, estimatedSeconds: number): Promise<void>;
  /** Records actual usage, as measured by the provider, after a successful transcription. */
  record(ctx: UsageContext, seconds: number, details: { provider: string }): Promise<void>;
}

export class UsageLimitError extends Error {}

/** Self-hosted default: unlimited and free. */
export const noopMeter: UsageMeter = {
  async authorize() {},
  async record() {},
};

export function getUsageMeter(): UsageMeter {
  return noopMeter;
}
