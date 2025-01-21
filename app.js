import {ui} from './src/gui.js';
import {validateJsonSchema} from './src/jsonSchemaUtils.js';
import {validateJsonLd, buildPlainTable, buildLinkedTable,} from "./src/jsonLdUtils.js";
import {manageOpenAiApiKey} from "./src/informationExtractor.js";

import {openDB} from 'https://cdn.jsdelivr.net/npm/idb@8/+esm'


function setConfigErrorMessage(errorText) {
    const errorContainer = document.getElementById('config-error-message-container');
    if (!errorContainer) return;

    if (!errorContainer.querySelector('.copy-error-button')) {
        errorContainer.innerHTML = `
      <div class="relative bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 text-sm max-h-96 overflow-y-auto">
        <button 
          class="copy-error-button absolute top-2 right-2 bg-white text-gray-500 border border-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded px-2 py-1 text-xs flex items-center gap-1"
          title="Copy entire error text"
        >
          <span class="button-text">Copy</span>
        </button>
        <div class="error-text space-y-2"></div>
      </div>
    `;
        const copyBtn = errorContainer.querySelector('.copy-error-button');
        copyBtn.addEventListener('click', copyConfigErrorMessage);
    }

    const errorTextDiv = errorContainer.querySelector('.error-text');
    if (errorTextDiv) {
        errorTextDiv.textContent = errorText;
    }

    errorContainer.classList.remove('hidden');
}


function clearConfigErrorMessage() {
    const errorContainer = document.getElementById('config-error-message-container');
    if (!errorContainer) return;
    errorContainer.innerHTML = '';
    errorContainer.classList.add('hidden');
}


async function copyConfigErrorMessage() {
    const errorContainer = document.getElementById('config-error-message-container');
    if (!errorContainer) return;

    const errorTextDiv = errorContainer.querySelector('.error-text');
    const copyBtn = errorContainer.querySelector('.copy-error-button');
    const buttonText = copyBtn.querySelector('.button-text');

    if (!errorTextDiv || !copyBtn || !buttonText) return;

    const originalClasses = copyBtn.className;

    try {
        await navigator.clipboard.writeText(errorTextDiv.textContent);

        copyBtn.className = 'copy-error-button absolute top-2 right-2 bg-white text-green-600 border border-green-400 rounded px-2 py-1 text-xs flex items-center gap-1';
        buttonText.textContent = '✓';

        setTimeout(() => {
            copyBtn.className = originalClasses;
            buttonText.textContent = 'Copy';
        }, 2000);
    } catch (err) {
        copyBtn.className = 'copy-error-button absolute top-2 right-2 bg-white text-red-600 border border-red-400 rounded px-2 py-1 text-xs flex items-center gap-1';
        buttonText.textContent = '!';

        setTimeout(() => {
            copyBtn.className = originalClasses;
            buttonText.textContent = 'Copy';
        }, 2000);
    }
}


async function loadConfig(configUrl) {
    clearConfigErrorMessage();

    if (!configUrl) {
        setConfigErrorMessage('No config URL provided.');
        return;
    }

    // Config JSON
    let configJson;
    try {
        const resp = await fetch(configUrl);
        if (!resp.ok) {
            throw new Error(`Failed to fetch config.json. HTTP ${resp.status}`);
        }
        configJson = await resp.json();
    } catch (err) {
        setConfigErrorMessage(`Could not parse the config file as JSON: ${err.message}`);
        return;
    }

    // Check config JSON format
    const {systemPrompt, schemaFiles, jsonldContextFiles} = configJson;
    if (!systemPrompt) {
        setConfigErrorMessage(`config.json is missing "systemPrompt" property.`);
        return;
    }
    if (schemaFiles === undefined) {
        setConfigErrorMessage(`config.json is missing "schemaFiles" property.`);
        return;
    }
    if (jsonldContextFiles === undefined) {
        setConfigErrorMessage(`config.json is missing "jsonldContextFiles" property.`);
        return;
    }
    if (typeof systemPrompt !== 'string') {
        setConfigErrorMessage(`"systemPrompt" must be a string containing a URL.`);
        return;
    }

    // systemPrompt file
    let systemPromptText;
    try {
        const promptResp = await fetch(systemPrompt);
        if (!promptResp.ok) {
            throw new Error(`Failed to fetch systemPrompt file. HTTP ${promptResp.status}`);
        }
        systemPromptText = await promptResp.text();
    } catch (err) {
        setConfigErrorMessage(`Could not fetch systemPrompt text: ${err.message}`);
        return;
    }

    // schemaFiles
    const schemaFileUrls = Array.isArray(schemaFiles) ? schemaFiles : [schemaFiles];
    const parsedSchemas = [];
    for (const fileUrl of schemaFileUrls) {
        try {
            const schemaResp = await fetch(fileUrl);
            if (!schemaResp.ok) {
                throw new Error(`Failed to fetch schema file. HTTP ${schemaResp.status}`);
            }
            const schemaJson = await schemaResp.json();
            const {valid, error} = await validateJsonSchema(schemaJson);
            if (!valid) {
                throw new Error(`Schema file at ${fileUrl} is not a valid JSON Schema: ${error}`);
            }
            parsedSchemas.push(schemaJson);
        } catch (err) {
            setConfigErrorMessage(`Could not load/validate schemaFile at "${fileUrl}": ${err.message}`);
            return;
        }
    }

    // jsonldContextFiles
    const jsonldFileUrls = Array.isArray(jsonldContextFiles)
        ? jsonldContextFiles
        : [jsonldContextFiles];
    const parsedJsonLds = [];
    for (const fileUrl of jsonldFileUrls) {
        try {
            const jsonldResp = await fetch(fileUrl);
            if (!jsonldResp.ok) {
                throw new Error(`Failed to fetch JSON-LD file. HTTP ${jsonldResp.status}`);
            }
            const jsonldDoc = await jsonldResp.json();
            const {valid, error} = await validateJsonLd(jsonldDoc);
            if (!valid) {
                throw new Error(`JSON-LD file at ${fileUrl} is invalid: ${error}`);
            }
            parsedJsonLds.push(jsonldDoc);
        } catch (err) {
            setConfigErrorMessage(`Could not load/validate JSON-LD file at "${fileUrl}": ${err.message}`);
            return;
        }
    }

    // Save to IndexedDB
    try {
        const db = await openDB('medical-report-information-extractor-db', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', {keyPath: 'id'});
                }
            }
        });

        const configToSave = {
            id: 'currentConfig',
            systemPrompt: systemPromptText,
            schemaFiles: parsedSchemas,
            jsonldContextFiles: parsedJsonLds
        };

        await db.put('config', configToSave);
    } catch (err) {
        setConfigErrorMessage(`Failed to save config in IndexedDB: ${err.message}`);
        return;
    }

    // Success!
    setConfigErrorMessage('✓ Config loaded successfully!');
    const container = document.getElementById('config-error-message-container');
    if (container) {
        container.querySelector('.relative').classList.remove('bg-red-50', 'text-red-800', 'border-red-300');
        container.querySelector('.relative').classList.add('bg-green-50', 'text-green-800', 'border-green-300');
    }
}


/**
 *  - Check if there's a ?configUrl param.
 *  - If yes, load config.
 *  - Else, if #config-url has a default value, load config from that.
 * Then attach listener for #config-url changes.
 */
function init() {
    ui('app');

    const urlParams = new URLSearchParams(window.location.search);
    let paramUrl = urlParams.get('configUrl');
    const configInputEl = document.getElementById('config-url');
    if (!configInputEl) return;

    if (paramUrl) {
        // Config URL param is present
        configInputEl.value = paramUrl;
        loadConfig(paramUrl);
    } else if (configInputEl.value) {
        // #config-url input has a prefilled value
        paramUrl = configInputEl.value;
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('configUrl', paramUrl);
        window.history.replaceState({}, '', newUrl.toString());
        loadConfig(paramUrl);
    }

    configInputEl.addEventListener('change', () => {
        const newConfigUrl = configInputEl.value;
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.set('configUrl', newConfigUrl);
        window.history.replaceState({}, '', currentUrl.toString());
        loadConfig(newConfigUrl);
    });
}


document.addEventListener('DOMContentLoaded', init);
//import {OpenAI} from 'https://cdn.skypack.dev/openai@4.78.1?min';