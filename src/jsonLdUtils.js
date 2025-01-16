import jsonld from 'https://esm.sh/jsonld@8.3.3';


async function buildLinkedTable(container, jsonLdDoc) {
    container.innerHTML = "";

    // JSON dataset
    const jsonData = jsonLdDoc["@graph"] || [];
    const headers =
        jsonLdDoc["@graph"].length > 1 ? Object.keys(jsonLdDoc["@graph"][0]) : [];

    // Expand JSON-LD data (integrate @context into the @graph data)
    let expandedDoc;
    try {
        expandedDoc = await jsonld.expand(jsonLdDoc);
    } catch (err) {
        console.error("Error expanding JSON-LD:", err);
        container.appendChild(buildPlainTable(jsonData, headers));
        return;
    }

    // expandedDoc is an array of expanded nodes in the same order as jsonData
    // Flatten each expanded node so it's propertyIri -> valueIriOrLiteral
    const flattenedNodes = expandedDoc.map(flattenExpandedNode);

    // propertyName -> propertyIri map
    let propertyNameIriMap = {};
    try {
        propertyNameIriMap = await buildPropertyNameIriMap(jsonLdDoc['@context'], headers);
    } catch (err) {
        // Not fatal; we can still display a table, just no links for property headers
        console.warn('Error building property name → IRI map:', err);
    }


    // Table wrappers
    const outerWrapper = document.createElement('div');
    outerWrapper.className = 'min-h-fit max-h-96 w-full' // fixed max table height
    const shadowWrapper = document.createElement('div');
    shadowWrapper.className = 'shadow-md rounded-lg h-full'; // shadow and rounded corners
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'relative overflow-auto h-full rounded-lg border border-gray-200'; // scrollable
    const stickyWrapper = document.createElement('div');
    stickyWrapper.className = 'relative'; // sticky header

    // Linked HTML table
    const table = document.createElement("table");
    table.className = 'w-full text-sm text-left min-w-full table-auto';
    table.style.color = 'rgb(132, 204, 22)';

    // THEAD
    const thead = document.createElement("thead");
    thead.className = 'text-xs uppercase sticky top-0 z-10';
    thead.style.backgroundColor = 'rgb(20, 83, 45)';
    thead.style.color = 'white';

    const headerRow = document.createElement("tr");
    for (const header of headers) {
        const th = document.createElement("th");
        th.scope = 'col';
        th.className = 'px-6 py-3 whitespace-nowrap';

        // If we have a property IRI, hyperlink the header
        const propIri = propertyNameIriMap[header];
        if (
            propIri &&
            (propIri.startsWith("http://") || propIri.startsWith("https://"))
        ) {
            const link = document.createElement("a");
            link.href = propIri;
            link.target = "_blank";
            link.textContent = header;
            link.className = 'underline';
            link.style.color = 'rgb(190, 242, 100)';
            th.appendChild(link);
        } else {
            th.textContent = header;
        }

        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // TBODY
    const tbody = document.createElement("tbody");
    tbody.className = 'divide-y divide-gray-200';

    for (let i = 0; i < jsonData.length; i++) {
        const originalRow = jsonData[i];
        const expandedRow = flattenedNodes[i] || {};
        const tr = document.createElement("tr");
        tr.className = 'bg-white border-b';
        tr.style.setProperty('--tw-hover-bg-opacity', '0.05');

        tr.addEventListener('mouseenter', () => {
            tr.style.backgroundColor = 'rgb(247, 254, 231)';
        });
        tr.addEventListener('mouseleave', () => {
            tr.style.backgroundColor = 'white';
        });

        for (const header of headers) {
            const td = document.createElement("td");
            td.className = 'px-4 py-2 whitespace-nowrap';

            const originalValue = originalRow[header];
            const propertyIri = propertyNameIriMap[header];
            let expandedValue = null;
            if (propertyIri && expandedRow[propertyIri]) {
                expandedValue = expandedRow[propertyIri];
            }

            if (originalValue === null) {
                const span = document.createElement('span');
                span.className = 'text-gray-500';
                span.textContent = '-';
                td.appendChild(span);
            } else if (Array.isArray(originalValue) || typeof originalValue === 'object') {
                const span = document.createElement('span');
                span.className = 'font-mono text-sm';
                span.style.color = 'rgb(75, 85, 99)';
                span.textContent = JSON.stringify(originalValue);
                td.appendChild(span);
            } else if (
                typeof expandedValue === "string" &&
                (expandedValue.startsWith("http://") ||
                    expandedValue.startsWith("https://"))
            ) {
                const a = document.createElement("a");
                a.href = expandedValue;
                a.target = "_blank";
                a.className = 'underline';
                a.style.color = 'rgb(101, 163, 13)';
                a.textContent = String(originalValue);
                a.addEventListener('mouseenter', () => {
                    a.style.color = 'rgb(77, 124, 15)';
                });
                a.addEventListener('mouseleave', () => {
                    a.style.color = 'rgb(101, 163, 13)';
                });
                td.appendChild(a);
            } else {
                const span = document.createElement('span');
                span.className = 'text-gray-800';
                span.textContent = String(originalValue);
                td.appendChild(span);
            }

            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // Wrap up
    stickyWrapper.appendChild(table);
    tableWrapper.appendChild(stickyWrapper);
    shadowWrapper.appendChild(tableWrapper);
    outerWrapper.appendChild(shadowWrapper);
    container.appendChild(outerWrapper);
}


/**
 * Build a dictionary mapping each property name to its expanded IRI
 * by expanding a minimal snippet once per distinct property.
 *
 * @param context - The JSON-LD context object
 * @param properties - Array of distinct property names from @graph
 * @returns {Promise<{}>}
 */
async function buildPropertyNameIriMap(context, properties) {
    const map = {};
    for (const property of properties) {
        // Minimal JSON-LD snippet
        const doc = {
            '@context': context,
            '@id': '_:dummy',
            [property]: 'dummy_value'
        };
        try {
            const expanded = await jsonld.expand(doc);
            if (expanded.length > 0) {
                const node = expanded[0];
                for (const key of Object.keys(node)) {
                    if (key !== '@id') {
                        map[property] = key;
                        break;
                    }
                }
            }
        } catch (err) {
            // Failed expansion. The property might be unknown or misdeclared?
            console.warn(`Could not expand property "${property}"`, err);
            map[property] = null;
        }
    }
    return map;
}


/**
 * Given an expanded node (from `jsonld.expand`), return a dictionary
 *   propertyIri -> the first expanded object (IRI or literal) for that property.
 *
 * @param expandedNode
 * @returns {{}}
 */
function flattenExpandedNode(expandedNode) {
    const result = {};
    for (const key of Object.keys(expandedNode)) {
        if (key === "@id") continue;
        const objects = expandedNode[key];
        if (!objects || objects.length === 0) {
            continue; // no value
        }
        // Take the first object
        const obj = objects[0];
        if (obj["@id"]) {
            // It's an IRI
            result[key] = obj["@id"];
        } else if (obj["@value"]) {
            // It's a literal
            result[key] = obj["@value"];
        }
    }
    return result;
}


/**
 * Build a plain (no hyperlinks) HTML table from a JSON dataset.
 *
 * @param data - JSON dataset (array of objects)
 * @param headers - Array of header names
 * @returns {HTMLDivElement}
 */
function buildPlainTable(data, headers) {
    // Table wrappers
    const outerWrapper = document.createElement('div');
    outerWrapper.className = 'min-h-fit max-h-96 w-full' // fixed max table height
    const shadowWrapper = document.createElement('div');
    shadowWrapper.className = 'shadow-md rounded-lg h-full'; // shadow and rounded corners
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'relative overflow-auto h-full rounded-lg border border-gray-200'; // scrollable
    const stickyWrapper = document.createElement('div');
    stickyWrapper.className = 'relative'; // sticky header

    // Plain HTML table
    const table = document.createElement("table");
    table.className = 'w-full text-sm text-left min-w-full table-auto text-gray-500';

    // THEAD
    const thead = document.createElement("thead");
    thead.className = 'text-xs text-white uppercase sticky top-0 z-10 bg-green-900';
    const headerRow = document.createElement("tr");
    for (const header of headers) {
        const th = document.createElement("th");
        th.scope = 'col';
        th.className = 'px-6 py-3 whitespace-nowrap';
        th.textContent = header;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // TBODY
    const tbody = document.createElement("tbody");
    tbody.className = 'divide-y divide-gray-200';

    for (const row of data) {
        const tr = document.createElement("tr");
        tr.className = 'bg-white border-b hover:bg-green-50';
        for (const header of headers) {
            const td = document.createElement("td");
            td.className = 'px-4 py-2 whitespace-nowrap';

            const val = row[header];
            if (val === null || val === undefined) {
                const span = document.createElement('span');
                span.className = 'text-gray-500';
                span.textContent = '-';
                td.appendChild(span);
            } else if (Array.isArray(val) || typeof val === 'object') {
                const span = document.createElement('span');
                span.className = 'font-mono text-sm';
                span.style.color = 'rgb(75, 85, 99)'; // gray-600
                span.textContent = JSON.stringify(val);
                td.appendChild(span);
            } else {
                const span = document.createElement('span');
                span.className = 'text-gray-800';
                span.textContent = String(val);
                td.appendChild(span);
            }

            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // Wrap up
    stickyWrapper.appendChild(table);
    tableWrapper.appendChild(stickyWrapper);
    shadowWrapper.appendChild(tableWrapper);
    outerWrapper.appendChild(shadowWrapper);

    return outerWrapper;
}


/**
 * Checks if a JSON-LD object is valid by:
 *   1) Verifying it has an "@context" key.
 *   2) Attempting to expand it using jsonld.js.
 *
 * @param jsonLdDoc - The JSON-LD object
 * @returns {Promise<{valid: boolean, error: string}|{valid: boolean, error: null}>}
 *          - { valid: true, error: null } if it's valid
 *          - { valid: false, error: "some message" } if it's invalid
 */
async function validateJsonLd(jsonLdDoc) {
    // "@context" key is mandatory for this app.
    if (
        !jsonLdDoc ||
        typeof jsonLdDoc !== "object" ||
        !("@context" in jsonLdDoc)
    ) {
        return {
            valid: false,
            error: "Missing @context."
        };
    }

    try {
        await jsonld.expand(jsonLdDoc);
        return {
            valid: true,
            error: null
        };
    } catch (err) {
        return {
            valid: false,
            error: `Invalid JSON-LD context or data: ${err.message}`
        };
    }
}


export {buildLinkedTable, buildPlainTable, validateJsonLd};