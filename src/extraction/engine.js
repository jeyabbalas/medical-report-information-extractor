/**
 * Extraction Engine
 * Core orchestration for information extraction from reports
 */

import { API_PROVIDERS } from '../core/constants.js';

/**
 * Check for missing information required for extraction
 * @param {Object} params
 * @param {Function} params.getConfigRecord - Function to get config from DB
 * @param {Function} params.getAllUploadedFiles - Function to get uploaded files
 * @returns {Promise<string[]>} - Array of missing item descriptions
 */
export async function getMissingInfo({ getConfigRecord, getAllUploadedFiles }) {
    const missing = [];

    // Config
    const appConfig = await getConfigRecord('appConfig');
    if (!appConfig) {
        missing.push('Application configuration file (config.json)');
    } else {
        if (!appConfig.systemPrompt) missing.push('System prompt in configuration file');
        if (!appConfig.schemaFiles || !appConfig.schemaFiles.length) {
            missing.push('At least one JSON Schema in configuration file');
        }
    }

    // Remote API credentials (always required)
    const creds = await getConfigRecord('llmApiCreds');
    if (!creds || !creds.apiKey) {
        missing.push('LLM API key');
    } else if (creds.provider === API_PROVIDERS.OPENAI && !creds.baseUrl) {
        missing.push('LLM API Base URL (required for OpenAI-compatible APIs)');
    }

    // Model selection
    const modelRec = await getConfigRecord('model');
    if (!modelRec || !modelRec.name) {
        missing.push('LLM model selection');
    }

    // Uploaded files
    const files = await getAllUploadedFiles();
    if (!files || !files.length) {
        missing.push('At least one uploaded report');
    }

    return missing;
}

/**
 * Build extraction tasks for reports that need processing
 * @param {Object[]} reports - Array of report objects
 * @param {Object[]} schemaFiles - Array of schema objects
 * @param {string} systemPrompt - The system prompt
 * @param {string} model - The model name
 * @returns {Promise<Object[]>} - Array of extraction tasks
 */
export async function buildExtractionTasks(reports, schemaFiles, systemPrompt, model) {
    const tasks = [];

    for (const report of reports) {
        // Track which schemas have already been extracted for this report
        const extractedBySchemaId = new Set();

        if (report.extractions && Array.isArray(report.extractions)) {
            for (const e of report.extractions) {
                const hasSomeKeys = e.data && Object.keys(e.data).length > 0;
                if (hasSomeKeys) {
                    extractedBySchemaId.add(e.schemaId);
                }
            }
        }

        // Create tasks for schemas not yet extracted
        for (let i = 0; i < schemaFiles.length; i++) {
            const schema = schemaFiles[i];
            if (!extractedBySchemaId.has(i)) {
                tasks.push({
                    report,
                    schema,
                    schemaId: i,
                    systemPrompt,
                    model
                });
            }
        }
    }

    return tasks;
}

/**
 * Count already extracted schemas per report
 * @param {Object[]} reports - Array of report objects
 * @param {number} schemasCount - Total number of schemas
 * @returns {{reportTaskCountMap: Map, completedReports: number, completedTasks: number}}
 */
export function countExtractionProgress(reports, schemasCount) {
    const reportTaskCountMap = new Map();
    let completedReports = 0;
    let completedTasks = 0;

    for (const report of reports) {
        let extractedCount = 0;
        if (report.extractions && Array.isArray(report.extractions)) {
            for (const e of report.extractions) {
                const hasSomeKeys = e.data && Object.keys(e.data).length > 0;
                if (hasSomeKeys) {
                    extractedCount++;
                }
            }
        }
        reportTaskCountMap.set(report.id, extractedCount);
        if (extractedCount === schemasCount) {
            completedReports++;
        }
    }

    completedTasks = Array.from(reportTaskCountMap.values())
        .reduce((acc, val) => acc + val, 0);

    return { reportTaskCountMap, completedReports, completedTasks };
}

/**
 * Update a report with extraction results
 * @param {Object} report - The report object
 * @param {number} schemaId - The schema ID
 * @param {Object} result - The extraction result
 * @param {Error|null} error - Any error that occurred
 * @returns {Object} - The updated report
 */
export function updateReportWithExtraction(report, schemaId, result, error) {
    if (!report.extractions) {
        report.extractions = [];
    }

    let existing = report.extractions.find(e => e.schemaId === schemaId);
    if (!existing) {
        existing = { schemaId, data: {} };
        report.extractions.push(existing);
    }

    if (!error) {
        existing.data = result || {};
    }

    return report;
}

/**
 * Determine which UI element to scroll to based on missing item
 * @param {string} missingItem - The missing item description
 * @returns {string|null} - The element ID to scroll to, or null
 */
export function getMissingFieldElementId(missingItem) {
    if (!missingItem) return null;

    if (/config\.json/i.test(missingItem) ||
        /System prompt/i.test(missingItem) ||
        /JSON Schema/i.test(missingItem)) {
        return 'config-url';
    }

    if (/Base URL/i.test(missingItem) ||
        /API key/i.test(missingItem)) {
        return 'tab-openai';
    }

    if (/model selection/i.test(missingItem)) {
        return 'llm-model';
    }

    if (/uploaded report/i.test(missingItem)) {
        return 'file-drop-area';
    }

    return null;
}
