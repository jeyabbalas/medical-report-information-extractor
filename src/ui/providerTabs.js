/**
 * Provider tab management utilities
 */

import { API_PROVIDERS } from '../core/constants.js';

// Current selected provider (tracks UI state)
let selectedProvider = API_PROVIDERS.OPENAI;

// Callback for when provider changes
let onProviderChangeCallback = null;

/**
 * Get the currently selected provider
 * @returns {string} - The provider ID ('openai' or 'gemini')
 */
export function getSelectedProvider() {
    return selectedProvider;
}

/**
 * Set the selected provider
 * @param {string} providerId - The provider ID to select
 */
export function setSelectedProvider(providerId) {
    if (providerId === API_PROVIDERS.GEMINI || providerId === API_PROVIDERS.OPENAI) {
        selectedProvider = providerId;
    }
}

/**
 * Set callback for when provider tab changes
 * @param {function} callback - Function to call with the new provider ID
 */
export function setProviderChangeCallback(callback) {
    onProviderChangeCallback = callback;
}

/**
 * Initialize provider tab event listeners
 * @returns {void}
 */
export function initProviderTabs() {
    const tabs = document.querySelectorAll('.provider-tab');
    const panels = document.querySelectorAll('.provider-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const provider = tab.dataset.provider;
            selectedProvider = provider === 'gemini' ? API_PROVIDERS.GEMINI : API_PROVIDERS.OPENAI;

            // Clear any existing API key message when switching tabs
            clearApiKeyMessage();

            // Update tab styling
            tabs.forEach(t => {
                t.classList.remove('border-green-600', 'text-green-600');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            tab.classList.remove('border-transparent', 'text-gray-500');
            tab.classList.add('border-green-600', 'text-green-600');

            // Show/hide panels
            panels.forEach(panel => panel.classList.add('hidden'));
            const targetPanel = document.getElementById(`provider-${provider}`);
            if (targetPanel) {
                targetPanel.classList.remove('hidden');
            }

            // Invoke callback to sync models and credentials
            if (onProviderChangeCallback) {
                onProviderChangeCallback(selectedProvider);
            }
        });
    });
}

/**
 * Programmatically activate a provider tab
 * @param {string} providerId - The provider ID to activate ('openai' or 'gemini')
 */
export function activateProviderTab(providerId) {
    const tabId = providerId === API_PROVIDERS.GEMINI ? 'tab-gemini' : 'tab-openai';
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.click();
    }
}

/**
 * Clear the models dropdown
 */
export function clearModelsDropdown() {
    const selectEl = document.getElementById('llm-model');
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="" disabled selected>Set URL/API key above to see models list</option>`;
}

/**
 * Set message in the API key message container
 * @param {string} text - The message text
 * @param {boolean} isSuccess - Whether this is a success message
 */
export function setApiKeyMessage(text, isSuccess) {
    const container = document.getElementById('api-key-message-container');
    if (!container) return;
    container.textContent = text;
    container.className = isSuccess
        ? 'mt-3 text-sm text-center p-3 rounded-lg border w-full sm:w-3/4 md:w-2/3 lg:w-1/2 mx-auto bg-green-50 text-green-800 border-green-300'
        : 'mt-3 text-sm text-center p-3 rounded-lg border w-full sm:w-3/4 md:w-2/3 lg:w-1/2 mx-auto bg-red-50 text-red-800 border-red-300';
}

/**
 * Clear the API key message
 */
export function clearApiKeyMessage() {
    const container = document.getElementById('api-key-message-container');
    if (!container) return;
    container.textContent = '';
    container.className = 'hidden';
}
