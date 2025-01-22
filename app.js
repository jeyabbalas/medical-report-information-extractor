import {ui} from './src/gui.js';
import {validateJsonSchema} from './src/jsonSchemaUtils.js';
import {validateJsonLd, buildPlainTable, buildLinkedTable} from './src/jsonLdUtils.js';
import {
    saveConfigRecord,
    getConfigRecord,
    deleteConfigRecord,
    putUploadedFile,
    getAllUploadedFiles,
    clearUploadedFiles
} from './src/db.js';

import {OpenAI} from 'https://cdn.skypack.dev/openai@4.78.1?min';


let openaiClient = null;
const exampleReportUrls = [
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/01.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/02.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/03.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/04.txt",
    "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/sample_reports/05.txt"
]

/*
 * -------------------------------------------------------------
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
        if (jsonldContextFiles === undefined) {
            setConfigErrorMessage(`config.json is missing "jsonldContextFiles" property.`);
            return;
        }
        if (typeof systemPrompt !== 'string') {
            setConfigErrorMessage(`"systemPrompt" must be a string containing a URL.`);
            return;
        }

        const schemaFileUrls = Array.isArray(schemaFiles) ? schemaFiles : [schemaFiles];
        const jsonldFileUrls = Array.isArray(jsonldContextFiles) ? jsonldContextFiles : [jsonldContextFiles];
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
            container.querySelector('.relative').classList.remove('bg-red-50', 'text-red-800', 'border-red-300');
            container.querySelector('.relative').classList.add('bg-green-50', 'text-green-800', 'border-green-300');
        }
    } finally {
        hideConfigLoadingBar();
    }
}

/*
 * -------------------------------------------------------------
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
        await storeSelectedModelInIdb(newModel);
        console.log('Model selection updated:', newModel);
    } catch (err) {
        console.error('Error storing model selection:', err);
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

/*
 * -------------------------------------------------------------
 * FILE UPLOAD
 * -------------------------------------------------------------
 */

async function fetchAndStoreExampleFiles(urls) {
    for (const url of urls) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                console.error(`Failed to fetch example file: ${url}, status=${resp.status}`);
                continue;
            }
            const text = await resp.text();
            const parts = url.split('/');
            const filename = parts[parts.length - 1] || 'untitled.txt';
            await putUploadedFile({
                id: `${Date.now()}-${Math.random()}`,
                name: filename,
                content: text
            });
        } catch (err) {
            console.error('Error fetching example file:', err);
        }
    }
    const allFiles = await getAllUploadedFiles();
    displayFileList(allFiles);
}


function initFileUploadEventBindings(dropArea) {
    // Re-bind drag-drop events
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

    // Re-bind file input
    const fileInput = dropArea.querySelector('#file-upload');
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files?.length) return;
            await handleFiles(fileInput.files);
            fileInput.value = '';
        });
    }

    // Re-bind example link
    const exampleLink = dropArea.querySelector('#upload-example-reports-link');
    if (exampleLink) {
        exampleLink.addEventListener('click', async () => {
            await fetchAndStoreExampleFiles(exampleReportUrls);
        });
    }
}


function restoreDefaultDropAreaUI(dropArea) {
    dropArea.innerHTML = `
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
        <p class="mt-1 sm:mt-0 sm:pl-1">-or- drag and drop files here</p>
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

    initFileUploadEventBindings(dropArea);
}


function displayFileContent(file) {
    const dropArea = document.getElementById('file-drop-area');
    if (!dropArea) return;

    dropArea.innerHTML = '';
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'p-4 space-y-4';
    contentWrapper.innerHTML = `
    <button id="back-to-list" class="mb-2 inline-flex items-center px-3 py-1 
        border border-gray-300 text-sm rounded hover:bg-gray-200 text-gray-600">
      ← Back
    </button>
    <h3 class="text-lg font-semibold">${file.name}</h3>
    <pre class="whitespace-pre-wrap bg-gray-100 rounded p-2 text-gray-800">
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
    const filesArray = Array.from(fileList);
    const textFiles = filesArray.filter(f => f.type === 'text/plain');
    if (!textFiles.length) return;

    for (const file of textFiles) {
        const text = await file.text();
        await putUploadedFile({
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            content: text
        });
    }

    const allFiles = await getAllUploadedFiles();
    displayFileList(allFiles);
}


async function initFileUpload() {
    // Drag-and-drop file upload
    const dropArea = document.getElementById('file-drop-area');
    if (dropArea) {
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
    }

    // Manual file upload
    const fileInput = document.getElementById('file-upload');
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files?.length) return;
            await handleFiles(fileInput.files);
            fileInput.value = '';
        });
    }

    // Example files upload
    const exampleLink = document.getElementById('upload-example-reports-link');
    if (exampleLink) {
        exampleLink.addEventListener('click', async () => {
            await fetchAndStoreExampleFiles(exampleReportUrls);
        });
    }

    // Clear uploaded files
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            await clearUploadedFiles();
            displayFileList([]);
        });
    }

    // Load existing files from IDB
    const filesInDb = await getAllUploadedFiles();
    displayFileList(filesInDb);
}


/*
 * -------------------------------------------------------------
 * MAIN APPLICATION LOGIC
 * -------------------------------------------------------------
 */
async function init() {
    ui('app');

    await initOpenAiCredentials();

    // Model dropdown change listener
    const llmModelSelect = document.getElementById('llm-model');
    if (llmModelSelect) {
        llmModelSelect.addEventListener('change', handleModelSelectionChange);
    }

    // Handle configuration URL input
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

    // Handle OpenAI API credentials form
    const submitApiKeyBtn = document.getElementById('submit-api-key');
    const forgetApiKeyBtn = document.getElementById('forget-api-key');

    if (submitApiKeyBtn) {
        submitApiKeyBtn.addEventListener('click', submitOpenAiCredentials);
    }
    if (forgetApiKeyBtn) {
        forgetApiKeyBtn.addEventListener('click', forgetOpenAiCredentials);
    }

    // Handle file upload
    await initFileUpload();
}


document.addEventListener('DOMContentLoaded', async () => {
  await init();
});