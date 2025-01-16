import jsonld from 'https://esm.sh/jsonld@8.3.3';


async function buildLinkedTable(container, jsonLdDoc) {
    container.innerHTML = "";
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'relative overflow-x-auto shadow-md sm:rounded-lg my-4 w-full';

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
        tableWrapper.appendChild(buildPlainTable(jsonData, headers));
        container.appendChild(tableWrapper);
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

    // Linked HTML table
    const table = document.createElement("table");
    table.className = 'w-full text-sm text-left';
    table.style.color = 'rgb(132, 204, 22)';

    // THEAD
    const thead = document.createElement("thead");
    thead.className = 'text-xs uppercase';
    thead.style.backgroundColor = 'rgb(20, 83, 45)';
    thead.style.color = 'white';

    const headerRow = document.createElement("tr");
    for (const header of headers) {
        const th = document.createElement("th");
        th.scope = 'col';
        th.className = 'px-6 py-3';

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
    for (let i = 0; i < jsonData.length; i++) {
        const originalRow = jsonData[i];
        const expandedRow = flattenedNodes[i] || {};
        const tr = document.createElement("tr");
        tr.className = 'bg-white border-b';
        tr.style.setProperty('--tw-hover-bg-opacity', '0.05');
        tr.style.setProperty('--lime-50', 'rgb(247, 254, 231)');

        tr.addEventListener('mouseenter', () => {
            tr.style.backgroundColor = 'rgb(247, 254, 231)';
        });
        tr.addEventListener('mouseleave', () => {
            tr.style.backgroundColor = 'white';
        });

        for (const header of headers) {
            const td = document.createElement("td");
            td.className = 'px-4 py-2';

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
                    a.style.color = 'rgb(77, 124, 15)'; // lime-800
                });
                a.addEventListener('mouseleave', () => {
                    a.style.color = 'rgb(101, 163, 13)'; // lime-600
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

    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
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
 * @returns {HTMLTableElement}
 */
function buildPlainTable(data, headers) {
    const table = document.createElement("table");
    table.className = 'w-full text-sm text-left text-gray-500';

    // THEAD
    const thead = document.createElement("thead");
    thead.className = 'text-xs text-white uppercase bg-green-900';
    const headerRow = document.createElement("tr");
    for (const header of headers) {
        const th = document.createElement("th");
        th.scope = 'col';
        th.className = 'px-6 py-3';
        th.textContent = header;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // TBODY
    const tbody = document.createElement("tbody");
    for (const row of data) {
        const tr = document.createElement("tr");
        tr.className = 'bg-white border-b hover:bg-green-50';
        for (const header of headers) {
            const td = document.createElement("td");
            td.className = 'px-4 py-2';
            const val = row[header];
            td.textContent = (val === null) || (val === undefined) ? "-" : String(val);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
}


export {buildLinkedTable};