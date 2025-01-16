import {jsonld} from 'https://esm.sh/jsonld@8.3.3';


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
}


/**
 * Build a dictionary mapping each property name to its expanded IRI
 * by expanding a minimal snippet once per distinct property.
 *
 * @param context - The JSON-LD context object
 * @param distinctProps - Array of distinct property names from @graph
 * @returns {Promise<{}>}
 */
async function buildPropertyNameIriMap(context, distinctProps) {
    const map = {};
    for (const prop of distinctProps) {
        // Minimal JSON-LD snippet
        const doc = {
            '@context': context,
            '@id': '_:dummy',
            [prop]: 'dummy_value'
        };
        try {
            const expanded = await jsonld.expand(doc);
            if (expanded.length > 0) {
                const node = expanded[0];
                for (const key of Object.keys(node)) {
                    if (key !== '@id') {
                        map[prop] = key;
                        break;
                    }
                }
            }
        } catch (err) {
            // Failed expansion. The property might be unknown or misdeclared?
            console.warn(`Could not expand property "${prop}"`, err);
            map[prop] = null;
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


export { buildLinkedTable };