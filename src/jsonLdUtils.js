import {jsonld} from 'https://esm.sh/jsonld@8.3.3';

/**
 * Build a plain (no hyperlinks) HTML table from a JSON dataset.
 *
 * @param data - JSON dataset (array of objects)
 * @param headers - Array of header names
 * @returns {HTMLTableElement}
 */
function buildPlainTable(data, headers) {
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.border = "1px solid #ccc";

    // THEAD
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const header of headers) {
        const th = document.createElement("th");
        th.style.border = "1px solid #ccc";
        th.style.padding = "4px";
        th.textContent = header;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // TBODY
    const tbody = document.createElement("tbody");
    for (const row of data) {
        const tr = document.createElement("tr");
        for (const header of headers) {
            const td = document.createElement("td");
            td.style.border = "1px solid #ccc";
            td.style.padding = "4px";
            const val = row[header];
            td.textContent = (val === null) | (val === undefined) ? "-" : String(val);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
}