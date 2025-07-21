const marieLogoUrl = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/assets/marie_logo.svg";
const githubLogoUrl = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/assets/github.svg";

function ui(divID) {
    const divUI = divID ? document.getElementById(divID) : document.createElement('div');

    const dataPrivacyNotice = `
<p><span class="font-medium">Data privacy notice</span>: This application uses large language models (LLMs) to process data. It is important to understand how your data will be handled by them.</p>
<ul class="list-disc list-inside">
    <li><span class="font-medium">Data sharing</span>: When you use the app, the data you submit is sent to the LLM that you choose. This could be an LLM hosted by a third-party, like OpenAI, or an LLM that you host yourself.</li>
    <li><span class="font-medium">Data use agreements</span>: Before submitting any data, especially sensitive information, carefully review the data use agreement of the data you will submit and the data privacy policy of the LLM provider. Make sure you understand and consent to how the LLM provider will use your data.</li>
    <li><span class="font-medium">LLM API base URL</span>: You will be asked to provide the base URL of the LLM API you want to use. This helps you control where your data is sent. For example, if you choose OpenAI's API (<span class="font-mono px-1 rounded">https://api.openai.com/v1</span>), your data will be processed by OpenAI servers.</li>
    <li><span class="font-medium">Self-hosting</span>: For increased data privacy, instead of using LLMs from third-party providers (e.g. OpenAI), consider self-hosting an LLM on your own machine and providing the corresponding base URL. This keeps your data under your direct control.</li>
</ul>
`;

    const sourceCodeUrl = "https://github.com/jeyabbalas/medical-report-information-extractor";
    const configFileDefault = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/examples/bcn_generations_pathology_data/minConfig.json";
    const llmBaseUrlDefault = "https://api.openai.com/v1";

    divUI.innerHTML = `
<!-- Header -->
<div id="header" class="mx-auto max-w-7xl px-3 sm:px-6 py-2 sm:pb-4 bg-green-900 rounded-b-lg">
    <div class="flex items-center justify-between">
        <div class="flex items-center justify-start">
            <div class="flex items-center">
                <img src="${marieLogoUrl}" class="h-10 w-10 sm:h-20 sm:w-20 logo vanilla" alt="pie logo" />
            </div>
            <div class="min-w-0 px-2 sm:px-3">
                <h2 class="text-lg font-bold leading-7 text-white sm:text-3xl sm:tracking-tight">Medical Report Information Extractor</h2>
            </div>
        </div>
      
        <div class="flex md:mt-0 md:ml-4 shrink-0">
            <a title="Source code" target="_blank" href="${sourceCodeUrl}">
                <img src="${githubLogoUrl}" class="h-8 w-8 sm:h-14 sm:w-14 fill-current" alt="github logo" />
            </a>
        </div>
    </div>
</div>

<!-- Caution -->
<div id="info" class="mx-auto max-w-7xl px-3 sm:px-6 py-2 sm:py-4 lg:px-8">
    <div id="info-usage" class="flex p-3 sm:p-4 mt-2 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50" role="alert">
        <svg aria-hidden="true" class="flex-shrink-0 inline w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 
            11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 
            001 1h1a1 1 0 100-2v-3a1 1 0 
            00-1-1H9z" clip-rule="evenodd"></path>
        </svg>
        <span class="sr-only">Data privacy notice</span>
        <div>
            ${dataPrivacyNotice}
            <p class="pl-3 sm:pl-4"></p>
        </div>
    </div>
</div>

<!--Config-->
<div id="config-container" class="mx-auto max-w-7xl mt-3 sm:mt-4 px-3 sm:px-6 lg:px-8 border rounded-lg">
    <div class="space-y-3 sm:space-y-5 pt-2 sm:pt-4">
        <div class="col-span-full">
            <h2 class="text-base sm:text-lg font-semibold leading-7 text-gray-900">Application configuration</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Provide the URL to the application configuration JSON file. The JSON file must specify the following properties—</p> <ul class="pl-4"><li class="list-disc text-sm text-gray-600"><span class="font-mono bg-gray-100 px-1 rounded">systemPrompt</span>: URL pointing to the LLM task instruction file.</li> <li class="list-disc text-sm text-gray-600"><span class="font-mono bg-gray-100 px-1 rounded">schemaFiles</span>: URL or array of URLs to JSON Schema files describing the metadata of the information to extract.</li> <li class="list-disc text-sm text-gray-600"><span class="font-mono bg-gray-100 px-1 rounded">jsonldContextFiles</span> (optional): URL or array of URLs to JSON-LD context files (one for each specified schema file) that map schema variables to standardized vocabularies.</li></ul> <p class="mt-1 text-sm leading-6 text-gray-600">See example configuration file for the <a target="_blank" href="${configFileDefault}" class="underline text-green-700 text-sm">BCN Generations Study Pathology Data Dictionary</a>.</p>
            <div class="mt-3 sm:mt-4 -space-y-px rounded-md flex flex-col items-center">
                <div class="relative rounded-md px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <div id="config-loading-bar-wrapper" class="hidden w-full bg-gray-200 h-1 mb-2 overflow-hidden rounded">
                        <div id="config-loading-bar" class="bg-green-500 h-full w-0 transition-all duration-200 ease-in"></div>
                    </div>
                    <label for="config-url" class="block text-xs font-medium text-gray-900">Configuration file URL</label>
                    <input type="url" name="config-url" id="config-url" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 text-sm sm:text-base sm:leading-6" placeholder="https://example.com/config.json" value="${configFileDefault}" required>
                </div>
                <div id="config-error-message-container" class="w-full sm:w-3/4 md:w-2/3 lg:w-1/2 hidden"></div>
            </div>
        </div>

        <hr class="border-gray-300">

        <div class="col-span-full">
            <h2 class="text-base sm:text-lg font-semibold leading-7 text-gray-900">LLM API configuration</h2>
            
            <!-- LLM Mode Toggle -->
            <div class="mt-3 sm:mt-4">
                <label class="text-sm font-medium text-gray-900">LLM Mode</label>
                <div class="mt-2 space-x-4">
                    <label class="inline-flex items-center">
                        <input type="radio" name="llm-mode" value="remote" checked class="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300">
                        <span class="ml-2 text-sm text-gray-700">Remote API</span>
                    </label>
                    <label class="inline-flex items-center">
                        <input type="radio" name="llm-mode" value="in-browser" class="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300">
                        <span class="ml-2 text-sm text-gray-700">In-browser (Privacy-preserving)</span>
                    </label>
                </div>
                <p id="privacy-message" class="hidden mt-2 text-sm text-green-600">
                    <svg class="inline w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                    </svg>
                    Your data stays in your browser. No information is sent to external servers.
                </p>
            </div>

            <p id="remote-api-description" class="mt-1 text-sm leading-6 text-gray-600">Provide the base URL of your LLM API endpoint and the associated API key. The endpoint must be compatible with OpenAI's API structure, requiring the <a target="_blank" class="underline text-green-700 text-sm font-mono" href="https://platform.openai.com/docs/api-reference/models">models</a> and <a target="_blank" class="underline text-green-700 text-sm font-mono" href="https://platform.openai.com/docs/api-reference/chat/create">chat/completions</a> endpoints. For example, to use the OpenAI API, set the base URL to <span class="font-mono px-1 rounded">https://api.openai.com/v1</span> and the API key can be generated at <a target="_blank" class="underline text-green-700 text-sm" href="https://platform.openai.com/api-keys">OpenAI API keys</a>. Optionally, an LLM can be self-hosted via an OpenAI-compatible API using tools like <a target="_blank" class="underline text-green-700 text-sm" href="https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html">vLLM</a>.</p>
            
            <div id="api-credentials-section" class="mt-3 sm:mt-4 -space-y-px rounded-md flex flex-col items-center">
                <div class="relative rounded-md rounded-b-none px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="llm-base-url" class="block text-xs font-medium text-gray-900">Base URL</label>
                    <input type="url" name="llm-base-url" id="llm-base-url" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 text-sm sm:text-base sm:leading-6" placeholder="http://localhost:8000/v1" value="${llmBaseUrlDefault}" required>
                </div>
                <div class="relative rounded-md rounded-t-none px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="llm-api-key" class="block text-xs font-medium text-gray-900">API key</label>
                    <input type="password" name="llm-api-key" id="llm-api-key" class="block w-full border-0 p-0 text-gray-900 focus:outline-none focus:ring-0 text-sm sm:text-base sm:leading-6">
                </div>
                <div id="api-key-message-container" class="hidden w-full sm:w-3/4 md:w-2/3 lg:w-1/2"></div>
            </div>
        </div>
    
        <div id="submit-api-key-buttons" class="py-2 sm:py-4">
            <div class="flex flex-col sm:flex-row justify-center gap-2">
                <button id="forget-api-key" class="rounded-md border border-gray-300 bg-white py-2.5 sm:py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Forget API key</button>
                <button id="submit-api-key" class="inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2.5 sm:py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Submit API key</button>
            </div>
        </div>
        
        <hr class="border-gray-300">
        
        <div class="col-span-full py-2 sm:py-4">
            <h2 class="text-base sm:text-lg font-semibold leading-7 text-gray-900">Select an LLM</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Select a model from the list below that is available at your chosen API endpoint.</p>
            <div class="mt-3 sm:mt-4 -space-y-px rounded-md flex flex-col items-center">
                <div class="relative rounded-md px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="llm-model" class="block text-xs font-medium text-gray-900">LLM model</label>
                    <select id="llm-model" name="llm-model" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 text-sm sm:text-base sm:leading-6">
                        <option value="" disabled selected>Set URL/API key above to see models list</option>
                    </select>
                </div>
                
                <!-- WebLLM Loading Progress (moved here from API config section) -->
                <div id="webllm-loading-container" class="hidden mt-3 w-full sm:w-3/4 md:w-2/3 lg:w-1/2">
                    <div class="w-full bg-gray-200 h-1 mb-2 overflow-hidden rounded">
                        <div id="webllm-loading-bar" class="bg-green-500 h-full w-0 transition-all duration-200 ease-in"></div>
                    </div>
                    <p id="webllm-loading-status" class="text-sm text-gray-600"></p>
                </div>

                <!-- WebLLM Message Container (moved here from API config section) -->
                <div id="webllm-message-container" class="hidden mt-2 w-full sm:w-3/4 md:w-2/3 lg:w-1/2"></div>
            </div>
        </div>
    </div>
</div>


<!-- File upload -->
<div id="file-upload-container" class="mx-auto max-w-7xl mt-3 sm:mt-4 px-3 sm:px-4 lg:px-8 border rounded-lg">
    <div class="space-y-4 sm:space-y-6 pt-2 sm:pt-4">
        <div class="col-span-full">
            <h2 class="text-base sm:text-lg font-semibold leading-7 text-gray-900">Upload text reports</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Only TXT files are supported. Please ensure that the uploaded data is aligned to the associated data use agreement (e.g. requiring deidentification).</p>
            <div id="file-drop-area" class="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-3 sm:px-6 py-6 sm:py-10">
                <div class="text-center">
                    <div id="file-upload-icon">
                        <svg class="mx-auto h-10 w-10 sm:h-14 sm:w-14 text-gray-300" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M11.956 6h.05a2.99 2.99 0 0 1 2.117.879 3.003 3.003 0 0 1 0 4.242 2.99 2.99 0 0 1-2.117.879h-1.995v-1h1.995a2.002 2.002 0 0 0 0-4h-.914l-.123-.857a2.49 2.49 0 0 0-2.126-2.122A2.478 2.478 0 0 0 6.23 5.5l-.333.762-.809-.189A2.49 2.49 0 0 0 4.523 6c-.662 0-1.297.263-1.764.732A2.503 2.503 0 0 0 4.523 11h2.494v1H4.523a3.486 3.486 0 0 1-2.628-1.16 3.502 3.502 0 0 1-.4-4.137A3.497 3.497 0 0 1 3.853 5.06c.486-.09.987-.077 1.468.041a3.486 3.486 0 0 1 3.657-2.06A3.479 3.479 0 0 1 11.956 6zm-1.663 3.853L8.979 8.54v5.436h-.994v-5.4L6.707 9.854 6 9.146 8.146 7h.708L11 9.146l-.707.707z"/>
                        </svg>
                    </div>
                    <div id="progress-ring" class="hidden">
                        <div class="relative inline-flex items-center justify-center">
                            <svg class="progress-ring" width="84" height="84">
                                <circle class="progress-ring__circle" stroke="green" stroke-width="6" fill="transparent" r="36" cx="42" cy="42"/>
                            </svg>
                            <div class="progress-ring-text absolute text-sm sm:text-md text-green-600 font-semibold">
                                <span></span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 sm:mt-4 flex flex-col sm:flex-row items-center justify-center text-sm leading-6 text-gray-600">
                        <label for="file-upload" class="relative cursor-pointer rounded-md bg-white font-semibold text-green-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-600 focus-within:ring-offset-2 hover:text-green-500">
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
            </div>
            <p id="files-uploaded-message" class="mt-2 text-sm text-gray-500"></p>
        </div>
        <div id="file-upload-buttons" class="py-2 sm:py-4">
            <div class="flex flex-col sm:flex-row justify-center gap-2">
                <button id="clear-btn" type="reset" class="w-full sm:w-auto rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Clear</button>
                <button id="submit-btn" type="submit" class="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent bg-green-800 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Submit</button>
            </div>
        </div>
    </div>
</div>

<div id="upload-extraction-divider" class="pt-3 sm:pt-4">
    <div class="relative">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
            <div class="w-full border-t border-gray-300 mx-3 sm:mx-6 lg:mx-8"></div>
        </div>
        <div class="relative flex justify-center">
            <span class="bg-white px-2 text-base sm:text-lg font-semibold text-gray-500">Information extracted by the LLM</span>
        </div>
    </div>
</div>

<!-- Information extraction + progress UI -->
<div class="mx-auto max-w-7xl mt-3 sm:mt-4 px-3 sm:px-4 lg:px-8 mb-4 sm:mb-6 border rounded-lg">
    <div class="w-full md:w-11/12 lg:w-10/12 mx-auto">
        <!-- Progress bar & revolve ring for extraction -->
        <div id="extraction-progress-container" class="mt-3 hidden">
            <div id="extraction-progress-bar-wrapper" class="w-full bg-gray-200 h-1 mb-2 rounded">
                <div id="extraction-progress-bar" class="bg-green-500 h-full w-0 transition-all duration-200 ease-in"></div>
            </div>
            <div id="extraction-progress-label" class="text-sm text-gray-700"></div>
        </div>
        
        <div id="info-extraction" class="w-full my-3 sm:mt-4 px-3 sm:px-4 lg:px-8"></div>
    </div>
</div>
  
<div id="extraction-harmonization-divider" class="pt-3 sm:pt-4">
    <div class="relative">
        <div class="absolute inset-0 flex items-center" aria-hidden="true">
            <div class="w-full border-t border-gray-300 mx-3 sm:mx-6 lg:mx-8"></div>
        </div>
        <div class="relative flex justify-center">
            <span class="bg-white px-2 text-base sm:text-lg font-semibold text-gray-500">Standardized Linked Data</span>
        </div>
    </div>
</div>

<!-- Data standardization -->
<div class="mx-auto max-w-7xl mt-3 sm:mt-4 px-3 sm:px-4 lg:px-8 mb-4 sm:mb-6 border rounded-lg">
    <div class="w-full md:w-11/12 lg:w-10/12 mx-auto">
        <div id="standardization" class="w-full my-3 sm:mt-4 px-3 sm:px-4 lg:px-8"></div>
    </div>
</div>
    `;
}


export { ui };