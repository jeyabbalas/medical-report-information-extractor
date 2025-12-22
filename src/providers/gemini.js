/**
 * Google Gemini Provider implementation
 * Supports Google Gemini API via @google/genai
 */

import { GoogleGenAI } from '@google/genai';
import { BaseLLMProvider } from './base.js';
import { DEFAULT_TEMPERATURE, MAX_RETRIES, API_PROVIDERS } from '../core/constants.js';

export class GeminiProvider extends BaseLLMProvider {
    /**
     * @param {Object} config
     * @param {string} config.apiKey - The Gemini API key
     */
    constructor(config) {
        super(config);
        this.name = API_PROVIDERS.GEMINI;
        this.apiKey = config.apiKey;
    }

    /**
     * Validate the Gemini API credentials
     * @returns {Promise<boolean>}
     */
    async validateCredentials() {
        if (!this.apiKey) return false;

        try {
            const tempClient = new GoogleGenAI({ apiKey: this.apiKey });
            const pager = await tempClient.models.list();
            // Check if we can iterate the models
            for await (const model of pager) {
                return true; // If we get at least one model, key is valid
            }
            return true; // Empty list is still valid
        } catch (error) {
            console.error('Gemini API key validation failed:', error);
            return false;
        }
    }

    /**
     * Create the Gemini client
     * @returns {Promise<void>}
     */
    async createClient() {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * List available Gemini models
     * @returns {Promise<Array<{id: string, displayName: string}>>}
     */
    async listModels() {
        if (!this.client) {
            throw new Error('Client not initialized. Call createClient() first.');
        }

        try {
            const pager = await this.client.models.list();
            const textModels = [];

            for await (const model of pager) {
                const name = model.name || '';
                // Include all gemini models, exclude only embeddings
                if (name.includes('gemini') && !name.includes('embedding')) {
                    textModels.push({
                        id: name.replace('models/', ''),
                        displayName: model.displayName || name.replace('models/', '')
                    });
                }
            }

            // Fallback: if no gemini models found, show all non-embedding models
            if (!textModels.length) {
                const pager2 = await this.client.models.list();
                for await (const model of pager2) {
                    const name = model.name || '';
                    if (!name.includes('embedding')) {
                        textModels.push({
                            id: name.replace('models/', ''),
                            displayName: model.displayName || name.replace('models/', '')
                        });
                    }
                }
            }

            // Sort by name descending (newer versions first)
            textModels.sort((a, b) => b.id.localeCompare(a.id));

            return textModels;
        } catch (error) {
            console.error('Error listing Gemini models:', error);
            throw error;
        }
    }

    /**
     * Get preferred models for default selection
     * @returns {string[]}
     */
    getPreferredModels() {
        return ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest'];
    }

    /**
     * Execute extraction using Gemini chat completion
     * @param {Object} task - The extraction task
     * @param {Function} [checkTerminated] - Function to check if extraction was terminated
     * @returns {Promise<Object>}
     */
    async chatCompletion(task, checkTerminated = () => false) {
        if (!this.client) {
            throw new Error('Client not initialized. Call createClient() first.');
        }

        const { report, schema, model, systemPrompt } = task;

        const systemPromptContent = this.buildSystemPrompt(systemPrompt, report.content);
        const userQuery = this.buildUserQuery(schema);

        let attempt = 0;

        while (attempt < MAX_RETRIES && !checkTerminated()) {
            try {
                const response = await this.client.models.generateContent({
                    model: model,
                    contents: systemPromptContent + '\n\n' + userQuery,
                    config: {
                        temperature: DEFAULT_TEMPERATURE
                    }
                });

                const message = response.text || '';
                const extracted = this.extractJsonFromResponse(message);

                if (extracted) {
                    return extracted;
                }

                console.warn(`Attempt ${attempt + 1}: No valid JSON found in Gemini response`);
            } catch (err) {
                if (err.status === 401 || err.status === 403) {
                    throw this.createAuthError();
                }
                if (err.status === 429) {
                    throw err; // Let rate limiter handle
                }
                console.error(`Attempt ${attempt + 1}: Gemini extraction error:`, err);
            }
            attempt++;
        }

        // Fallback if no valid JSON
        return {};
    }

    /**
     * Check if an error is an auth error (Gemini-specific)
     * @param {Error} error
     * @returns {boolean}
     */
    isAuthError(error) {
        if (error.isAuthError) return true;
        if (error.status === 401 || error.status === 403) return true;
        return false;
    }

    /**
     * Check if an error is a rate limit error (Gemini-specific)
     * @param {Error} error
     * @returns {boolean}
     */
    isRateLimitError(error) {
        return error.status === 429;
    }
}
