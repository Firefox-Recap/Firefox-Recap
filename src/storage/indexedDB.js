// indexedDB.js
import {openDB} from 'idb';

const DB_NAME = 'histofyDB';
const STORE_NAME = 'classifications';

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'title'});
      }
    },
  });
}

export async function getCachedClassification(title) {
  if (!title) return null;
  const db = await initDB();
  return (await db.get(STORE_NAME, title))?.category || null;
}

export async function cacheClassification(title, categories) {
  if (!title || !categories) return;
  const db = await initDB();
  await db.put(STORE_NAME, {title, category: categories});
}
