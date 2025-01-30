class AdaptiveRateLimiter {
    constructor(options = {}) {
        // API use limits
        this.maxRequestsPerMinute = options.maxRequestsPerMinute || 3;

        // Exponential backoff parameters
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.minBackoffTime = options.minBackoffTime || 1000; // 1 second
        this.maxBackoffTime = options.maxBackoffTime || 60000; // 1 minute

        // Sliding window tracking of API usage
        this.requestWindow = [];
        this.windowDuration = 60000; // 1 minute

        // Dynamic rate adjustment
        this.currentBackoff = this.minBackoffTime;
        this.consecutiveErrors = 0;
        this.lastErrorTime = null;
    }

    async enforceRateLimit() {
        const now = Date.now();

        // Clean up timestamps outside the window duration
        this.requestWindow = this.requestWindow.filter(entry => entry > now - this.windowDuration);

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

    updateLimitsFromHeaders(headers) {
        // OpenAI headers: https://platform.openai.com/docs/guides/rate-limits?context=tier-one#rate-limits-in-headers
        const limits = {
            requestLimit: parseInt(headers['x-ratelimit-limit-requests']),
            requestRemaining: parseInt(headers['x-ratelimit-remaining-requests']),
            requestReset: this.parseTimeStringToMs(headers['x-ratelimit-reset-requests'])
        };

        // Update internal limits if headers are present
        if (!isNaN(limits.requestLimit)) {
            this.maxRequestsPerMinute = limits.requestLimit;
        }

        // Adjust backoff if we're close to limits
        if (!isNaN(limits.requestRemaining) && limits.requestLimit) {
            const remainingPercent = limits.requestRemaining / limits.requestLimit;
            if (remainingPercent < 0.1) { // Less than 10% remaining
                this.currentBackoff = Math.min(
                    this.maxBackoffTime,
                    this.currentBackoff * this.backoffMultiplier
                );
            }
        }

        return limits;
    }

    parseTimeStringToMs(timeStr) {
        if (!timeStr) return null;

        const timeUnitToMsMap = {
            'ns': 1e-6,      // Nanoseconds to milliseconds
            'μs': 1e-3,      // Microseconds to milliseconds
            'ms': 1,         // Milliseconds
            's': 1000,       // Seconds to milliseconds
            'm': 60000,      // Minutes to milliseconds
            'h': 3600000     // Hours to milliseconds
        };

        let totalMs = 0;
        const regex = /(\d+)(ns|μs|ms|s|m|h)/g;
        let match;

        while ((match = regex.exec(timeStr)) !== null) {
            const [_, value, unit] = match;
            totalMs += parseInt(value) * timeUnitToMsMap[unit];
        }

        return totalMs;
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

        // If it's a rate limit error, enforce a minimum wait time
        if (error.response?.status === 429) {
            this.currentBackoff = Math.max(this.currentBackoff, 5000);
        }

        return this.currentBackoff;
    }

    resetErrorCount() {
        if (this.consecutiveErrors > 0 && Date.now() - this.lastErrorTime > this.windowDuration) {
            this.consecutiveErrors = 0;
            this.currentBackoff = this.minBackoffTime;
        }
    }
}


class ParallelRateLimiter extends AdaptiveRateLimiter {
    constructor(options = {}) {
        super(options);

        this.hasKnownLimits = false;
        this.safeParallelLimit = 1; // Default to 1 parallel request (sequential)
        this.rateLimitConfidence = 0; // Number of responses confirmed rate limits
    }

    updateLimitsFromHeaders(headers) {
        const limits = super.updateLimitsFromHeaders(headers);

        const hasAllHeaders = !!(
            limits.requestLimit &&
            limits.requestRemaining &&
            limits.requestReset
        );

        if (hasAllHeaders) {
            this.rateLimitConfidence++;
            if (this.rateLimitConfidence >= 2) { // Need 2 responses to confirm rate limits
                this.hasKnownLimits = true;
                // Calculate safe parallel limit based on remaining requests capacity
                const resetTimeInSeconds = limits.requestReset / 1000;
                const requestsPerSecond = limits.requestLimit / 60;
                const safeRequestsPerSecond = requestsPerSecond * 0.8; // 80% of limit for safety
                this.safeParallelLimit = Math.max(1, Math.floor(safeRequestsPerSecond * resetTimeInSeconds));
            }
        }

        return limits;
    }

    canProcessInParallel() {
        return this.hasKnownLimits && this.safeParallelLimit > 1;
    }

    getParallelLimit() {
        return this.safeParallelLimit;
    }
}


export { AdaptiveRateLimiter, ParallelRateLimiter };