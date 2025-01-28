class AdaptiveRateLimiter {
    constructor(options = {}) {
        // API and token use limits
        // Defaults are from OpenAI's free-tier (https://platform.openai.com/docs/guides/rate-limits?context=tier-free) at the time of coding.
        this.maxRequestsPerMinute = options.maxRequestsPerMinute || 3; // x-ratelimit-limit-requests
        this.maxTokensPerMinute = options.maxTokensPerMinute || 40000; // x-ratelimit-limit-tokens

        // Exponential backoff parameters
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.minBackoffTime = options.minBackoffTime || 1000; // 1 second
        this.maxBackoffTime = options.maxBackoffTime || 60000; // 1 minute

        // Sliding window tracking of API and token usage
        this.requestWindow = [];
        this.tokenWindow = [];
        this.windowDuration = 60000; // 1 minute

        // Dynamic rate adjustment
        this.currentBackoff = this.minBackoffTime;
        this.consecutiveErrors = 0;
        this.lastErrorTime = null;

        // Header-based limits
        this.headerLimits = {
            requests: null, // x-ratelimit-remaining-requests
            tokens: null, // x-ratelimit-remaining-tokens
            resetTime: null // x-ratelimit-reset-requests, x-ratelimit-reset-tokens
        }
    }

    async enforceRateLimit() {
        const now = Date.now();

        // Clean up tracked timestamps outside the window duration
        this.requestWindow = this.requestWindow.filter(entry => entry > now - this.windowDuration);
        this.tokenWindow = this.tokenWindow.filter(entry => entry > now - this.windowDuration);

        // Rate limit violation
        if (this.requestWindow.length >= this.maxRequestsPerMinute) {
            // Wait until the oldest request in the window falls outside the window duration
            const oldestRequest = this.requestWindow[0];
            const waitTime = oldestRequest + this.windowDuration - now;
            if (waitTime > 0) {
                await this.sleep(waitTime);
            }
        }

        // Log current request timestamp
        this.requestWindow.push(now);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}