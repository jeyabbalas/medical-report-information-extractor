/**
 * Prompt building utilities for LLM extraction
 */

/**
 * Build the developer/system prompt with report content
 * @param {string} systemPrompt - The system prompt instructions
 * @param {string} report - The report content
 * @returns {string} - Formatted developer prompt
 */
export function buildDeveloperPrompt(systemPrompt, report) {
    return `<instructions>\n${systemPrompt}\n</instructions>\n\n<report>\n${report}\n</report>`;
}

/**
 * Build the user query from a JSON schema
 * @param {Object} schema - The JSON schema object
 * @returns {string} - Formatted user query
 */
export function buildUserQuery(schema) {
    const keys = Object.keys(schema.properties || {});
    return `<query>\n<json_keys>\n[${keys.join(', ')}]\n</json_keys>\n<json_schema>\n\`\`\`json${JSON.stringify(schema, null, 2)}\`\`\`\n</json_schema>\n</query>`;
}

/**
 * Combine developer prompt and user query for providers that use single-message format
 * @param {string} systemPrompt - The system prompt instructions
 * @param {string} report - The report content
 * @param {Object} schema - The JSON schema object
 * @returns {string} - Combined prompt
 */
export function buildCombinedPrompt(systemPrompt, report, schema) {
    const developerPrompt = buildDeveloperPrompt(systemPrompt, report);
    const userQuery = buildUserQuery(schema);
    return developerPrompt + '\n\n' + userQuery;
}
