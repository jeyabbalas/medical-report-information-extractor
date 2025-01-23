import {openDB} from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';


async function getOrCreateDB() {
    return openDB('medical-report-information-extractor-db', 1, {
        upgrade(db) {
            // "config" store: system prompt, JSON schemas, JSON-LD contexts, LLM API credentials.
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config', {keyPath: 'id'});
            }

            // "reports" store: user-uploaded reports, extracted data
            if (!db.objectStoreNames.contains('reports')) {
                db.createObjectStore('reports', {keyPath: 'id'});
            }
        }
    });
}

/*
   config store:
     - id = "appConfig" for systemPrompt + JSON schemas + JSON-LD contexts
     - id = "llmApiCreds" for API baseURL + key
     - id = "model" for user-selected model
*/

async function saveConfigRecord(record) {
    const db = await getOrCreateDB();
    await db.put('config', record);
}


async function getConfigRecord(id) {
    const db = await getOrCreateDB();
    return db.get('config', id);
}


async function deleteConfigRecord(id) {
    const db = await getOrCreateDB();
    return db.delete('config', id);
}

/*
    reports store:
     {
       id: <unique>,
       name: <string>,
       content: <string>,
       extractions?: [
         {
           schemaTitle: <string>,
           data: <object> // LLM-extracted JSON for that schema
         }
       ]
     }
*/

async function putUploadedFile(fileRecord) {
    const db = await getOrCreateDB();
    await db.put('reports', fileRecord);
}


async function getAllUploadedFiles() {
    const db = await getOrCreateDB();
    return db.getAll('reports');
}


async function clearUploadedFiles() {
    const db = await getOrCreateDB();
    await db.clear('reports');
}


export {
    getOrCreateDB,
    saveConfigRecord,
    getConfigRecord,
    deleteConfigRecord,
    putUploadedFile,
    getAllUploadedFiles,
    clearUploadedFiles
};
