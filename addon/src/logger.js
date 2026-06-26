/**
 * Tiny leveled logger. Discovery/generation is noisy, so everything below
 * "info" is gated behind the `debug` option (or the AUTO_DETECT_DEBUG env var).
 */

const PREFIX = '[auto-detect]';

let debugEnabled = false;

export function setDebug(value) {
  debugEnabled = Boolean(value) || process.env.AUTO_DETECT_DEBUG === 'true';
}

export const logger = {
  debug(...args) {
    if (debugEnabled) console.log(PREFIX, ...args);
  },
  info(...args) {
    console.log(PREFIX, ...args);
  },
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
