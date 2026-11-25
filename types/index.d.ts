/**
 * The last main-thread turn, as the band reads it.
 * `cacheHit`: share of the turn's input tokens served by the prompt cache, 0 to 100.
 * `at`: when the turn ended, in `$.clock.now()` milliseconds.
 */
export type LastTurn = { cacheHit: number | null; at: number }

declare module 'claude-code' {
  interface PluginState {
    'token-optimizer': { lastTurn: LastTurn | null; now: number }
  }
}
