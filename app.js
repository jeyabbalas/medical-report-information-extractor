import {ui} from './src/gui.js';
import {validateJsonSchema} from './src/jsonSchemaUtils.js';
import {
    validateJsonLd,
    buildPlainTable,
    generateJsonLdDocForFileName,
    generateJsonLdDocForProvenance,
    buildTabularJsonLdDoc,
    buildLinkedTable
} from './src/jsonLdUtils.js';
import {
    saveConfigRecord,
    getConfigRecord,
    deleteConfigRecord,
    putUploadedFile,
    getAllUploadedFiles,
    clearUploadedFiles
} from './src/db.js';
import {DynamicConcurrentScheduler} from './src/apiCallManager.js';

import {OpenAI} from 'https://cdn.skypack.dev/openai@4.78.1?min';
import * as webllm from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';


let openaiClient = null;
let webllmEngine = null;
let currentLLMMode = 'remote';
let isWebLLMLoading = false;
const WEBLLM_VERSION = '0.2.79';
let extractionTerminated = false;
let concurrencyScheduler = null;

const exampleReportUrls = [
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/01.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/02.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/03.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/04.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/05.txt"
];


/* -------------------------------------------------------------
 * CONFIGURATION FILE LOADING
 * -------------------------------------------------------------
 */

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
        const {systemPrompt, schemaFiles, jsonldContextFiles} = configJson;
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

/* -------------------------------------------------------------
 * OPENAI API CREDENTIAL VALIDATION & MODEL SELECTION
 * -------------------------------------------------------------
 */

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


async function createGlobalOpenAiClient(baseUrl, apiKey) {
    openaiClient = new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
    });
    await populateModelsDropdown();
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
        if (currentLLMMode === 'in-browser') {
            // Load the WebLLM model
            await loadWebLLMModel(newModel);
        } else {
            // Save OpenAI model selection
            await storeSelectedModelInIdb(newModel);
        }
    } catch (err) {
        console.error('Error handling model selection:', err);
    }
}


async function initOpenAiCredentials() {
    try {
        const storedCreds = await getConfigRecord('llmApiCreds');
        if (!storedCreds) return;

        // Populate fields
        const baseUrlField = document.getElementById('llm-base-url');
        const apiKeyField = document.getElementById('llm-api-key');

        if (baseUrlField && apiKeyField) {
            baseUrlField.value = storedCreds.baseUrl ?? '';
            apiKeyField.value = storedCreds.apiKey ?? '';

            const isValid = await validateOpenAiApiKey(storedCreds.baseUrl, storedCreds.apiKey);
            if (isValid) {
                await createGlobalOpenAiClient(storedCreds.baseUrl, storedCreds.apiKey);
                setApiKeyMessage('✓ OpenAI API key is valid.', true);
            } else {
                setApiKeyMessage('OpenAI API key appears to be invalid.', false);
                await deleteConfigRecord('llmApiCreds');
                await deleteConfigRecord('model');
                clearModelsDropdown();
            }
        }
    } catch (err) {
        console.error('Error retrieving OpenAI credentials from IDB:', err);
    }
}


async function submitOpenAiCredentials() {
    clearApiKeyMessage();

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

    const isValid = await validateOpenAiApiKey(baseUrl, apiKey);
    if (!isValid) {
        setApiKeyMessage('Invalid API credentials. Please check your base URL and key.', false);
        clearModelsDropdown();
        await deleteConfigRecord('llmApiCreds');
        await deleteConfigRecord('model');
        return;
    }

    try {
        const credsToStore = {
            id: 'llmApiCreds',
            baseUrl,
            apiKey
        };
        await saveConfigRecord(credsToStore);

        await createGlobalOpenAiClient(baseUrl, apiKey);

        setApiKeyMessage('✓ Your OpenAI credentials are valid and have been saved successfully!', true);
    } catch (err) {
        setApiKeyMessage(`Error saving credentials: ${err.message}`, false);
    }
}


async function forgetOpenAiCredentials() {
    clearApiKeyMessage();
    try {
        await deleteConfigRecord('llmApiCreds');
        await deleteConfigRecord('model');

        const baseUrlField = document.getElementById('llm-base-url');
        const apiKeyField = document.getElementById('llm-api-key');
        if (baseUrlField) baseUrlField.value = '';
        if (apiKeyField) apiKeyField.value = '';

        clearModelsDropdown();
        openaiClient = null;

        setApiKeyMessage('OpenAI credentials have been removed.', true);
    } catch (err) {
        setApiKeyMessage(`Error removing credentials: ${err.message}`, false);
    }
}


function clearModelsDropdown() {
    const selectEl = document.getElementById('llm-model');
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="" disabled selected>Set URL/API key above to see models list</option>`;
}


/* -------------------------------------------------------------
 * WEBLLM FUNCTIONS
 * -------------------------------------------------------------
 */

function setWebLLMMessage(message, isSuccess = false) {
    const container = document.getElementById('webllm-message-container');
    if (!container) return;

    container.className = 'relative p-3 text-sm rounded-lg border my-2';

    if (isSuccess) {
        container.classList.add('bg-green-50', 'text-green-800', 'border-green-300');
    } else {
        container.classList.add('bg-red-50', 'text-red-800', 'border-red-300');
    }
    container.textContent = message;
    container.classList.remove('hidden');
}


function clearWebLLMMessage() {
    const container = document.getElementById('webllm-message-container');
    if (!container) return;
    container.textContent = '';
    container.className = 'hidden';
}


function showWebLLMLoadingBar(show) {
    const container = document.getElementById('webllm-loading-container');
    if (!container) return;
    if (show) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        const bar = document.getElementById('webllm-loading-bar');
        if (bar) bar.style.width = '0%';
    }
}


function updateWebLLMLoadingBar(percent, status = '') {
    const bar = document.getElementById('webllm-loading-bar');
    const statusEl = document.getElementById('webllm-loading-status');
    if (bar) {
        bar.style.width = `${percent}%`;
    }
    if (statusEl && status) {
        statusEl.textContent = status;
    }
}


async function setLLMMode(mode) {
    currentLLMMode = mode;

    const baseUrlField = document.getElementById('llm-base-url');
    const apiKeyField = document.getElementById('llm-api-key');
    const privacyMessage = document.getElementById('privacy-message');
    const remoteApiDesc = document.getElementById('remote-api-description');
    const apiCredSection = document.getElementById('api-credentials-section');
    const submitButtons = document.getElementById('submit-api-key-buttons');

    if (mode === 'in-browser') {
        // Disable remote API fields
        if (baseUrlField) baseUrlField.disabled = true;
        if (apiKeyField) apiKeyField.disabled = true;
        if (apiCredSection) apiCredSection.style.opacity = '0.5';
        if (submitButtons) submitButtons.style.display = 'none';

        // Show privacy message
        if (privacyMessage) privacyMessage.classList.remove('hidden');
        if (remoteApiDesc) remoteApiDesc.classList.add('hidden');

        // Clear API key message
        clearApiKeyMessage();

        // Populate WebLLM models
        await populateWebLLMModelsDropdown();

        // Load saved WebLLM model if exists, otherwise load default
        const savedWebLLMModel = await getConfigRecord('webllmModel');
        const defaultModel = 'Llama-3.2-1B-Instruct-q0f16-MLC';

        if (savedWebLLMModel && savedWebLLMModel.name) {
            // Load the saved model
            await loadWebLLMModel(savedWebLLMModel.name);
        } else {
            // No saved model, load the default
            const selectEl = document.getElementById('llm-model');
            if (selectEl) {
                // Check if default model exists in the dropdown
                const modelExists = Array.from(selectEl.options).some(opt => opt.value === defaultModel);
                if (modelExists) {
                    selectEl.value = defaultModel;
                    await loadWebLLMModel(defaultModel);
                } else if (selectEl.options.length > 0) {
                    // Default not found, load first available model
                    const firstModel = selectEl.options[0].value;
                    selectEl.value = firstModel;
                    await loadWebLLMModel(firstModel);
                }
            }
        }
    } else {
        // Enable remote API fields
        if (baseUrlField) baseUrlField.disabled = false;
        if (apiKeyField) apiKeyField.disabled = false;
        if (apiCredSection) apiCredSection.style.opacity = '1';
        if (submitButtons) submitButtons.style.display = 'block';

        // Hide privacy message
        if (privacyMessage) privacyMessage.classList.add('hidden');
        if (remoteApiDesc) remoteApiDesc.classList.remove('hidden');

        // Clear WebLLM message
        clearWebLLMMessage();

        // Re-populate OpenAI models if credentials exist
        if (openaiClient) {
            await populateModelsDropdown();
        } else {
            clearModelsDropdown();
        }
    }

    // Save mode to IndexedDB
    await saveConfigRecord({
        id: 'llmMode',
        mode: mode
    });
}


async function loadWebLLMModel(modelId) {
    if (isWebLLMLoading) return;

    isWebLLMLoading = true;
    clearWebLLMMessage();
    showWebLLMLoadingBar(true);

    try {
        const initProgressCallback = (initProgress) => {
            const percent = Math.round(initProgress.progress * 100);
            let status = initProgress.text || '';

            // Make status more user-friendly
            if (status.includes('Loading model')) {
                status = 'Loading model files...';
            } else if (status.includes('Downloading')) {
                status = 'Downloading model (this may take a few minutes on first load)...';
            } else if (status.includes('Initializing')) {
                status = 'Initializing model...';
            }

            updateWebLLMLoadingBar(percent, status);
        };

        // Create or reload engine
        webllmEngine = await webllm.CreateMLCEngine(
            modelId,
            {
                initProgressCallback: initProgressCallback,
                logLevel: 'INFO'
            }
        );

        // Save successful model load
        await saveConfigRecord({
            id: 'webllmModel',
            name: modelId,
            loaded: true
        });

        showWebLLMLoadingBar(false);
        setWebLLMMessage('✓ Model loaded successfully and ready for use!', true);

    } catch (error) {
        console.error('Error loading WebLLM model:', error);
        showWebLLMLoadingBar(false);
        setWebLLMMessage(`Failed to load model: ${error.message}`, false);
        webllmEngine = null;
    } finally {
        isWebLLMLoading = false;
    }
}


async function populateWebLLMModelsDropdown() {
    const selectEl = document.getElementById('llm-model');
    if (!selectEl) return;

    selectEl.innerHTML = '';

    try {
        // Get available models from WebLLM
        const models = await webllm.prebuiltAppConfig.model_list;

        // Filter for instruction models and smaller sizes
        const instructModels = models.filter(m =>
            m.model_id.includes('Instruct') ||
            m.model_id.includes('instruct') ||
            m.model_id.includes('chat')
        );

        if (!instructModels.length) {
            selectEl.innerHTML = `<option disabled selected>No models available</option>`;
            return;
        }

        // Group by model family for better organization
        const storedModel = await getConfigRecord('webllmModel');

        for (const model of instructModels) {
            const opt = document.createElement('option');
            opt.value = model.model_id;
            opt.textContent = model.model_id;
            selectEl.appendChild(opt);
        }

        // Set default or saved model
        let modelToSelect = 'Llama-3.2-1B-Instruct-q0f16-MLC';
        if (storedModel && storedModel.name) {
            modelToSelect = storedModel.name;
        }

        // Check if model exists in list
        const modelExists = Array.from(selectEl.options).some(opt => opt.value === modelToSelect);
        if (modelExists) {
            selectEl.value = modelToSelect;
        } else if (instructModels.length > 0) {
            selectEl.value = instructModels[0].model_id;
        }

    } catch (error) {
        console.error('Error populating WebLLM models:', error);
        selectEl.innerHTML = `<option disabled selected>Could not load models</option>`;
    }
}


async function performWebLLMExtraction(systemPrompt, userQuery, model) {
    if (!webllmEngine) {
        throw new Error('WebLLM engine not initialized');
    }

    const regex = /```json\s*([\s\S]*?)\s*```/;
    let attempt = 0;

    while (attempt < 3 && !extractionTerminated) {
        try {
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userQuery }
            ];

            const response = await webllmEngine.chat.completions.create({
                messages: messages,
                temperature: 0.0,
                max_tokens: 2048,
                seed: 1234 + attempt  // Increment seed for each attempt
            });

            const message = response.choices?.[0]?.message?.content || '';
            const match = message.match(regex);

            if (match) {
                try {
                    const parsed = JSON.parse(match[1]);
                    return parsed;  // Success! Return the parsed JSON
                } catch (err) {
                    console.warn(`Attempt ${attempt + 1}: Failed to parse JSON from WebLLM output:`, err);
                    // Continue to next attempt
                }
            } else {
                console.warn(`Attempt ${attempt + 1}: No JSON found in WebLLM response`);
            }

        } catch (error) {
            console.error(`Attempt ${attempt + 1}: WebLLM extraction error:`, error);
            // If it's the last attempt, throw the error
            if (attempt === 2) {
                throw error;
            }
        }

        attempt++;
    }

    // If we've exhausted all attempts, return empty object
    console.warn('All attempts failed to extract valid JSON from WebLLM');
    return {};
}


async function runWebLLMExtraction(reports, schemas, systemPrompt, model) {
    let completedTasks = 0;
    const totalTasks = reports.length * schemas.length;

    for (let i = 0; i < reports.length; i++) {
        const report = reports[i];

        for (let j = 0; j < schemas.length; j++) {
            const schema = schemas[j];

            if (extractionTerminated) return;

            // Check if already extracted
            let hasExtraction = false;
            if (report.extractions && Array.isArray(report.extractions)) {
                const existing = report.extractions.find(e => e.schemaId === j);
                if (existing && existing.data && Object.keys(existing.data).length > 0) {
                    hasExtraction = true;
                }
            }

            if (!hasExtraction) {
                try {
                    const developerPrompt = buildDeveloperPrompt(systemPrompt, report.content);
                    const userQuery = buildUserQuery(schema);

                    const result = await performWebLLMExtraction(
                        developerPrompt,
                        userQuery,
                        model
                    );

                    // Save result
                    if (!report.extractions) report.extractions = [];

                    let existing = report.extractions.find(e => e.schemaId === j);
                    if (!existing) {
                        existing = { schemaId: j, data: {} };
                        report.extractions.push(existing);
                    }
                    existing.data = result || {};

                    await putUploadedFile(report);

                } catch (error) {
                    console.error(`Error extracting from report ${report.name}:`, error);
                }
            }

            completedTasks++;
            updateExtractionProgress(
                completedTasks,
                totalTasks,
                i + 1,
                reports.length
            );
        }
    }
}


/* -------------------------------------------------------------
 * FILE UPLOAD
 * -------------------------------------------------------------
 */

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
    // Drag-and-drop
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

    // Manual file input
    const fileInput = dropArea.querySelector('#file-upload');
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files?.length) return;
            await handleFiles(fileInput.files);
            fileInput.value = '';
        });
    }

    // Example file upload
    const exampleLink = dropArea.querySelector('#upload-example-reports-link');
    if (exampleLink) {
        exampleLink.addEventListener('click', async () => {
            await fetchAndStoreExampleFiles(exampleReportUrls);
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
        fileCard.className = 'flex flex-col items-center justify-center w-36 h-36 border border-gray-300 rounded cursor-pointer hover:bg-gray-50';

        fileCard.innerHTML = `
      <svg width="48" height="48" fill="currentColor" class="text-gray-400 my-2" viewBox="0 0 24 24">
        <path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2h12a2,
          2,0,0,0,2-2V8ZM13,9V3.5L18.5,9Z" />
      </svg>
      <p class="text-sm text-gray-700 break-all px-2 text-center">${file.name}</p>
    `;

        fileCard.addEventListener('click', () => {
            displayFileContent(file);
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

/* -------------------------------------------------------------
 * INFORMATION EXTRACTION
 * -------------------------------------------------------------
 */


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

    // Check mode-specific requirements
    if (currentLLMMode === 'in-browser') {
        // For in-browser mode, check WebLLM model
        const webllmModel = await getConfigRecord('webllmModel');
        if (!webllmModel || !webllmModel.name) {
            missing.push('WebLLM model selection');
        } else if (!webllmEngine) {
            missing.push('WebLLM model not loaded (please wait for model to finish loading)');
        }
    } else {
        // For remote mode, check API credentials
        const creds = await getConfigRecord('llmApiCreds');
        if (!creds || !creds.baseUrl || !creds.apiKey) {
            missing.push('LLM API base URL and/or API key');
        }

        // Model
        const modelRec = await getConfigRecord('model');
        if (!modelRec || !modelRec.name) {
            missing.push('LLM model selection');
        }
    }

    // Uploaded files
    const files = await getAllUploadedFiles();
    if (!files || !files.length) {
        missing.push('At least one uploaded report');
    }

    return missing;
}


function showMissingInfoModal(missingItems) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-lg p-4 max-w-md w-full';
        modal.innerHTML = `
          <h2 class="text-lg font-semibold mb-2">Information Missing</h2>
          <p class="mb-3">Please provide the following information before data extraction:</p>
          <ul class="list-disc ml-6 mb-4">
            ${missingItems.map(i => `<li>${i}</li>`).join('')}
          </ul>
          <div class="flex justify-end">
            <button id="missing-modal-ok" class="bg-green-800 hover:bg-green-700 text-white px-4 py-2 rounded">
              OK
            </button>
          </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeBtn = modal.querySelector('#missing-modal-ok');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve();
        });
    });
}


function scrollToFirstMissingField(missingItem) {
    if (!missingItem) return;
    switch (true) {
        case /config\.json/i.test(missingItem):
        case /System prompt/i.test(missingItem):
        case /JSON Schema/i.test(missingItem):
            document.getElementById('config-url')?.scrollIntoView({behavior: 'smooth'});
            break;
        case /LLM API base URL/i.test(missingItem):
        case /API key/i.test(missingItem):
            document.getElementById('llm-base-url')?.scrollIntoView({behavior: 'smooth'});
            break;
        case /model selection/i.test(missingItem):
            document.getElementById('llm-model')?.scrollIntoView({behavior: 'smooth'});
            break;
        case /uploaded report/i.test(missingItem):
            document.getElementById('file-drop-area')?.scrollIntoView({behavior: 'smooth'});
            break;
        default:
            window.scrollTo({top: 0, behavior: 'smooth'});
            break;
    }
}


function disableSubmitButton(disable) {
    const submitBtn = document.getElementById('submit-btn');
    if (!submitBtn) return;

    if (disable) {
        submitBtn._originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = `
            <svg aria-hidden="true" role="status" class="inline w-4 h-4 mr-2 text-white animate-spin" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="#E5E7EB"/>
                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor"/>
            </svg>
            Processing...
        `;
        submitBtn.disabled = true;
        submitBtn.classList.add('cursor-not-allowed');
    } else {
        submitBtn.innerHTML = submitBtn._originalHTML || 'Submit';
        submitBtn.disabled = false;
        submitBtn.classList.remove('cursor-not-allowed');
    }
}


function updateClearButtonState(text, disabled = false) {
    const clearBtn = document.getElementById('clear-btn');
    if (!clearBtn) return;

    clearBtn.disabled = disabled;

    clearBtn.classList.remove(
        'bg-white', 'text-gray-700', 'hover:bg-gray-50', 'border-gray-300',
        'bg-red-800', 'text-white', 'hover:bg-red-700'
    );

    if (text === 'Clear') {
        clearBtn.classList.add('bg-white', 'text-gray-700', 'hover:bg-gray-50', 'border-gray-300');
    } else {
        clearBtn.classList.add('bg-red-800', 'text-white', 'hover:bg-red-700');
    }

    clearBtn.textContent = text;
}


function showExtractionProgressContainer(show) {
    const container = document.getElementById('extraction-progress-container');
    if (!container) return;
    if (show) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        // Reset bar
        updateExtractionProgress(0, 1); // set bar to 0
        const ring = document.getElementById('extraction-progress-ring');
        if (ring) ring.classList.add('hidden');
    }
}


function updateExtractionProgress(completedTasks, totalTasks, completedReports, totalReports) {
    const bar = document.getElementById('extraction-progress-bar');
    const label = document.getElementById('extraction-progress-label');

    let pct = 0;
    if (totalTasks > 0) {
        pct = Math.round((completedTasks / totalTasks) * 100);
    }
    if (bar) {
        bar.style.width = pct + '%';
    }

    if (label) {
        label.textContent = `Extracting ${completedReports} of ${totalReports} reports...`;
    }
}


function buildDeveloperPrompt(systemPrompt, report) {
    return `<instructions>\n${systemPrompt}\n</instructions>\n\n<report>\n${report}\n</report>`
}


function buildUserQuery(schema) {
    const keys = Object.keys(schema.properties || {});
    return `<query>\n<json_keys>\n[${keys.join(', ')}]\n</json_keys>\n<json_schema>\n\`\`\`json${JSON.stringify(schema, null, 2)}\`\`\`\n</json_schema>\n</query>`;
}


async function handleAuthError() {
    await deleteConfigRecord('llmApiCreds');
    await deleteConfigRecord('model');
    const baseUrlField = document.getElementById('llm-base-url');
    const apiKeyField = document.getElementById('llm-api-key');
    if (baseUrlField) baseUrlField.value = '';
    if (apiKeyField) apiKeyField.value = '';

    clearModelsDropdown();
    openaiClient = null;
    setApiKeyMessage('Your API key is invalid. Please re-enter a valid key.', false);
    document.getElementById('llm-base-url')?.scrollIntoView({behavior: 'smooth'});
}


async function performLLMExtraction(developerPrompt, userQuery, model) {
    if (!openaiClient) {
        await handleAuthError();
        throw new Error('OpenAI client not initialized');
    }

    const regex = /```json\s*([\s\S]*?)\s*```/;
    let attempt = 0;
    while (attempt < 3 && !extractionTerminated) {
        try {
            await rateLimiter.enforceRateLimit();

            const response = await openaiClient.chat.completions.create({
                model: model,
                messages: [
                    {role: 'developer', content: developerPrompt},
                    {role: 'user', content: userQuery}
                ],
                temperature: 0.0,
                seed: 1234 + attempt
            });

            rateLimiter.resetErrorCount();

            const message = response.choices?.[0]?.message?.content || '';
            const match = message.match(regex);
            if (match) {
                try {
                    return JSON.parse(match[1]);
                } catch (err) {
                    console.warn(`Failed to parse JSON generated by the LLM:`, err);
                }
            }
        } catch (err) {
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                const authError = new Error('Authentication error');
                authError.isAuthError = true;
                await handleAuthError();
                throw authError;
            }

            const backoffTime = rateLimiter.handleError(err);
            console.error(`Error during data extraction. Backing off for ${backoffTime}ms:`, err);
            await rateLimiter.sleep(backoffTime);
        }
        attempt++;
    }

    // fallback if no valid JSON was output after 3 attempts
    return {};
}


function combineExtractedData(reports) {
    return reports.reduce((acc, r) => {
        if (r.extractions && r.extractions.length > 0) {
            const merged = {};
            for (const extraction of r.extractions) {
                const dataObj = extraction.data || {};
                Object.entries(dataObj).forEach(([key, value]) => {
                    merged[key] = value;
                });
            }
            acc.push({
                fileName: r.name,
                ...merged
            });
        }
        return acc;
    }, []);
}


/**
 * Convert JSON data to CSV format
 * @param {Array} data - Array of objects to convert to CSV
 * @returns {string} CSV formatted string
 */
function convertJsonToCsv(data) {
    if (!data || data.length === 0) return '';

    // Get all unique headers from all objects
    const headers = Array.from(new Set(data.flatMap(d => Object.keys(d))));

    // Create CSV header row
    const csvHeader = headers.map(header => `"${header}"`).join(',');

    // Create CSV data rows
    const csvRows = data.map(row => {
        return headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) {
                return '""';
            } else if (Array.isArray(value) || typeof value === 'object') {
                // Escape quotes in JSON strings for CSV
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            } else {
                // Escape quotes in regular strings for CSV
                return `"${String(value).replace(/"/g, '""')}"`;
            }
        }).join(',');
    });

    return [csvHeader, ...csvRows].join('\n');
}


/**
 * Create download buttons for both JSON and CSV formats
 * @param {Array} data - The data to be downloaded
 * @returns {HTMLElement} Container with both download buttons
 */
function createDownloadButtons(data) {
    const btnContainer = document.createElement('div');
    btnContainer.id = 'downloadBtnContainer';
    btnContainer.className = 'flex justify-center gap-2 w-full my-2';

    // JSON Download Button
    const jsonBtn = document.createElement('button');
    jsonBtn.className = 'inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
    jsonBtn.textContent = 'Download JSON';
    jsonBtn.addEventListener('click', (_) => {
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
    csvBtn.addEventListener('click', (_) => {
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


function createDownloadDataButton(buttonLabel, data, isLinkedData = false) {
    const btnContainer = document.createElement('div');
    btnContainer.id = 'downloadBtnContainer';
    btnContainer.className = 'flex justify-center w-full my-2';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2';
    downloadBtn.textContent = buttonLabel;
    downloadBtn.addEventListener('click', (_) => {
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


function clearDisplayedExtractedData() {
    const tableContainer = document.getElementById('info-extraction');
    if (tableContainer) {
        tableContainer.innerHTML = '';
    }
}


function displayExtractedData(data) {
    const tableContainer = document.getElementById('info-extraction');
    if (tableContainer) {
        clearDisplayedExtractedData();
        const headers = Array.from(new Set(data.flatMap(d => Object.keys(d))));
        tableContainer.appendChild(buildPlainTable(data, headers));
        tableContainer.appendChild(createDownloadButtons(data));
    }
}


function prepareJsonLdDoc(schemaFileUrls, jsonLdContextFiles, tabularData, provenance = {}, webllmInfo = null) {
    const jsonLdContextFilesCopy = jsonLdContextFiles.slice();
    jsonLdContextFilesCopy.push(generateJsonLdDocForFileName());
    const provenanceDoc = generateJsonLdDocForProvenance(
        provenance.startedAtTime, provenance.endedAtTime,
        provenance.applicationURL, provenance.chatCompletionsEndpoint,
        provenance.modelName, webllmInfo);
    return buildTabularJsonLdDoc(schemaFileUrls, jsonLdContextFilesCopy, tabularData, provenanceDoc);
}


function clearDisplayedJsonLdDoc() {
    const jsonLdContainer = document.getElementById('standardization');
    if (jsonLdContainer) {
        jsonLdContainer.innerHTML = '';
    }
}


async function displayJsonLdDoc(jsonLdDoc) {
    const jsonLdContainer = document.getElementById('standardization');
    if (jsonLdContainer) {
        clearDisplayedJsonLdDoc();
        await buildLinkedTable(jsonLdContainer, jsonLdDoc);
        jsonLdContainer.appendChild(createDownloadDataButton('Download JSON-LD', jsonLdDoc, true));
    }
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
                    console.warn(`Attempt ${attempt+1}: failed to parse JSON from LLM output.`, err);
                }
            }
        } catch (err) {
            // If the error is 401 or 403, handle auth
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                const authError = new Error('Authentication error');
                authError.isAuthError = true;
                throw authError;
            }
            // Otherwise, throw so concurrency manager can handle backoff
            throw err;
        }
        attempt++;
    }

    // fallback if no valid JSON
    return {};
}


async function buildExtractionTasks(reports, schemaFiles, systemPrompt, model) {
    const tasks = [];
    for (const report of reports) {
        const extractedBySchemaId = new Set();
        if (report.extractions && Array.isArray(report.extractions)) {
            for (const e of report.extractions) {
                const hasSomeKeys = e.data && Object.keys(e.data).length > 0;
                if (hasSomeKeys) {
                    extractedBySchemaId.add(e.schemaId);
                }
            }
        }

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


async function displayExtractedResults(appConfig, startedAtTime, creds = null, modelRec = null) {
    // JSON data
    const allReports = await getAllUploadedFiles();
    const combinedData = combineExtractedData(allReports);
    displayExtractedData(combinedData);

    // JSON-LD
    if (appConfig?.jsonldContextFiles) {
        // If creds/modelRec not passed, try to get them
        if (!creds) creds = await getConfigRecord('llmApiCreds');
        if (!modelRec) {
            if (currentLLMMode === 'in-browser') {
                modelRec = await getConfigRecord('webllmModel');
            } else {
                modelRec = await getConfigRecord('model');
            }
        }

        if (creds && modelRec) {
            const endedAtTime = new Date().toISOString();
            const provenance = {
                startedAtTime,
                endedAtTime,
                applicationURL: window.location.href,
                chatCompletionsEndpoint: currentLLMMode === 'in-browser'
                    ? 'in-browser'
                    : creds.baseUrl + '/chat/completions',
                modelName: modelRec.name
            };

            // Pass WebLLM info if using in-browser mode
            const webllmInfo = currentLLMMode === 'in-browser'
                ? { version: WEBLLM_VERSION }
                : null;

            const jsonLdDoc = prepareJsonLdDoc(
                appConfig.schemaFileUrls || [],
                appConfig.jsonldContextFiles,
                combinedData,
                provenance,
                webllmInfo
            );
            await displayJsonLdDoc(jsonLdDoc);
        }
    }
}


function showRateLimitEarlyTerminationMessage() {
    const container = document.getElementById('info-extraction');
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className =
      'mt-2 p-3 border border-red-300 bg-red-50 text-red-800 rounded text-sm';
    messageDiv.textContent =
      'The run terminated early due to repeated rate limit errors at the chosen API endpoint. ' +
      'Some extractions may be incomplete.';

    container.appendChild(messageDiv);
}


async function handleSubmitExtraction() {
    const missing = await getMissingInfo();
    if (missing.length > 0) {
        await showMissingInfoModal(missing);
        scrollToFirstMissingField(missing[0]);
        return;
    }

    clearDisplayedExtractedData();
    clearDisplayedJsonLdDoc();
    disableSubmitButton(true);
    updateClearButtonState('Stop');
    extractionTerminated = false;
    showExtractionProgressContainer(true);

    let appConfig, creds, modelRec, reports;
    const startedAtTime = new Date().toISOString();

    try {
        appConfig = await getConfigRecord('appConfig');
        reports = await getAllUploadedFiles();

        if (currentLLMMode === 'in-browser') {
            // WebLLM extraction
            if (!webllmEngine) {
                setWebLLMMessage('Please load a model first', false);
                return;
            }

            const webllmModel = await getConfigRecord('webllmModel');
            if (!webllmModel || !webllmModel.name) {
                setWebLLMMessage('No model selected', false);
                return;
            }

            await runWebLLMExtraction(
                reports,
                appConfig.schemaFiles,
                appConfig.systemPrompt,
                webllmModel.name
            );

            // Create pseudo records for provenance
            creds = {
                baseUrl: 'in-browser',
                apiKey: 'N/A'
            };
            modelRec = webllmModel;

        } else {
            // Original remote API logic
            creds = await getConfigRecord('llmApiCreds');
            modelRec = await getConfigRecord('model');
            if (!appConfig || !creds || !modelRec) {
                console.error('Missing configuration or credentials; aborting.');
                return;
            }

            // ... (keep existing remote API extraction logic)
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
                apiCallFn: callOpenAiForExtraction
            });

            // ... (keep rest of existing remote API logic)
            const reportTaskCountMap = new Map();
            let completedTasks = 0;
            let completedReports = 0;

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
                if (extractedCount === schemasPerReport) {
                    completedReports++;
                }
            }

            completedTasks = Array.from(reportTaskCountMap.values())
                .reduce((acc, val) => acc + val, 0);

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

                const {report, schemaId} = task;
                if (!report.extractions) report.extractions = [];

                let existing = report.extractions.find(e => e.schemaId === schemaId);
                if (!existing) {
                    existing = {schemaId, data: {}};
                    report.extractions.push(existing);
                }
                if (!error) {
                    existing.data = result || {};
                }
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
        }

    } finally {
        await displayExtractedResults(appConfig, startedAtTime, creds, modelRec);

        if (concurrencyScheduler?.rateLimiter?.shouldTerminateEarly) {
            showRateLimitEarlyTerminationMessage();
        }

        disableSubmitButton(false);
        updateClearButtonState('Erase extracted data');
        extractionTerminated = false;
        showExtractionProgressContainer(false);
    }
}


function isExtractionInProgress() {
    // if submit button is disabled, extraction must be in progress
    const submitBtn = document.getElementById('submit-btn');
    return submitBtn && submitBtn.disabled;
}


function showEraseDataConfirmationModal() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-lg p-4 max-w-md w-full';
        modal.innerHTML = `
          <h2 class="text-lg font-semibold mb-2">Erase All Extracted Data?</h2>
          <p class="mb-4">This action will permanently remove all extracted information from the database. This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <button id="erase-cancel" class="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded">
              Cancel
            </button>
            <button id="erase-confirm" class="bg-red-800 hover:bg-red-700 text-white px-4 py-2 rounded">
              Erase
            </button>
          </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const cancelBtn = modal.querySelector('#erase-cancel');
        const confirmBtn = modal.querySelector('#erase-confirm');

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(false);
        });
        confirmBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(true);
        });
    });
}


/*
 * -------------------------------------------------------------
 * MAIN APPLICATION LOGIC
 * -------------------------------------------------------------
 */

async function init() {
    ui('app');

    // Initialize LLM mode
    const savedMode = await getConfigRecord('llmMode');
    currentLLMMode = savedMode ? savedMode.mode : 'remote';

    // Set radio buttons
    const modeRadios = document.querySelectorAll('input[name="llm-mode"]');
    modeRadios.forEach(radio => {
        radio.checked = radio.value === currentLLMMode;
        radio.addEventListener('change', (e) => {
            setLLMMode(e.target.value);
        });
    });

    // Initialize based on mode
    if (currentLLMMode === 'in-browser') {
        await setLLMMode('in-browser');
    } else {
        await initOpenAiCredentials();
    }

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