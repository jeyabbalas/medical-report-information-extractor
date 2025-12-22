/**
 * Modal dialog utilities
 */

import { getMissingFieldElementId } from '../extraction/engine.js';

/**
 * Show a modal dialog for missing information
 * @param {string[]} missingItems - Array of missing item descriptions
 * @returns {Promise<void>} - Resolves when modal is closed
 */
export function showMissingInfoModal(missingItems) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-gray-500/30 backdrop-blur-sm flex items-center justify-center z-50';

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

/**
 * Show a confirmation modal for erasing data
 * @returns {Promise<boolean>} - Resolves with true if confirmed, false if cancelled
 */
export function showEraseDataConfirmationModal() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-gray-500/30 backdrop-blur-sm flex items-center justify-center z-50';

        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-lg p-4 max-w-md w-full';
        modal.innerHTML = `
          <h2 class="text-lg font-semibold mb-2">Erase All Extracted Data?</h2>
          <p class="mb-4">This action will permanently remove all extracted information from the database. This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <button id="erase-modal-cancel" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded">
              Cancel
            </button>
            <button id="erase-modal-confirm" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">
              Erase Data
            </button>
          </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const cancelBtn = modal.querySelector('#erase-modal-cancel');
        const confirmBtn = modal.querySelector('#erase-modal-confirm');

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

/**
 * Show a rate limit termination message
 * @param {HTMLElement} container - The container element to append message to
 */
export function showRateLimitEarlyTerminationMessage(container) {
    if (!container) {
        container = document.getElementById('extracted-data-container');
    }
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'p-4 mt-4 mb-4 text-yellow-700 bg-yellow-100 border border-yellow-300 rounded';
    messageDiv.innerHTML = `
        <p class="font-medium">Rate Limit Reached</p>
        <p>Extraction was stopped early due to repeated rate limit errors. Partial results are shown below.</p>
        <p class="mt-2">Try again later or reduce the number of concurrent requests.</p>
    `;
    container.appendChild(messageDiv);
}

/**
 * Scroll to the first field that needs attention
 * @param {string} missingItem - The missing item description
 */
export function scrollToFirstMissingField(missingItem) {
    const elementId = getMissingFieldElementId(missingItem);
    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/**
 * Show a confirmation modal when model has changed since last extraction
 * @param {string} oldModel - The model used for previous extraction
 * @param {string} newModel - The currently selected model
 * @returns {Promise<boolean>} - Resolves with true if user wants to proceed, false to cancel
 */
export function showModelChangeConfirmationModal(oldModel, newModel) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-gray-500/30 backdrop-blur-sm flex items-center justify-center z-50';

        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-lg p-4 max-w-md w-full mx-4';
        modal.innerHTML = `
          <h2 class="text-lg font-semibold mb-2">Model Changed</h2>
          <p class="mb-2">Previous extraction was performed using:</p>
          <p class="mb-3 font-mono text-sm bg-gray-100 p-2 rounded">${oldModel}</p>
          <p class="mb-2">You have now selected:</p>
          <p class="mb-3 font-mono text-sm bg-gray-100 p-2 rounded">${newModel}</p>
          <p class="mb-4 text-gray-600">Do you want to clear the old results and perform a fresh extraction with the new model?</p>
          <div class="flex justify-end gap-2">
            <button id="model-change-cancel" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded">
              Cancel
            </button>
            <button id="model-change-confirm" class="bg-green-800 hover:bg-green-700 text-white px-4 py-2 rounded">
              Yes, Re-extract
            </button>
          </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const cancelBtn = modal.querySelector('#model-change-cancel');
        const confirmBtn = modal.querySelector('#model-change-confirm');

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
