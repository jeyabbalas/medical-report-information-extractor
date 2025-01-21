import {ui} from './src/gui.js';
import {validateJsonSchema} from './src/jsonSchemaUtils.js';
import {validateJsonLd, buildPlainTable, buildLinkedTable} from "./src/jsonLdUtils.js";

import {openDB} from 'https://cdn.jsdelivr.net/npm/idb@8/+esm'
import {OpenAI} from 'https://cdn.skypack.dev/openai@4.78.1?min';


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
        }, 1000);
    } catch (err) {
        copyBtn.className = 'copy-error-button absolute top-2 right-2 bg-white text-red-600 border border-red-400 rounded px-2 py-1 text-xs flex items-center gap-1';
        buttonText.textContent = '!';

        setTimeout(() => {
            copyBtn.className = originalClasses;
            buttonText.textContent = 'Copy';
        }, 1000);
    }
}


function showConfigLoadingBar() {
    const wrapper = document.getElementById('config-loading-bar-wrapper');
    if (wrapper) wrapper.classList.remove('hidden');
}


function hideConfigLoadingBar() {
    const wrapper = document.getElementById('config-loading-bar-wrapper');
    if (wrapper) wrapper.classList.add('hidden');
    const bar = document.getElementById('config-loading-bar');
    if (bar) bar.style.width = '0%';
}


function updateConfigLoadingBar(percent) {
    const bar = document.getElementById('config-loading-bar');
    if (bar) {
        bar.style.width = `${percent}%`;
    }
}


async function loadConfig(configUrl) {
    clearConfigErrorMessage();

    let totalFetches = 1;
    let completedFetches = 0;

    function incrementLoadingProgress() {
        completedFetches++;
        const progress = (completedFetches / totalFetches) * 100;
        updateConfigLoadingBar(progress);
    }

    showConfigLoadingBar();

    try {
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

            // We fetched the config, so increment progress:
            incrementLoadingProgress();

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

        const schemaFileUrls = Array.isArray(schemaFiles) ? schemaFiles : [schemaFiles];
        const jsonldFileUrls = Array.isArray(jsonldContextFiles)
            ? jsonldContextFiles
            : [jsonldContextFiles];
        totalFetches = 1 + schemaFileUrls.length + jsonldFileUrls.length + 1;

        // systemPrompt file
        let systemPromptText;
        try {
            const promptResp = await fetch(systemPrompt);
            if (!promptResp.ok) {
                throw new Error(`Failed to fetch systemPrompt file. HTTP ${promptResp.status}`);
            }
            systemPromptText = await promptResp.text();

            incrementLoadingProgress();
        } catch (err) {
            setConfigErrorMessage(`Could not fetch systemPrompt text: ${err.message}`);
            return;
        }

        // schemaFiles
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

                incrementLoadingProgress();
            } catch (err) {
                setConfigErrorMessage(`Could not load/validate schemaFile at "${fileUrl}": ${err.message}`);
                return;
            }
        }

        // jsonldContextFiles
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

                incrementLoadingProgress();
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

            incrementLoadingProgress();

        } catch (err) {
            setConfigErrorMessage(`Failed to save config in IndexedDB: ${err.message}`);
            return;
        }

        // Success!
        setConfigErrorMessage('✓ Configuration files loaded successfully!');
        const container = document.getElementById('config-error-message-container');
        if (container) {
            container.querySelector('.relative').classList.remove('bg-red-50', 'text-red-800', 'border-red-300');
            container.querySelector('.relative').classList.add('bg-green-50', 'text-green-800', 'border-green-300');
        }

    } finally {
        hideConfigLoadingBar();
    }
}


function setApiKeyMessage(message, isSuccess = false) {
    const container = document.getElementById('api-key-message-container');
    if (!container) return;

    container.className = 'relative p-3 text-sm rounded-lg border my-2';

    if (isSuccess) {
        container.classList.add('bg-green-50', 'text-green-800', 'border-green-300');
    } else {
        container.classList.add('bg-red-50', 'text-red-800', 'border-red-300');
    }
    container.textContent = message;
}


function clearApiKeyMessage() {
    const container = document.getElementById('api-key-message-container');
    if (!container) return;
    container.textContent = '';
    container.className = 'hidden';
}


async function validateOpenAiApiKey(baseUrl, apiKey) {
    try {
        const openai = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey,
            dangerouslyAllowBrowser: true
        });
        await openai.models.list();
        return true;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.error('Invalid API key:', error);
            return false;
        } else {
            console.error('Error checking API key:', error);
            return false;
        }
    }
}


async function initOpenAiCredentials() {
    try {
        const db = await openDB('medical-report-information-extractor-db', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', {keyPath: 'id'});
                }
            }
        });

        const storedCreds = await db.get('config', 'openAiCreds');
        if (!storedCreds) {
            // No credentials stored
            return;
        }

        // Populate fields
        const baseUrlField = document.getElementById('llm-base-url');
        const apiKeyField = document.getElementById('llm-api-key');

        if (baseUrlField && apiKeyField) {
            baseUrlField.value = storedCreds.baseUrl ?? '';
            apiKeyField.value = storedCreds.apiKey ?? '';

            // Attempt validation
            const isValid = await validateOpenAiApiKey(storedCreds.baseUrl, storedCreds.apiKey);
            if (isValid) {
                setApiKeyMessage('✓ OpenAI API key is valid.', true);
            } else {
                setApiKeyMessage('OpenAI API key appears to be invalid.', false);
            }
        }
    } catch (err) {
        console.error('Error retrieving OpenAI credentials from IDB:', err);
    }
}


async function submitOpenAiCredentials() {
    clearApiKeyMessage();

    // Gather values from form
    const baseUrlField = document.getElementById('llm-base-url');
    const apiKeyField = document.getElementById('llm-api-key');
    if (!baseUrlField || !apiKeyField) {
        setApiKeyMessage('Missing input fields for base URL or API key.', false);
        return;
    }

    const baseUrl = baseUrlField.value.trim();
    const apiKey = apiKeyField.value.trim();

    if (!baseUrl || !apiKey) {
        setApiKeyMessage('Please provide both Base URL and API key.', false);
        return;
    }

    // Validate
    const isValid = await validateOpenAiApiKey(baseUrl, apiKey);
    if (!isValid) {
        setApiKeyMessage('Invalid API credentials. Please check your base URL and key.', false);
        return;
    }

    // If valid, store in IDB
    try {
        const db = await openDB('medical-report-information-extractor-db', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', {keyPath: 'id'});
                }
            }
        });
        const credsToStore = {
            id: 'openAiCreds',
            baseUrl,
            apiKey
        };
        await db.put('config', credsToStore);

        setApiKeyMessage('✓ Your OpenAI credentials are valid and have been saved successfully!', true);
    } catch (err) {
        setApiKeyMessage(`Error saving credentials: ${err.message}`, false);
    }
}


async function forgetOpenAiCredentials() {
    clearApiKeyMessage();
    try {
        const db = await openDB('medical-report-information-extractor-db', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', {keyPath: 'id'});
                }
            }
        });
        await db.delete('config', 'openAiCreds');

        // Clear input fields
        const baseUrlField = document.getElementById('llm-base-url');
        const apiKeyField = document.getElementById('llm-api-key');
        if (baseUrlField) baseUrlField.value = '';
        if (apiKeyField) apiKeyField.value = '';

        setApiKeyMessage('OpenAI credentials have been removed.', true);
    } catch (err) {
        setApiKeyMessage(`Error removing credentials: ${err.message}`, false);
    }
}


function init() {
    ui('app');

    // 1. Initialize OpenAI credentials from IDB if available
    initOpenAiCredentials();

    // 2. If there's a ?configUrl param or a default value in #config-url, load config
    const urlParams = new URLSearchParams(window.location.search);
    let paramUrl = urlParams.get('configUrl');
    const configInputEl = document.getElementById('config-url');
    if (!configInputEl) return;

    if (paramUrl) {
        configInputEl.value = paramUrl;
        loadConfig(paramUrl);
    } else if (configInputEl.value) {
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

    // 3. Wire up "Submit API key" and "Forget API key"
    const submitApiKeyBtn = document.getElementById('submit-api-key');
    const forgetApiKeyBtn = document.getElementById('forget-api-key');
    if (submitApiKeyBtn) {
        submitApiKeyBtn.addEventListener('click', submitOpenAiCredentials);
    }
    if (forgetApiKeyBtn) {
        forgetApiKeyBtn.addEventListener('click', forgetOpenAiCredentials);
    }
}


document.addEventListener('DOMContentLoaded', init);