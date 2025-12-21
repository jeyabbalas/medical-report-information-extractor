/**
 * Result display and download utilities
 */

import { buildPlainTable, buildLinkedTable, buildTabularJsonLdDoc, generateJsonLdDocForFileName, generateJsonLdDocForProvenance } from '../jsonLdUtils.js';
import { convertJsonToCsv, getDataHeaders } from './processor.js';

/**
 * Create download buttons for both JSON and CSV formats
 * @param {Object[]} data - The data to be downloaded
 * @returns {HTMLElement} - Container with both download buttons
 */
export function createDownloadButtons(data) {
    const btnContainer = document.createElement('div');
    btnContainer.id = 'downloadBtnContainer';
    btnContainer.className = 'flex justify-center gap-2 w-full my-2';

    // JSON Download Button
    const jsonBtn = document.createElement('button');
    jsonBtn.className = 'inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
    jsonBtn.textContent = 'Download JSON';
    jsonBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `extracted_information.json`);
        dlAnchorElem.click();
    });

    // CSV Download Button
    const csvBtn = document.createElement('button');
    csvBtn.className = 'inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
    csvBtn.textContent = 'Download CSV';
    csvBtn.addEventListener('click', () => {
        const csvData = convertJsonToCsv(data);
        const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvData);
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `extracted_information.csv`);
        dlAnchorElem.click();
    });

    btnContainer.appendChild(jsonBtn);
    btnContainer.appendChild(csvBtn);
    return btnContainer;
}

/**
 * Create a single download button for data
 * @param {string} buttonLabel - The button text
 * @param {Object} data - The data to download
 * @param {boolean} [isLinkedData=false] - Whether this is JSON-LD data
 * @returns {HTMLElement} - Container with download button
 */
export function createDownloadDataButton(buttonLabel, data, isLinkedData = false) {
    const btnContainer = document.createElement('div');
    btnContainer.id = 'downloadBtnContainer';
    btnContainer.className = 'flex justify-center w-full my-2';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
    downloadBtn.textContent = buttonLabel;
    downloadBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        if (isLinkedData) {
            dlAnchorElem.setAttribute("download", `extracted_information.jsonld`);
        } else {
            dlAnchorElem.setAttribute("download", `extracted_information.json`);
        }
        dlAnchorElem.click();
    });

    btnContainer.appendChild(downloadBtn);
    return btnContainer;
}

/**
 * Clear the extracted data display
 */
export function clearDisplayedExtractedData() {
    const tableContainer = document.getElementById('info-extraction');
    if (tableContainer) {
        tableContainer.innerHTML = '';
    }
}

/**
 * Display extracted data in a table with download buttons
 * @param {Object[]} data - The extracted data array
 */
export function displayExtractedData(data) {
    const tableContainer = document.getElementById('info-extraction');
    if (tableContainer) {
        clearDisplayedExtractedData();
        const headers = getDataHeaders(data);
        tableContainer.appendChild(buildPlainTable(data, headers));
        tableContainer.appendChild(createDownloadButtons(data));
    }
}

/**
 * Clear the JSON-LD display
 */
export function clearDisplayedJsonLdDoc() {
    const jsonLdContainer = document.getElementById('standardization');
    if (jsonLdContainer) {
        jsonLdContainer.innerHTML = '';
    }
}

/**
 * Display JSON-LD document in a linked table with download button
 * @param {Object} jsonLdDoc - The JSON-LD document
 */
export async function displayJsonLdDoc(jsonLdDoc) {
    const jsonLdContainer = document.getElementById('standardization');
    if (jsonLdContainer) {
        clearDisplayedJsonLdDoc();
        await buildLinkedTable(jsonLdContainer, jsonLdDoc);
        jsonLdContainer.appendChild(createDownloadDataButton('Download JSON-LD', jsonLdDoc, true));
    }
}

/**
 * Prepare a JSON-LD document with provenance information
 * @param {string[]} schemaFileUrls - URLs of schema files
 * @param {Object[]} jsonLdContextFiles - JSON-LD context documents
 * @param {Object[]} tabularData - The extracted data
 * @param {Object} provenance - Provenance information
 * @param {string} provenance.startedAtTime - ISO timestamp when extraction started
 * @param {string} provenance.endedAtTime - ISO timestamp when extraction ended
 * @param {string} provenance.applicationURL - URL of the application
 * @param {string} provenance.chatCompletionsEndpoint - API endpoint used
 * @param {string} provenance.modelName - Model name used
 * @returns {Object} - The prepared JSON-LD document
 */
export function prepareJsonLdDoc(schemaFileUrls, jsonLdContextFiles, tabularData, provenance = {}) {
    const jsonLdContextFilesCopy = jsonLdContextFiles.slice();
    jsonLdContextFilesCopy.push(generateJsonLdDocForFileName());
    const provenanceDoc = generateJsonLdDocForProvenance(
        provenance.startedAtTime,
        provenance.endedAtTime,
        provenance.applicationURL,
        provenance.chatCompletionsEndpoint,
        provenance.modelName
    );
    return buildTabularJsonLdDoc(schemaFileUrls, jsonLdContextFilesCopy, tabularData, provenanceDoc);
}
