const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 200;
function defaultSleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
export class SlidingWindowRateLimiter {
    maxRequests;
    sleep;
    states = new Map();
    windowMs;
    constructor(options = {}) {
        this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
        this.sleep = options.sleep ?? defaultSleep;
        this.windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
    }
    get size() {
        return this.states.size;
    }
    async acquire(token) {
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
        this.evictStaleEntries();
    }
    getState(token) {
        const key = token || "__default__";
        const existingState = this.states.get(key);
        if (existingState) {
            return existingState;
        }
        const state = {
            queue: Promise.resolve(),
            timestamps: [],
        };
        this.states.set(key, state);
        return state;
    }
    evictStaleEntries() {
        for (const [key, state] of this.states) {
            this.pruneExpiredTimestamps(state.timestamps);
            if (state.timestamps.length === 0) {
                this.states.delete(key);
            }
        }
    }
    pruneExpiredTimestamps(timestamps) {
        const cutoff = Date.now() - this.windowMs;
        while (timestamps.length > 0 && timestamps[0] <= cutoff) {
            timestamps.shift();
        }
    }
}
export function createYnabRateLimiter() {
    return new SlidingWindowRateLimiter();
}
