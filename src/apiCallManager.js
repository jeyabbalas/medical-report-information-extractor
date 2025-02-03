class AdaptiveRateLimiter {
    constructor(options = {}) {
        // Basic rate-limiting configuration
        this.maxRequestsPerMinute = options.maxRequestsPerMinute || 3;

        // Exponential backoff parameters
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.minBackoffTime = options.minBackoffTime || 1000; // 1 second
        this.maxBackoffTime = options.maxBackoffTime || 60000; // 1 minute

        // Sliding window tracking of API usage
        this.requestWindow = [];
        this.windowDuration = 60000; // 1 minute

        // Dynamic rate/backoff tracking
        this.currentBackoff = this.minBackoffTime;
        this.consecutiveErrors = 0;
        this.lastErrorTime = null;
    }

    async enforceRateLimit() {
        const now = Date.now();
        // Clean up timestamps outside the 60-sec window
        this.requestWindow = this.requestWindow.filter(entry => entry > now - this.windowDuration);

        // Rate limit violation
        if (this.requestWindow.length >= this.maxRequestsPerMinute) {
            // Wait until the oldest request in the window is out of windowDuration
            const oldestRequest = this.requestWindow[0];
            const waitTime = oldestRequest + this.windowDuration - now;
            if (waitTime > 0) {
                await this.sleep(waitTime);
            }
        }

        // Record the new request
        this.requestWindow.push(Date.now());
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    handleError(error) {
        const now = Date.now();
        this.consecutiveErrors++;
        this.lastErrorTime = now;

        // Exponential backoff with jitter
        this.currentBackoff = Math.min(
            this.maxBackoffTime,
            this.currentBackoff * this.backoffMultiplier * (1 + Math.random() * 0.1)
        );

        // If it's a rate limit error, enforce a minimum wait
        if (error.response?.status === 429) {
            this.currentBackoff = Math.max(this.currentBackoff, 5000);
        }

        return this.currentBackoff;
    }

    resetErrorCount() {
        // If time since last error is > window duration, reset
        if (this.consecutiveErrors > 0 && Date.now() - this.lastErrorTime > this.windowDuration) {
            this.consecutiveErrors = 0;
            this.currentBackoff = this.minBackoffTime;
        }
    }
}


class DynamicConcurrentScheduler {
    constructor(options = {}) {
        this.apiCallFn = options.apiCallFn;
        this.rateLimiter = new AdaptiveRateLimiter(options.rateLimiterOpts || {});
        this.concurrency = options.initialConcurrency || 1;
        this.maxConcurrency = options.maxConcurrency || 10;

        // User clicks the "Stop" button
        this.terminated = false;

        this.successfulCallsSinceLastError = 0;
        this.maxSuccessfulCallsBeforeIncrease = 5; // Number of successful calls needed before increasing concurrency
    }

    terminate() {
        this.terminated = true;
    }

    async run(tasks, onTaskDone, onBatchComplete) {
        let index = 0;
        while (index < tasks.length && !this.terminated) {
            const batch = tasks.slice(index, index + this.concurrency);
            await this.runBatch(batch, onTaskDone);

            if (this.terminated) break;

            index += batch.length;
            if (typeof onBatchComplete === 'function') {
                onBatchComplete();
            }
        }
    }

    async runBatch(batch, onTaskDone) {
        const promises = batch.map(task => this.runTask(task, onTaskDone));
        await Promise.all(promises);
    }

    async runTask(task, onTaskDone) {
        if (this.terminated) return;

        let result;
        let error = null;

        try {
            // Basic rate-limiting
            await this.rateLimiter.enforceRateLimit();

            // Make the actual call
            result = await this.apiCallFn(task);

            // No error => increment success count
            this.successfulCallsSinceLastError++;
            // Check if we can double the concurrency
            if (
                this.successfulCallsSinceLastError >= this.maxSuccessfulCallsBeforeIncrease &&
                this.concurrency < this.maxConcurrency
            ) {
                this.concurrency = Math.min(this.concurrency * 2, this.maxConcurrency);
                this.successfulCallsSinceLastError = 0;
            }

            this.rateLimiter.resetErrorCount();

        } catch (e) {
            error = e;
            // Error => backoff
            const backoffTime = this.rateLimiter.handleError(e);

            // Halve concurrency if above 1
            if (this.concurrency > 1) {
                this.concurrency = Math.floor(this.concurrency / 2) || 1;
            }
            this.successfulCallsSinceLastError = 0;

            await this.rateLimiter.sleep(backoffTime);
        }

        if (typeof onTaskDone === 'function') {
            onTaskDone(task, result, error);
        }
    }
}


export {AdaptiveRateLimiter, DynamicConcurrentScheduler};