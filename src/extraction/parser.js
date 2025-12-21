/**
 * Response parsing utilities for LLM extraction
 */

import { JSON_EXTRACTION_REGEX } from '../core/constants.js';

/**
 * Extract JSON from LLM response text that may contain markdown code blocks
 * @param {string} responseText - The raw LLM response
 * @returns {string|null} - The extracted JSON string or null if not found
 */
export function extractJsonFromResponse(responseText) {
    if (!responseText) return null;

    const match = responseText.match(JSON_EXTRACTION_REGEX);
    if (match && match[1]) {
        return match[1].trim();
    }

    return null;
}

/**
 * Parse extracted JSON string safely
 * @param {string} jsonString - The JSON string to parse
 * @returns {Object|null} - The parsed object or null if parsing failed
 */
export function parseExtractedJson(jsonString) {
    if (!jsonString) return null;

    try {
        return JSON.parse(jsonString);
    } catch (err) {
        console.warn('Failed to parse JSON:', err.message);
        return null;
    }
}

/**
 * Extract and parse JSON from LLM response in one step
 * @param {string} responseText - The raw LLM response
 * @returns {Object|null} - The parsed object or null if extraction/parsing failed
 */
export function extractAndParseJson(responseText) {
    const jsonString = extractJsonFromResponse(responseText);
    if (!jsonString) return null;
    return parseExtractedJson(jsonString);
}

/**
 * Validate that extracted data has expected schema properties
 * @param {Object} data - The extracted data object
 * @param {Object} schema - The JSON schema
 * @returns {boolean} - True if data has at least one schema property
 */
export function hasSchemaProperties(data, schema) {
    if (!data || typeof data !== 'object') return false;
    if (!schema?.properties) return false;

    const schemaKeys = Object.keys(schema.properties);
    const dataKeys = Object.keys(data);

    // Check if any data key matches a schema key
    return dataKeys.some(key => schemaKeys.includes(key));
}
