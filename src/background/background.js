/**
 * background.js
 * ------------------------------------------------
 * Tracks browser history, classifies visits, and caches results.
 * Uses Xenova's zero-shot model, cached in IndexedDB.
 */

import initSqlJs from 'sql.js';
import {loadModel, classifyPage} from '../../models/transformers.js';
import {
  getCachedClassification,
  cacheClassification,
} from '../storage/indexedDB.js';

let db;
const recentUrls = new Set();
const duplicateTimeout = 5000;
const classificationQueue = [];
let batchTimer = null;

/**
 * Normalize URLs (remove "www.", enforce https, etc.).
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.replace(/^www\./, '');
    return parsed.href;
  } catch (error) {
    console.error('❌ URL Normalization Error:', error);
    return url;
  }
}

/**
 * Classify a page title, using IndexedDB to avoid re-running the model unnecessarily.
 */
async function classifyWithCache(title) {
  // 1. Check if classification is already cached in IndexedDB
  const cachedCategory = await getCachedClassification(title);
  if (cachedCategory) {
    return cachedCategory;
  }

  // 2. If not cached, run the model
  const category = await classifyPage(title);

  // 3. Cache the result in IndexedDB
  await cacheClassification(title, category);
  return category;
}

/**
 * Queue classification requests instead of processing them immediately.
 */
async function queueClassification(url, title) {
  classificationQueue.push({url, title});

  if (!batchTimer) {
    // Wait 10s before classifying everything in a single batch
    batchTimer = setTimeout(processBatchClassification, 10000);
  }
}

/**
 * Process all queued classifications in one batch
 */
async function processBatchClassification() {
  if (classificationQueue.length === 0) return;

  // Ensure model is loaded once here, so we don't do it repeatedly mid-loop
  await loadModel();

  console.log(`🚀 Batch classifying ${classificationQueue.length} pages...`);

  for (const {url, title} of classificationQueue) {
    const category = await classifyWithCache(title);
    await saveHistory(url, title, category);
  }

  classificationQueue.length = 0;
  batchTimer = null;
}

/**
 * Load SQL.js, initialize an in-memory DB, and create tables if needed.
 */
async function loadDatabase() {
  try {
    const SQL = await initSqlJs({
      locateFile: () => browser.runtime.getURL('assets/sql-wasm.wasm'),
    });

    db = new SQL.Database();
    console.log('✅ SQLite Database initialized successfully!');

    db.run(`
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE,
                title TEXT,
                category TEXT,
                visitCount INTEGER DEFAULT 0
            );
        `);
  } catch (error) {
    console.error('❌ SQLite Initialization Error:', error);
  }
}

/**
 * Save or update a URL in the DB and store everything in local storage.
 */
async function saveHistory(url, title, categories) {
  if (!db) {
    console.error('❌ DB not initialized.');
    return;
  }

  url = normalizeUrl(url);

  // Prevent spamming the same URL within a short window
  if (recentUrls.has(url)) {
    console.log(
      `🔄 Skipping duplicate (within ${duplicateTimeout / 1000}s): ${url}`,
    );
    return;
  }
  recentUrls.add(url);
  setTimeout(() => recentUrls.delete(url), duplicateTimeout);

  try {
    // Also cache classification in IndexedDB for repeated lookups
    await cacheClassification(title, categories);

    // Convert array to string for storage if needed
    const categoryValue = Array.isArray(categories)
      ? JSON.stringify(categories)
      : categories;

    // Insert or update row in the SQLite DB
    const stmt = db.prepare(`
            INSERT INTO history (url, title, category, visitCount)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(url) DO UPDATE SET visitCount = visitCount + 1, category = excluded.category;
        `);
    stmt.run([url, title, categoryValue]);
    stmt.free();

    // Update local storage for popup display
    const storedData = await browser.storage.local.get('historyData');
    let historyData = storedData.historyData || [];
    historyData.push({url, title, category: categories});
    await browser.storage.local.set({historyData});

    console.log(`✅ History saved: ${title} -> ${categories}`);
  } catch (error) {
    console.error('❌ Error saving history:', error);
  }
}

/**
 * Attach event listeners once the DB is initialized.
 */
function attachEventListeners() {
  // Listen for new visits in browser history
  browser.history.onVisited.addListener(({url, title}) => {
    console.log('📌 onVisited Triggered:', url);
    if (!title) return;
    queueClassification(url, title);
  });

  // Listen for completed navigation events
  browser.webNavigation.onCompleted.addListener(async ({url, tabId}) => {
    console.log('📌 onCompleted Triggered:', url);
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab.title) return;
      queueClassification(url, tab.title);
    } catch (error) {
      console.error('❌ Failed to get tab details:', error);
    }
  });
}

/**
 * Initialize everything when the extension loads.
 */
(async () => {
  console.log('🚀 Initializing Background Script...');
  await loadDatabase();

  // Optionally, pre-load the model once so classification is ready
  // (Xenova will check IndexedDB cache for you)
  loadModel().catch(console.error);

  attachEventListeners();
  console.log('✅ Background script ready!');
})();
