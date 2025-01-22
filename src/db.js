import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';


export async function getOrCreateDB() {
  return openDB('medical-report-information-extractor-db', 1, {
    upgrade(db) {
      // "config" store: system prompt, JSON schemas, JSON-LD contexts, LLM API credentials.
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'id' });
      }

      // "reports" store: user-uploaded .txt files.
      if (!db.objectStoreNames.contains('reports')) {
        db.createObjectStore('reports', { keyPath: 'id' });
      }
    }
  });
}

/*
   Configuration store:
     - id = "appConfig" for systemPrompt + JSON schemas + JSON-LD contexts
     - id = "llmApiCreds" for API baseURL + key
     - id = "model" for user-selected model
*/

export async function saveConfigRecord(record) {
  const db = await getOrCreateDB();
  await db.put('config', record);
}

export async function getConfigRecord(id) {
  const db = await getOrCreateDB();
  return db.get('config', id);
}

export async function deleteConfigRecord(id) {
  const db = await getOrCreateDB();
  return db.delete('config', id);
}

/*
    Report store:
     { id: <unique>, name: <string>, content: <string> }
*/

export async function putUploadedFile(fileRecord) {
  const db = await getOrCreateDB();
  await db.put('reports', fileRecord);
}

export async function getAllUploadedFiles() {
  const db = await getOrCreateDB();
  return db.getAll('reports');
}

export async function clearUploadedFiles() {
  const db = await getOrCreateDB();
  await db.clear('reports');
}
