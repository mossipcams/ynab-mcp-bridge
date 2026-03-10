const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 200;

type RateLimiterOptions = {
  maxRequests?: number;
  sleep?: (ms: number) => Promise<void>;
  windowMs?: number;
};

type TokenState = {
  queue: Promise<void>;
  timestamps: number[];
};

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly states = new Map<string, TokenState>();
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
    this.sleep = options.sleep ?? defaultSleep;
    this.windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  }

  async acquire(token: string) {
    const state = this.getState(token);
    const task = state.queue.then(async () => {
      while (true) {
        this.pruneExpiredTimestamps(state.timestamps);

        if (state.timestamps.length < this.maxRequests) {
          state.timestamps.push(Date.now());
          return;
        }

        const oldestTimestamp = state.timestamps[0];
        const waitMs = Math.max(oldestTimestamp + this.windowMs - Date.now(), 1);
        await this.sleep(waitMs);
      }
    });

    state.queue = task.catch(() => undefined);
    await task;
  }

  private getState(token: string) {
    const key = token || "__default__";
    const existingState = this.states.get(key);

    if (existingState) {
      return existingState;
    }

    const state: TokenState = {
      queue: Promise.resolve(),
      timestamps: [],
    };

    this.states.set(key, state);
    return state;
  }

  private pruneExpiredTimestamps(timestamps: number[]) {
    const cutoff = Date.now() - this.windowMs;

    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }
  }
}

export function createYnabRateLimiter() {
  return new SlidingWindowRateLimiter();
}
