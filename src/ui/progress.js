/**
 * Progress bar and button state utilities
 */

// Spinner SVG for the submit button
const SPINNER_SVG = `
<svg aria-hidden="true" role="status" class="inline w-4 h-4 mr-2 text-white animate-spin" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="#E5E7EB"/>
    <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor"/>
</svg>`;

/**
 * Disable/enable the submit button with spinner
 * @param {boolean} disable - Whether to disable the button
 */
export function disableSubmitButton(disable) {
    const submitBtn = document.getElementById('submit-btn');
    if (!submitBtn) return;

    if (disable) {
        submitBtn._originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = `${SPINNER_SVG}Processing...`;
        submitBtn.disabled = true;
        submitBtn.classList.add('cursor-not-allowed');
    } else {
        submitBtn.innerHTML = submitBtn._originalHTML || 'Submit';
        submitBtn.disabled = false;
        submitBtn.classList.remove('cursor-not-allowed');
    }
}

/**
 * Update the clear button state and style
 * @param {string} text - The button text ('Clear', 'Stop', or 'Erase extracted data')
 * @param {boolean} [disabled=false] - Whether to disable the button
 */
export function updateClearButtonState(text, disabled = false) {
    const clearBtn = document.getElementById('clear-btn');
    if (!clearBtn) return;

    clearBtn.disabled = disabled;

    // Remove all possible style classes
    clearBtn.classList.remove(
        'bg-white', 'text-gray-700', 'hover:bg-gray-50', 'border-gray-300',
        'bg-red-800', 'text-white', 'hover:bg-red-700'
    );

    // Apply appropriate styles
    if (text === 'Clear') {
        clearBtn.classList.add('bg-white', 'text-gray-700', 'hover:bg-gray-50', 'border-gray-300');
    } else {
        clearBtn.classList.add('bg-red-800', 'text-white', 'hover:bg-red-700');
    }

    clearBtn.textContent = text;
}

/**
 * Show or hide the extraction progress container
 * @param {boolean} show - Whether to show the container
 */
export function showExtractionProgressContainer(show) {
    const container = document.getElementById('extraction-progress-container');
    if (!container) return;

    if (show) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        // Reset bar
        updateExtractionProgress(0, 1, 0, 0);
        const ring = document.getElementById('extraction-progress-ring');
        if (ring) ring.classList.add('hidden');
    }
}

/**
 * Update the extraction progress bar
 * @param {number} completedTasks - Number of completed tasks
 * @param {number} totalTasks - Total number of tasks
 * @param {number} [completedReports=0] - Number of completed reports
 * @param {number} [totalReports=0] - Total number of reports
 */
export function updateExtractionProgress(completedTasks, totalTasks, completedReports = 0, totalReports = 0) {
    const bar = document.getElementById('extraction-progress-bar');
    const label = document.getElementById('extraction-progress-label');

    let pct = 0;
    if (totalTasks > 0) {
        pct = Math.round((completedTasks / totalTasks) * 100);
    }

    if (bar) {
        bar.style.width = pct + '%';
    }

    if (label && totalReports > 0) {
        label.textContent = `Extracting ${completedReports} of ${totalReports} reports...`;
    }
}

/**
 * Check if extraction is currently in progress
 * @returns {boolean}
 */
export function isExtractionInProgress() {
    const submitBtn = document.getElementById('submit-btn');
    return submitBtn && submitBtn.disabled;
}
