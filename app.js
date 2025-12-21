/**
 * Medical Report Information Extractor
 * Main Application Entry Point
 *
 * This application extracts structured information from medical reports using LLMs.
 * Supports OpenAI-compatible APIs and Google Gemini.
 */

// =============================================================================
// IMPORTS - Existing modules
// =============================================================================
import { ui } from './src/gui.js';
import { validateJsonSchema } from './src/jsonSchemaUtils.js';
import { validateJsonLd, buildPlainTable, buildLinkedTable } from './src/jsonLdUtils.js';
import {
    saveConfigRecord,
    getConfigRecord,
    deleteConfigRecord,
    putUploadedFile,
    getAllUploadedFiles,
    clearUploadedFiles,
    deleteUploadedFile
} from './src/db.js';
import { DynamicConcurrentScheduler } from './src/apiCallManager.js';

// =============================================================================
// IMPORTS - New refactored modules
// =============================================================================
import { API_PROVIDERS, EXAMPLE_REPORT_URLS } from './src/core/constants.js';
import { isAuthError } from './src/core/errors.js';
import { buildDeveloperPrompt, buildUserQuery } from './src/extraction/prompts.js';
import { buildExtractionTasks, countExtractionProgress, updateReportWithExtraction } from './src/extraction/engine.js';
import { combineExtractedData } from './src/results/processor.js';
import {
    displayExtractedData,
    clearDisplayedExtractedData,
    displayJsonLdDoc,
    clearDisplayedJsonLdDoc,
    prepareJsonLdDoc
} from './src/results/display.js';
import {
    disableSubmitButton,
    updateClearButtonState,
    showExtractionProgressContainer,
    updateExtractionProgress,
    isExtractionInProgress
} from './src/ui/progress.js';
import {
    showMissingInfoModal,
    showEraseDataConfirmationModal,
    scrollToFirstMissingField,
    showRateLimitEarlyTerminationMessage,
    showModelChangeConfirmationModal
} from './src/ui/modals.js';
import {
    initProviderTabs,
    getSelectedProvider,
    setSelectedProvider,
    activateProviderTab,
    clearModelsDropdown,
    setApiKeyMessage,
    clearApiKeyMessage
} from './src/ui/providerTabs.js';

// =============================================================================
// IMPORTS - External libraries (from CDN)
// =============================================================================
import { OpenAI } from 'https://cdn.skypack.dev/openai@4.78.1?min';
import { GoogleGenAI } from 'https://cdn.jsdelivr.net/npm/@google/genai@1.0.0/+esm';

// =============================================================================
// GLOBAL STATE
// =============================================================================
let openaiClient = null;
let geminiClient = null;
let extractionTerminated = false;
let concurrencyScheduler = null;
let currentApiProvider = null;

// =============================================================================
// CONFIGURATION FILE LOADING
// =============================================================================

function setConfigErrorMessage(errorText) {
    const errorContainer = document.getElementById('config-error-message-container');
    if (!errorContainer) return;

    if (!errorContainer.querySelector('.copy-error-button')) {
        errorContainer.innerHTML = `
      <div class="relative bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 text-sm max-h-96 overflow-y-auto">
        <button class="copy-error-button absolute top-2 right-2 bg-white text-gray-500 border border-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded px-2 py-1 text-xs flex items-center gap-1" title="Copy entire error text">
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
            incrementLoadingProgress();
        } catch (err) {
            setConfigErrorMessage(`Could not parse the config file as JSON: ${err.message}`);
            return;
        }

        // Validate config JSON structure
        const { systemPrompt, schemaFiles, jsonldContextFiles } = configJson;
        if (!systemPrompt) {
            setConfigErrorMessage(`config.json is missing "systemPrompt" property.`);
            return;
        }
        if (schemaFiles === undefined) {
            setConfigErrorMessage(`config.json is missing "schemaFiles" property.`);
            return;
        }
        if (typeof systemPrompt !== 'string') {
            setConfigErrorMessage(`"systemPrompt" must be a string containing a URL.`);
            return;
        }

        const schemaFileUrls = Array.isArray(schemaFiles) ? schemaFiles : [schemaFiles];
        const jsonldFileUrls = jsonldContextFiles ? (Array.isArray(jsonldContextFiles) ? jsonldContextFiles : [jsonldContextFiles]) : [];
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
                const { valid, error } = await validateJsonSchema(schemaJson);
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
                const { valid, error } = await validateJsonLd(jsonldDoc);
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
        const configToSave = {
            id: 'appConfig',
            systemPrompt: systemPromptText,
            schemaFileUrls: schemaFileUrls,
            schemaFiles: parsedSchemas,
            jsonldContextFiles: parsedJsonLds
        };

        try {
            await saveConfigRecord(configToSave);
            incrementLoadingProgress();
        } catch (err) {
            setConfigErrorMessage(`Failed to save config in IndexedDB: ${err.message}`);
            return;
        }

        // Success!
        setConfigErrorMessage('✓ Configuration files loaded successfully!');
        const container = document.getElementById('config-error-message-container');
        if (container) {
            const box = container.querySelector('.relative');
            if (box) {
                box.classList.remove('bg-red-50', 'text-red-800', 'border-red-300');
                box.classList.add('bg-green-50', 'text-green-800', 'border-green-300');
            }
        }
    } finally {
        hideConfigLoadingBar();
    }
}

// =============================================================================
// API CREDENTIAL VALIDATION & MODEL SELECTION
// =============================================================================

async function validateOpenAiApiKey(baseUrl, apiKey) {
    try {
        const testClient = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey,
            dangerouslyAllowBrowser: true
        });
        await testClient.models.list();
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

async function validateGeminiApiKey(apiKey) {
    if (!apiKey) return false;
    try {
        const tempClient = new GoogleGenAI({ apiKey });
        const pager = await tempClient.models.list();
        for await (const model of pager) {
            return true;
        }
        return true;
    } catch (error) {
        console.error('Gemini API key validation failed:', error);
        return false;
    }
}

async function createGlobalOpenAiClient(baseUrl, apiKey) {
    openaiClient = new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
    });
    currentApiProvider = API_PROVIDERS.OPENAI;
    await populateModelsDropdown();
}

async function createGlobalGeminiClient(apiKey) {
    geminiClient = new GoogleGenAI({ apiKey });
    currentApiProvider = API_PROVIDERS.GEMINI;
    await populateGeminiModelsDropdown();
}

async function populateModelsDropdown() {
    if (!openaiClient) return;
    const selectEl = document.getElementById('llm-model');
    if (!selectEl) return;

    selectEl.innerHTML = '';

    try {
        const resp = await openaiClient.models.list();
        const modelIds = resp.data.map(m => m.id).sort();

        if (!modelIds.length) {
            selectEl.innerHTML = `<option disabled selected>No models found</option>`;
            return;
        }

        const storedModel = await getConfigRecord('model');
        for (const modelId of modelIds) {
            const opt = document.createElement('option');
            opt.value = modelId;
            opt.textContent = modelId;
            selectEl.appendChild(opt);
        }

        let modelToSelect;
        if (storedModel && storedModel.name && modelIds.includes(storedModel.name)) {
            modelToSelect = storedModel.name;
        } else if (modelIds.includes('gpt-4o')) {
            modelToSelect = 'gpt-4o';
        } else if (modelIds.includes('gpt-4o-mini')) {
            modelToSelect = 'gpt-4o-mini';
        } else {
            modelToSelect = modelIds[0];
        }
        selectEl.value = modelToSelect;

        if (!storedModel || storedModel.name !== modelToSelect) {
            await storeSelectedModelInIdb(modelToSelect);
        }
    } catch (error) {
        console.error('Error populating model dropdown:', error);
        selectEl.innerHTML = `<option disabled selected>Could not load models</option>`;
    }
}

async function populateGeminiModelsDropdown() {
    const selectEl = document.getElementById('llm-model');
    if (!selectEl || !geminiClient) return;

    selectEl.innerHTML = '';

    try {
        const pager = await geminiClient.models.list();
        const textModels = [];

        for await (const model of pager) {
            const name = model.name || '';
            if (name.includes('gemini') && !name.includes('embedding')) {
                textModels.push({
                    id: name.replace('models/', ''),
                    displayName: model.displayName || name.replace('models/', '')
                });
            }
        }

        if (!textModels.length) {
            const pager2 = await geminiClient.models.list();
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

        if (!textModels.length) {
            selectEl.innerHTML = `<option disabled selected>No models found</option>`;
            return;
        }

        textModels.sort((a, b) => b.id.localeCompare(a.id));

        const storedModel = await getConfigRecord('model');

        for (const model of textModels) {
            const opt = document.createElement('option');
            opt.value = model.id;
            opt.textContent = model.displayName;
            selectEl.appendChild(opt);
        }

        let modelToSelect;
        if (storedModel?.name) {
            const exists = Array.from(selectEl.options).some(opt => opt.value === storedModel.name);
            if (exists) modelToSelect = storedModel.name;
        }

        if (!modelToSelect) {
            const preferredModels = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest'];
            for (const preferred of preferredModels) {
                const found = Array.from(selectEl.options).find(opt => opt.value.includes(preferred));
                if (found) {
                    modelToSelect = found.value;
                    break;
                }
            }
        }

        if (!modelToSelect && selectEl.options.length > 0) {
            modelToSelect = selectEl.options[0].value;
        }

        if (modelToSelect) {
            selectEl.value = modelToSelect;
            await storeSelectedModelInIdb(modelToSelect);
        }

    } catch (error) {
        console.error('Error populating Gemini models dropdown:', error);
        selectEl.innerHTML = `<option disabled selected>Could not load models</option>`;
    }
}

async function storeSelectedModelInIdb(modelName) {
    const record = {
        id: 'model',
        name: modelName
    };
    await saveConfigRecord(record);
}

async function handleModelSelectionChange() {
    const selectEl = document.getElementById('llm-model');
    if (!selectEl) return;
    const newModel = selectEl.value;

    try {
        await storeSelectedModelInIdb(newModel);
    } catch (err) {
        console.error('Error handling model selection:', err);
    }
}

function detectApiProvider(baseUrl) {
    if (!baseUrl) return API_PROVIDERS.GEMINI;
    const url = baseUrl.toLowerCase();
    if (url.includes('generativelanguage.googleapis.com') ||
        url.includes('gemini') ||
        url.includes('google')) {
        return API_PROVIDERS.GEMINI;
    }
    return API_PROVIDERS.OPENAI;
}

async function initOpenAiCredentials() {
    try {
        const storedCreds = await getConfigRecord('llmApiCreds');
        if (!storedCreds) return;

        const provider = storedCreds.provider || detectApiProvider(storedCreds.baseUrl);

        // Activate correct tab
        activateProviderTab(provider);

        // Populate fields based on provider
        if (provider === API_PROVIDERS.GEMINI) {
            const geminiApiKeyField = document.getElementById('gemini-api-key');
            if (geminiApiKeyField) {
                geminiApiKeyField.value = storedCreds.apiKey ?? '';
            }
        } else {
            const openaiBaseUrlField = document.getElementById('openai-base-url');
            const openaiApiKeyField = document.getElementById('openai-api-key');
            if (openaiBaseUrlField) openaiBaseUrlField.value = storedCreds.baseUrl ?? '';
            if (openaiApiKeyField) openaiApiKeyField.value = storedCreds.apiKey ?? '';
        }

        // Validate and create client
        let isValid = false;

        if (provider === API_PROVIDERS.GEMINI) {
            isValid = await validateGeminiApiKey(storedCreds.apiKey);
            if (isValid) {
                await createGlobalGeminiClient(storedCreds.apiKey);
                setApiKeyMessage('✓ Gemini API key is valid.', true);
            }
        } else {
            isValid = await validateOpenAiApiKey(storedCreds.baseUrl, storedCreds.apiKey);
            if (isValid) {
                await createGlobalOpenAiClient(storedCreds.baseUrl, storedCreds.apiKey);
                setApiKeyMessage('✓ OpenAI API key is valid.', true);
            }
        }

        if (!isValid) {
            setApiKeyMessage('Stored API key appears to be invalid.', false);
            await deleteConfigRecord('llmApiCreds');
            await deleteConfigRecord('model');
            clearModelsDropdown();
        }
    } catch (err) {
        console.error('Error retrieving API credentials from IDB:', err);
    }
}

async function submitOpenAiCredentials() {
    clearApiKeyMessage();

    const selectedProvider = getSelectedProvider();
    let baseUrl, apiKey;

    if (selectedProvider === API_PROVIDERS.GEMINI) {
        apiKey = document.getElementById('gemini-api-key')?.value.trim();
        baseUrl = '';
    } else {
        baseUrl = document.getElementById('openai-base-url')?.value.trim();
        apiKey = document.getElementById('openai-api-key')?.value.trim();
    }

    if (!apiKey) {
        setApiKeyMessage('Please provide an API key.', false);
        return;
    }

    let isValid = false;

    if (selectedProvider === API_PROVIDERS.GEMINI) {
        isValid = await validateGeminiApiKey(apiKey);
        if (isValid) {
            await createGlobalGeminiClient(apiKey);
            openaiClient = null;
        }
    } else {
        if (!baseUrl) {
            setApiKeyMessage('Please provide a Base URL for OpenAI-compatible APIs.', false);
            return;
        }
        isValid = await validateOpenAiApiKey(baseUrl, apiKey);
        if (isValid) {
            await createGlobalOpenAiClient(baseUrl, apiKey);
            geminiClient = null;
        }
    }

    if (!isValid) {
        setApiKeyMessage('Invalid API credentials. Please check your API key.', false);
        clearModelsDropdown();
        await deleteConfigRecord('llmApiCreds');
        await deleteConfigRecord('model');
        return;
    }

    try {
        const credsToStore = {
            id: 'llmApiCreds',
            baseUrl: selectedProvider === API_PROVIDERS.GEMINI ? '' : baseUrl,
            apiKey,
            provider: selectedProvider
        };
        await saveConfigRecord(credsToStore);

        const providerName = selectedProvider === API_PROVIDERS.GEMINI ? 'Gemini' : 'OpenAI';
        setApiKeyMessage(`✓ Your ${providerName} credentials are valid and saved!`, true);
    } catch (err) {
        setApiKeyMessage(`Error saving credentials: ${err.message}`, false);
    }
}

async function forgetOpenAiCredentials() {
    clearApiKeyMessage();
    try {
        await deleteConfigRecord('llmApiCreds');
        await deleteConfigRecord('model');

        // Clear OpenAI fields
        const openaiBaseUrlField = document.getElementById('openai-base-url');
        const openaiApiKeyField = document.getElementById('openai-api-key');
        if (openaiBaseUrlField) openaiBaseUrlField.value = '';
        if (openaiApiKeyField) openaiApiKeyField.value = '';

        // Clear Gemini fields
        const geminiApiKeyField = document.getElementById('gemini-api-key');
        if (geminiApiKeyField) geminiApiKeyField.value = '';

        clearModelsDropdown();
        openaiClient = null;
        geminiClient = null;
        currentApiProvider = null;

        setApiKeyMessage('API credentials have been removed.', true);
    } catch (err) {
        setApiKeyMessage(`Error removing credentials: ${err.message}`, false);
    }
}

// =============================================================================
// FILE UPLOAD
// =============================================================================

let fileUploadBarWrapper = null;
let fileUploadBar = null;

function showFileUploadBar() {
    if (!fileUploadBarWrapper) return;
    fileUploadBarWrapper.classList.remove('hidden');
}

function hideFileUploadBar() {
    if (!fileUploadBarWrapper) return;
    fileUploadBarWrapper.classList.add('hidden');
    if (fileUploadBar) {
        fileUploadBar.style.width = '0%';
    }
}

function updateFileUploadBar(percent) {
    if (!fileUploadBar) return;
    fileUploadBar.style.width = `${percent}%`;
}

async function fetchAndStoreExampleFiles(urls) {
    await clearUploadedFiles();

    showFileUploadBar();
    let completed = 0;
    const total = urls.length;

    for (const url of urls) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                console.error(`Failed to fetch example file: ${url}, status=${resp.status}`);
                completed++;
                updateFileUploadBar((completed / total) * 100);
                continue;
            }
            const text = await resp.text();
            const parts = url.split('/');
            const filename = parts[parts.length - 1] || 'untitled.txt';
            await putUploadedFile({
                id: `${Date.now()}-${Math.random()}`,
                name: filename,
                content: text,
                extractions: []
            });
            completed++;
            updateFileUploadBar((completed / total) * 100);
        } catch (err) {
            console.error('Error fetching example file:', err);
            completed++;
            updateFileUploadBar((completed / total) * 100);
        }
    }

    hideFileUploadBar();
    const allFiles = await getAllUploadedFiles();
    displayFileList(allFiles);
}

function initFileUploadEventBindings(dropArea) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('bg-green-50');
        });
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('bg-green-50');
        });
    });
    dropArea.addEventListener('drop', async (e) => {
        if (!e.dataTransfer?.files?.length) return;
        await handleFiles(e.dataTransfer.files);
    });

    const fileInput = dropArea.querySelector('#file-upload');
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files?.length) return;
            await handleFiles(fileInput.files);
            fileInput.value = '';
        });
    }

    const exampleLink = dropArea.querySelector('#upload-example-reports-link');
    if (exampleLink) {
        exampleLink.addEventListener('click', async () => {
            await fetchAndStoreExampleFiles(EXAMPLE_REPORT_URLS);
        });
    }
}

function restoreDefaultDropAreaUI(dropArea) {
    const parent = dropArea.parentNode;

    const newDropArea = document.createElement('div');
    newDropArea.id = dropArea.id;
    newDropArea.className = dropArea.className;

    parent.replaceChild(newDropArea, dropArea);

    newDropArea.innerHTML = `
      <div class="text-center">
        <div id="file-upload-icon">
          <svg class="mx-auto h-10 w-10 sm:h-14 sm:w-14 text-gray-300"
               viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" clip-rule="evenodd"
                  d="M11.956 6h.05a2.99 2.99 0 0 1 2.117.879
                     3.003 3.003 0 0 1 0 4.242
                     2.99 2.99 0 0 1-2.117.879h-1.995v-1h1.995
                     a2.002 2.002 0 0 0 0-4h-.914l-.123-.857
                     a2.49 2.49 0 0 0-2.126-2.122
                     A2.478 2.478 0 0 0 6.23 5.5l-.333.762
                     -.809-.189A2.49 2.49 0 0 0 4.523 6
                     c-.662 0-1.297.263-1.764.732
                     A2.503 2.503 0 0 0 4.523 11h2.494v1H4.523
                     a3.486 3.486 0 0 1-2.628-1.16
                     3.502 3.502 0 0 1-.4-4.137
                     A3.497 3.497 0 0 1 3.853 5.06
                     c.486-.09.987-.077 1.468.041
                     a3.486 3.486 0 0 1 3.657-2.06
                     A3.479 3.479 0 0 1 11.956 6zm-1.663 3.853
                     L8.979 8.54v5.436h-.994v-5.4
                     L6.707 9.854 6 9.146 8.146 7h.708
                     L11 9.146l-.707.707z"/>
          </svg>
        </div>
        <div id="progress-ring" class="hidden">
          <div class="relative inline-flex items-center justify-center">
            <svg class="progress-ring" width="84" height="84">
              <circle class="progress-ring__circle" stroke="green" stroke-width="6"
                      fill="transparent" r="36" cx="42" cy="42"/>
            </svg>
            <div class="progress-ring-text absolute text-sm sm:text-md text-green-600 font-semibold">
              <span></span>
            </div>
          </div>
        </div>
        <div class="mt-3 sm:mt-4 flex flex-col sm:flex-row items-center justify-center text-sm leading-6 text-gray-600">
          <label for="file-upload" class="relative cursor-pointer rounded-md bg-white font-semibold text-green-600
                 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-600
                 focus-within:ring-offset-2 hover:text-green-500">
            <span>Upload text reports</span>
            <input id="file-upload" name="file-upload" class="sr-only" type="file" multiple accept=".txt">
          </label>
          <p class="mt-1 sm:mt-0 sm:pl-1">-or- Drag and drop files here</p>
          <p class="mt-2 sm:mt-0 sm:pl-1">
            -or-
            <a id="upload-example-reports-link" href="javascript:void(0);"
               class="underline text-blue-600 hover:text-blue-800">
               Click here to upload example pathology reports
            </a>
          </p>
        </div>
        <p class="text-xs leading-5 text-gray-600 mt-2">TXT files only</p>
      </div>
    `;

    initFileUploadEventBindings(newDropArea);
}

function displayFileContent(file) {
    const dropArea = document.getElementById('file-drop-area');
    if (!dropArea) return;

    dropArea.innerHTML = '';
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'p-4 space-y-4';

    const dropAreaHeight = dropArea.offsetHeight || 200;

    contentWrapper.innerHTML = `
    <button id="back-to-list" class="mb-2 inline-flex items-center px-3 py-1
        border border-gray-300 text-sm rounded hover:bg-gray-200 text-gray-600">
      ← Back
    </button>
    <h3 class="text-lg font-semibold">${file.name}</h3>
    <pre class="whitespace-pre-wrap bg-gray-100 rounded p-2 text-gray-800"
         style="max-height:${dropAreaHeight * 4}px; overflow-y:auto;">
${file.content}
    </pre>
  `;
    dropArea.appendChild(contentWrapper);

    const backBtn = document.getElementById('back-to-list');
    if (backBtn) {
        backBtn.addEventListener('click', async () => {
            const allFiles = await getAllUploadedFiles();
            displayFileList(allFiles);
        });
    }
}

function displayFileList(files) {
    const dropArea = document.getElementById('file-drop-area');
    if (!dropArea) return;

    if (!files.length) {
        restoreDefaultDropAreaUI(dropArea);
        return;
    }

    dropArea.innerHTML = '';
    const fileListWrapper = document.createElement('div');
    fileListWrapper.className = 'flex flex-wrap gap-4 justify-center';

    const dropAreaHeight = dropArea.offsetHeight || 200;
    fileListWrapper.style.maxHeight = (dropAreaHeight * 2) + 'px';
    fileListWrapper.style.overflowY = 'auto';

    files.forEach(file => {
        const fileCard = document.createElement('div');
        fileCard.className = 'relative flex flex-col items-center justify-center w-36 h-36 border border-gray-300 rounded cursor-pointer hover:bg-gray-50';

        fileCard.innerHTML = `
      <button class="delete-file-btn absolute top-1 right-1 w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-sm font-bold" title="Remove file">&times;</button>
      <svg width="48" height="48" fill="currentColor" class="text-gray-400 my-2" viewBox="0 0 24 24">
        <path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2h12a2,
          2,0,0,0,2-2V8ZM13,9V3.5L18.5,9Z" />
      </svg>
      <p class="text-sm text-gray-700 break-all px-2 text-center">${file.name}</p>
    `;

        // Delete button handler
        const deleteBtn = fileCard.querySelector('.delete-file-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent file content display
            await deleteUploadedFile(file.id);
            const remainingFiles = await getAllUploadedFiles();
            displayFileList(remainingFiles);
        });

        // Click on card (not delete button) shows file content
        fileCard.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-file-btn')) {
                displayFileContent(file);
            }
        });

        fileListWrapper.appendChild(fileCard);
    });

    dropArea.appendChild(fileListWrapper);
}

async function handleFiles(fileList) {
    await clearUploadedFiles();

    const filesArray = Array.from(fileList);
    const textFiles = filesArray.filter(f => f.type === 'text/plain');
    if (!textFiles.length) return;

    showFileUploadBar();
    let completed = 0;
    const total = textFiles.length;

    for (const file of textFiles) {
        const text = await file.text();
        await putUploadedFile({
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            content: text,
            extractions: []
        });
        completed++;
        updateFileUploadBar((completed / total) * 100);
    }

    hideFileUploadBar();

    const allFiles = await getAllUploadedFiles();
    displayFileList(allFiles);
}

function stopExtraction() {
    extractionTerminated = true;
    if (concurrencyScheduler) {
        concurrencyScheduler.terminate();
    }
}

async function initFileUpload() {
    const fileUploadContainer = document.getElementById('file-upload-container');
    if (fileUploadContainer) {
        fileUploadContainer.insertAdjacentHTML('afterbegin', `
          <div id="file-upload-loading-bar-wrapper" class="hidden w-full bg-gray-200 h-1 mb-1 overflow-hidden rounded">
            <div id="file-upload-loading-bar" class="bg-green-500 h-full w-0 transition-all duration-200 ease-in"></div>
          </div>
        `);
        fileUploadBarWrapper = document.getElementById('file-upload-loading-bar-wrapper');
        fileUploadBar = document.getElementById('file-upload-loading-bar');
    }

    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (isExtractionInProgress()) {
                stopExtraction();
                updateClearButtonState('Stopping...', true);
                return;
            }

            if (clearBtn.textContent === 'Erase extracted data') {
                const confirmed = await showEraseDataConfirmationModal();
                if (!confirmed) return;

                clearDisplayedExtractedData();
                clearDisplayedJsonLdDoc();
                const files = await getAllUploadedFiles();
                for (const file of files) {
                    file.extractions = [];
                    await putUploadedFile(file);
                }

                updateClearButtonState('Clear', false);
                return;
            }

            await clearUploadedFiles();
            displayFileList([]);
        });
    }

    const filesInDb = await getAllUploadedFiles();
    displayFileList(filesInDb);
}

// =============================================================================
// INFORMATION EXTRACTION
// =============================================================================

async function getMissingInfo() {
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

    // Remote API credentials
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

async function handleAuthError() {
    await deleteConfigRecord('llmApiCreds');
    await deleteConfigRecord('model');

    const openaiBaseUrlField = document.getElementById('openai-base-url');
    const openaiApiKeyField = document.getElementById('openai-api-key');
    if (openaiBaseUrlField) openaiBaseUrlField.value = '';
    if (openaiApiKeyField) openaiApiKeyField.value = '';

    const geminiApiKeyField = document.getElementById('gemini-api-key');
    if (geminiApiKeyField) geminiApiKeyField.value = '';

    clearModelsDropdown();
    openaiClient = null;
    geminiClient = null;
    currentApiProvider = null;
    setApiKeyMessage('Your API key is invalid. Please re-enter a valid key.', false);
    document.getElementById('tab-openai')?.scrollIntoView({ behavior: 'smooth' });
}

async function callOpenAiForExtraction(task) {
    const { report, schema, model, systemPrompt } = task;

    const developerPrompt = buildDeveloperPrompt(systemPrompt, report.content);
    const userQuery = buildUserQuery(schema);

    const regex = /```json\s*([\s\S]*?)\s*```/;
    let attempt = 0;

    while (attempt < 3 && !extractionTerminated) {
        try {
            const response = await openaiClient.chat.completions.create({
                model: model,
                messages: [
                    { role: 'developer', content: developerPrompt },
                    { role: 'user', content: userQuery }
                ],
                temperature: 0.0,
                seed: 1234 + attempt
            });

            const message = response.choices?.[0]?.message?.content || '';
            const match = message.match(regex);
            if (match) {
                try {
                    return JSON.parse(match[1]);
                } catch (err) {
                    console.warn(`Attempt ${attempt + 1}: failed to parse JSON from LLM output.`, err);
                }
            }
        } catch (err) {
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                const authError = new Error('Authentication error');
                authError.isAuthError = true;
                throw authError;
            }
            throw err;
        }
        attempt++;
    }

    return {};
}

async function callGeminiForExtraction(task) {
    const { report, schema, model, systemPrompt } = task;

    const developerPrompt = buildDeveloperPrompt(systemPrompt, report.content);
    const userQuery = buildUserQuery(schema);

    const regex = /```json\s*([\s\S]*?)\s*```/;
    let attempt = 0;

    while (attempt < 3 && !extractionTerminated) {
        try {
            const response = await geminiClient.models.generateContent({
                model: model,
                contents: developerPrompt + '\n\n' + userQuery,
                config: {
                    temperature: 0.0
                }
            });

            const message = response.text || '';
            const match = message.match(regex);

            if (match) {
                try {
                    return JSON.parse(match[1]);
                } catch (err) {
                    console.warn(`Attempt ${attempt + 1}: failed to parse JSON from Gemini output.`, err);
                }
            }
        } catch (err) {
            if (err.status === 401 || err.status === 403) {
                const authError = new Error('Authentication error');
                authError.isAuthError = true;
                throw authError;
            }
            if (err.status === 429) {
                throw err;
            }
            console.error(`Attempt ${attempt + 1}: Gemini extraction error:`, err);
        }
        attempt++;
    }

    return {};
}

async function executeExtractionTask(task) {
    if (currentApiProvider === API_PROVIDERS.GEMINI) {
        return await callGeminiForExtraction(task);
    } else {
        return await callOpenAiForExtraction(task);
    }
}

async function displayExtractedResults(appConfig, startedAtTime, creds = null, modelRec = null) {
    const allReports = await getAllUploadedFiles();
    const combinedData = combineExtractedData(allReports);
    displayExtractedData(combinedData);

    if (appConfig?.jsonldContextFiles) {
        if (!creds) creds = await getConfigRecord('llmApiCreds');
        if (!modelRec) modelRec = await getConfigRecord('model');

        if (creds && modelRec) {
            const endedAtTime = new Date().toISOString();
            const provenance = {
                startedAtTime,
                endedAtTime,
                applicationURL: window.location.href,
                chatCompletionsEndpoint: creds.baseUrl + '/chat/completions',
                modelName: modelRec.name
            };

            const jsonLdDoc = prepareJsonLdDoc(
                appConfig.schemaFileUrls || [],
                appConfig.jsonldContextFiles,
                combinedData,
                provenance
            );
            await displayJsonLdDoc(jsonLdDoc);
        }
    }
}

async function handleSubmitExtraction() {
    const missing = await getMissingInfo();
    if (missing.length > 0) {
        await showMissingInfoModal(missing);
        scrollToFirstMissingField(missing[0]);
        return;
    }

    let appConfig = await getConfigRecord('appConfig');
    let creds = await getConfigRecord('llmApiCreds');
    let modelRec = await getConfigRecord('model');
    let reports = await getAllUploadedFiles();

    if (!appConfig || !creds || !modelRec) {
        console.error('Missing configuration or credentials; aborting.');
        return;
    }

    // Check if there are existing extractions with a different model
    const lastExtractionRec = await getConfigRecord('lastExtractionModel');
    const hasExistingExtractions = reports.some(r => r.extractions && r.extractions.length > 0 &&
        r.extractions.some(e => e.data && Object.keys(e.data).length > 0));

    if (hasExistingExtractions && lastExtractionRec && lastExtractionRec.name !== modelRec.name) {
        const shouldProceed = await showModelChangeConfirmationModal(lastExtractionRec.name, modelRec.name);
        if (!shouldProceed) {
            return; // User cancelled, keep old results
        }
        // User confirmed - clear all extractions from reports
        for (const report of reports) {
            report.extractions = [];
            await putUploadedFile(report);
        }
        reports = await getAllUploadedFiles(); // Refresh reports
        clearDisplayedExtractedData();
        clearDisplayedJsonLdDoc();
    }

    clearDisplayedExtractedData();
    clearDisplayedJsonLdDoc();
    disableSubmitButton(true);
    updateClearButtonState('Stop');
    extractionTerminated = false;
    showExtractionProgressContainer(true);

    const startedAtTime = new Date().toISOString();

    try {
        const totalReports = reports.length;
        const schemasPerReport = appConfig.schemaFiles.length;

        const tasks = await buildExtractionTasks(
            reports,
            appConfig.schemaFiles,
            appConfig.systemPrompt,
            modelRec.name
        );
        const totalTasks = tasks.length;

        if (totalTasks === 0) {
            console.log('All schemas for all reports are already extracted. Displaying results...');
            await displayExtractedResults(appConfig, startedAtTime);
            return;
        }

        concurrencyScheduler = new DynamicConcurrentScheduler({
            initialConcurrency: 1,
            maxConcurrency: 50,
            apiCallFn: executeExtractionTask
        });

        const { reportTaskCountMap, completedReports: initialCompletedReports, completedTasks: initialCompletedTasks } =
            countExtractionProgress(reports, schemasPerReport);

        let completedTasks = initialCompletedTasks;
        let completedReports = initialCompletedReports;

        updateExtractionProgress(
            completedTasks,
            totalTasks + completedTasks,
            completedReports,
            totalReports
        );

        const onTaskDone = async (task, result, error) => {
            completedTasks++;

            if (error && error.isAuthError) {
                await handleAuthError();
                concurrencyScheduler.terminate();
                return;
            }

            const { report, schemaId } = task;
            updateReportWithExtraction(report, schemaId, result, error);
            await putUploadedFile(report);

            const prevCount = reportTaskCountMap.get(report.id) || 0;
            const newCount = prevCount + 1;
            reportTaskCountMap.set(report.id, newCount);
            if (newCount === schemasPerReport) {
                completedReports++;
            }

            updateExtractionProgress(
                completedTasks,
                completedTasks + (totalTasks - completedTasks),
                completedReports,
                totalReports
            );
        };

        const onBatchComplete = () => {};

        await concurrencyScheduler.run(tasks, onTaskDone, onBatchComplete);

    } finally {
        await displayExtractedResults(appConfig, startedAtTime, creds, modelRec);

        // Save the model used for this extraction
        await saveConfigRecord({ id: 'lastExtractionModel', name: modelRec.name });

        if (concurrencyScheduler?.rateLimiter?.shouldTerminateEarly) {
            showRateLimitEarlyTerminationMessage();
        }

        disableSubmitButton(false);
        updateClearButtonState('Erase extracted data');
        extractionTerminated = false;
        showExtractionProgressContainer(false);
    }
}

// =============================================================================
// MAIN APPLICATION INITIALIZATION
// =============================================================================

async function cleanupWebLLMRecords() {
    try {
        await deleteConfigRecord('webllmModel');
        await deleteConfigRecord('llmMode');
    } catch (err) {
        console.warn('Error cleaning up WebLLM records:', err);
    }
}

async function init() {
    ui('app');

    // Initialize provider tabs
    initProviderTabs();

    // Clean up deprecated WebLLM records
    await cleanupWebLLMRecords();

    // Initialize API credentials
    await initOpenAiCredentials();

    // Model dropdown selection
    const llmModelSelect = document.getElementById('llm-model');
    if (llmModelSelect) {
        llmModelSelect.addEventListener('change', handleModelSelectionChange);
    }

    // Configuration URL input
    const urlParams = new URLSearchParams(window.location.search);
    let paramUrl = urlParams.get('configUrl');
    const configInputEl = document.getElementById('config-url');

    if (configInputEl) {
        if (paramUrl) {
            configInputEl.value = paramUrl;
            await loadConfig(paramUrl);
        } else if (configInputEl.value) {
            paramUrl = configInputEl.value;
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('configUrl', paramUrl);
            window.history.replaceState({}, '', newUrl.toString());
            await loadConfig(paramUrl);
        }

        configInputEl.addEventListener('change', async () => {
            const newConfigUrl = configInputEl.value;
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.set('configUrl', newConfigUrl);
            window.history.replaceState({}, '', currentUrl.toString());
            await loadConfig(newConfigUrl);
        });
    }

    // OpenAI API credentials form
    const submitApiKeyBtn = document.getElementById('submit-api-key');
    const forgetApiKeyBtn = document.getElementById('forget-api-key');
    if (submitApiKeyBtn) {
        submitApiKeyBtn.addEventListener('click', submitOpenAiCredentials);
    }
    if (forgetApiKeyBtn) {
        forgetApiKeyBtn.addEventListener('click', forgetOpenAiCredentials);
    }

    // File upload
    await initFileUpload();

    // Information extraction
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', handleSubmitExtraction);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await init();
});
