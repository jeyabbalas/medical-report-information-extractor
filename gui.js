const marieLogoUrl = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/assets/marie_logo.svg";
const githubLogoUrl = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/assets/github.svg";

function ui(divID) {
    let divUI = divID ? document.getElementById(divID) : document.createElement('div');

    divUI.innerHTML = `
<!-- Header -->
<div id="header" class="mx-auto max-w-7xl px-4 py-2 sm:px-6 sm:pb-4 bg-green-900 rounded-b-lg">
    <div class="flex items-center justify-between">
        <div class="flex items-center justify-start">
            <div class="flex items-center">
                <img src="${marieLogoUrl}" class="h-12 w-12 sm:h-20 sm:w-20 logo vanilla" alt="pie logo" />
            </div>
            <div class="min-w-0 px-3">
                <h2 class="text-xl font-bold leading-7 text-white sm:text-3xl sm:tracking-tight">Medical Report Information Extractor</h2>
            </div>
        </div>
      
        <div class="flex md:mt-0 md:ml-4 shrink-0">
            <a title="Source code" href="https://github.com/jeyabbalas/medical-report-information-extractor">
                <img src="${githubLogoUrl}" class="h-10 w-10 sm:h-16 sm:w-16 fill-current" alt="github logo" />
            </a>
        </div>
    </div>
</div>

<!-- Caution -->
<div id="info" class="mx-auto max-w-7xl px-4 py-2 sm:px-6 sm:py-4 lg:px-8">
    <div id="info-usage" class="flex p-4 mt-2 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50" role="alert">
        <svg aria-hidden="true" class="flex-shrink-0 inline w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
        </svg>
        <span class="sr-only">Data privacy notice</span>
        <div>
            <p><span class="font-medium">Data privacy notice</span>: Before submitting any data on this app, it is crucial that you confirm whether the associated data use agreement permits sharing this data with third-party services. This app utilizes OpenAI's API, which means your submitted data will be processed by OpenAI's servers. Once your data is submitted to OpenAI, it will be subject to OpenAI's data policies.</p>
            <p class="pl-4"></p>
        </div>
    </div>
</div>

<!--LLM API config-->
<div id="config-container" class="mx-auto max-w-7xl mt-4 px-4 sm:px-6 lg:px-8 border rounded-lg">
    <div class="space-y-4 sm:space-y-5 pt-2 sm:pt-4">
        <div class="col-span-full">
            <h2 class="text-lg sm:text-base font-semibold leading-7 text-gray-900">Application configuration</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Please provide the application config.json URL. The file must specify the following properties: <span class="font-mono bg-gray-100 px-1 rounded">systemPrompt</span> URL pointing to the LLM task instruction file, <span class="font-mono bg-gray-100 px-1 rounded">schemaFiles</span> URLs to JSON Schema files describing the metadata of the information to extract, and optionally <span class="font-mono bg-gray-100 px-1 rounded">jsonldContextFiles</span> URLs to JSON-LD context files that map schema elements to standardized vocabularies.</p>
            <div class="mt-4 -space-y-px rounded-md flex flex-col items-center">
                <div class="relative rounded-md px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="config-url" class="block text-xs font-medium text-gray-900">Configuration file URL</label>
                    <input type="url" name="config-url" id="config-url" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:border-0 text-base sm:text-sm sm:leading-6" placeholder="https://example.com/config.json" value="https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/config_example/bcn_generations_pathology_data/config.json" required>
                </div>
                <div id="config-error-message-container" class="w-full sm:w-3/4 md:w-2/3 lg:w-1/2"></div>
            </div>
        </div>

        <hr class="border-gray-300">

        <div class="col-span-full">
            <h2 class="text-lg sm:text-base font-semibold leading-7 text-gray-900">LLM API configuration</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Provide the base URL for your LLM API endpoint and its associated API key. The endpoint must be compatible with OpenAI's <a href="https://platform.openai.com/docs/api-reference/chat" class="underline text-green-700">Chat API structure</a>. By default, the URL below points to the API on OpenAI's platform.</p>
            <div class="mt-4 -space-y-px rounded-md flex flex-col items-center">
                <div class="relative rounded-md rounded-b-none px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="llm-base-url" class="block text-xs font-medium text-gray-900">Base URL</label>
                    <input type="url" name="llm-base-url" id="llm-base-url" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:border-0 text-base sm:text-sm sm:leading-6" placeholder="http://localhost:8000/v1" value="https://api.openai.com/v1" required>
                </div>
                <div class="relative rounded-md rounded-t-none px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="llm-api-key" class="block text-xs font-medium text-gray-900">API key</label>
                    <input type="password" name="llm-api-key" id="llm-api-key" class="block w-full border-0 p-0 text-gray-900 focus:outline-none focus:ring-0 focus:border-0 text-base sm:text-sm sm:leading-6">
                </div>
                <div id="api-key-message-container" class="w-full sm:w-3/4 md:w-2/3 lg:w-1/2"></div>
            </div>
        </div>
    
        <div id="submit-api-key-buttons" class="py-2 sm:py-4">
            <div class="flex flex-col sm:flex-row justify-center gap-2">
                <button id="forget-api-key" class="rounded-md border border-gray-300 bg-white py-3 sm:py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Forget API key</button>
                <button id="submit-api-key" class="inline-flex justify-center rounded-md border border-transparent bg-green-800 py-3 sm:py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Submit API key</button>
            </div>
        </div>
        
        <hr class="border-gray-300">
        
        <div class="col-span-full py-2 sm:py-4">
            <h2 class="text-lg sm:text-base font-semibold leading-7 text-gray-900">Select an LLM</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Select a model from the list below that is available at your chosen API endpoint. This model will be used to perform structured information extraction.</p>
            <div class="mt-4 -space-y-px rounded-md flex flex-col items-center">
                <div class="relative rounded-md px-3 pb-1.5 pt-2.5 w-full sm:w-3/4 md:w-2/3 lg:w-1/2 ring-1 ring-inset ring-gray-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-green-600">
                    <label for="llm-model" class="block text-xs font-medium text-gray-900">LLM model</label>
                    <select id="llm-model" name="llm-model" class="block w-full border-0 p-0 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:border-0 text-base sm:text-sm sm:leading-6">
                        <option value="" disabled selected>Set URL/API key above to see models list</option>
                    </select>
                </div>
            </div>
        </div>
    </div>
</div>
    `;
}


export { ui };