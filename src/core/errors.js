/**
 * Centralized error handling utilities for API errors
 */

/**
 * Check if an error is an authentication error (401 or 403)
 * @param {Error} error - The error object to check
 * @returns {boolean} - True if it's an auth error
 */
export function isAuthError(error) {
    if (!error) return false;

    // Check for explicit auth error flag
    if (error.isAuthError) return true;

    // Check status property (Gemini style)
    if (error.status === 401 || error.status === 403) return true;

    // Check response.status (OpenAI style)
    if (error.response?.status === 401 || error.response?.status === 403) return true;

    return false;
}

/**
 * Check if an error is a rate limit error (429)
 * @param {Error} error - The error object to check
 * @returns {boolean} - True if it's a rate limit error
 */
export function isRateLimitError(error) {
    if (!error) return false;

    // Check status property (Gemini style)
    if (error.status === 429) return true;

    // Check response.status (OpenAI style)
    if (error.response?.status === 429) return true;

    return false;
}

/**
 * Create a standardized auth error
 * @returns {Error} - An error marked as an auth error
 */
export function createAuthError() {
    const error = new Error('Authentication error');
    error.isAuthError = true;
    return error;
}

/**
 * Format an API error into a user-friendly message
 * @param {Error} error - The error object
 * @returns {string} - A user-friendly error message
 */
export function formatApiError(error) {
    if (!error) return 'An unknown error occurred';

    if (isAuthError(error)) {
        return 'Your API key is invalid. Please re-enter a valid key.';
    }

    if (isRateLimitError(error)) {
        return 'Rate limit exceeded. Please wait a moment and try again.';
    }

    // Try to extract message from various error formats
    if (error.message) return error.message;
    if (error.error?.message) return error.error.message;

    return 'An error occurred while communicating with the API';
}

/**
 * Get the HTTP status code from an error
 * @param {Error} error - The error object
 * @returns {number|null} - The status code or null if not found
 */
export function getErrorStatus(error) {
    if (!error) return null;

    if (error.status) return error.status;
    if (error.response?.status) return error.response.status;

    return null;
}
