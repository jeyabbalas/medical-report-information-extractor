const marieLogoUrl = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/assets/marie_logo.svg";
const githubLogoUrl = "https://raw.githubusercontent.com/jeyabbalas/medical-report-information-extractor/refs/heads/main/assets/github.svg";

function ui(divID) {
    let divUI = divID ? document.getElementById(divID) : document.createElement('div');

    divUI.innerHTML = `
<!-- Header -->
<div id="header" class="mx-auto max-w-7xl px-4 py-2 sm:px-6 sm:py-4 bg-green-900 rounded-b-lg">
    <div class="flex items-center justify-between">
        <div class="flex items-center justify-start">
            <div class="flex items-center">
                <img src="${marieLogoUrl}" class="h-12 w-12 sm:h-20 sm:w-20 logo vanilla" alt="pie logo" />
            </div>
            <div class="min-w-0 pl-3">
                <h2 class="text-2xl font-bold leading-7 text-white sm:text-3xl sm:tracking-tight">Medical Report Information Extractor</h2>
            </div>
        </div>
      
        <div class="flex md:mt-0 md:ml-4 shrink-0">
            <a title="Source code" href="https://github.com/jeyabbalas/medical-report-information-extractor">
                <img src="${githubLogoUrl}" class="h-12 w-12 sm:h-16 sm:w-16 fill-current" alt="github logo" />
            </a>
        </div>
    </div>
</div>
    `;
}

export { ui };