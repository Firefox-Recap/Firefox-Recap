// Note that this listens for history changes and updates the database accordingly in the background.
// Initialize IndexedDB for persistent storage
const dbName = "firefoxRecapDB";
const dbVersion = 1;
let db;

// Database initialization
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    
    request.onerror = event => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = event => {
      db = event.target.result;
      console.log("Database initialized successfully");
      resolve(db);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create object stores
      if (!db.objectStoreNames.contains("historyItems")) {
        const historyStore = db.createObjectStore("historyItems", { keyPath: "id", autoIncrement: true });
        historyStore.createIndex("url", "url", { unique: false });
        historyStore.createIndex("lastVisitTime", "lastVisitTime", { unique: false });
        historyStore.createIndex("domain", "domain", { unique: false });
      }
      
      if (!db.objectStoreNames.contains("visitDetails")) {
        const visitsStore = db.createObjectStore("visitDetails", { keyPath: "visitId" });
        visitsStore.createIndex("url", "url", { unique: false });
        visitsStore.createIndex("visitTime", "visitTime", { unique: false });
      }
     // the goal is to store the category of the URL from the zero shot classifer 
      if (!db.objectStoreNames.contains("categories")) {
        const categoriesStore = db.createObjectStore("categories", { keyPath: "url" });
        categoriesStore.createIndex("category", "category", { unique: false });
      }
    };
  });
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('www.') ? 
      urlObj.hostname.split('www.')[1] : 
      urlObj.hostname;
  } catch (error) {
    console.error("Error extracting domain from URL:", url, error);
    return url;
  }
}

// Function to store history items in the database from the history api
async function storeHistoryItems(items) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["historyItems"], "readwrite");
    const historyStore = transaction.objectStore("historyItems");
    
    let successCount = 0;
    
    items.forEach(item => {
      const request = historyStore.put({
        url: item.url,
        title: item.title,
        lastVisitTime: item.lastVisitTime,
        visitCount: item.visitCount,
        typedCount: item.typedCount,
        domain: extractDomain(item.url)
      });
      
      request.onsuccess = () => {
        successCount++;
        if (successCount === items.length) {
          resolve(successCount);
        }
      };
      
      request.onerror = event => {
        console.error("Error storing history item:", event.target.error);
      };
    });
    
    transaction.oncomplete = () => {
      console.log(`Stored ${successCount} history items`);
    };
    
    transaction.onerror = event => {
      console.error("Transaction error:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Function to store visit details in the database according to the url that it gets
async function storeVisitDetails(url, visits) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["visitDetails"], "readwrite");
    const visitsStore = transaction.objectStore("visitDetails");
    
    let successCount = 0;
    
    visits.forEach(visit => {
      const request = visitsStore.put({
        visitId: visit.visitId,
        url: url,
        visitTime: visit.visitTime,
        referringVisitId: visit.referringVisitId,
        transition: visit.transition
      });
      
      request.onsuccess = () => {
        successCount++;
        if (successCount === visits.length) {
          resolve(successCount);
        }
      };
      
      request.onerror = event => {
        console.error("Error storing visit details:", event.target.error);
      };
    });
    
    transaction.oncomplete = () => {
      console.log(`Stored ${successCount} visit details for ${url}`);
    };
    
    transaction.onerror = event => {
      console.error("Transaction error:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Function to fetch history from the API and store in DB this makes sure that we dont constantly call the api ever time and we can store whatever information we get in this 
async function fetchAndStoreHistory(days = 30) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  try {
    const historyItems = await browser.history.search({
      text: "",
      startTime: startTime,
      maxResults: 999999
    });
    await storeHistoryItems(historyItems);
    
    // Fetch and store visit details for each URL
    for (const item of historyItems) {
      const visits = await browser.history.getVisits({ url: item.url });
      await storeVisitDetails(item.url, visits);
    }
    
    console.log(`Successfully fetched and stored history for the past ${days} days`);
  } catch (error) {
    console.error("Error fetching or storing history:", error);
  }
}

// Modified getHistoryFromDB to include timing information based on the ajusted timestamp
async function getHistoryFromDB(days) {
  const startTime = performance.now();
  const startDbTime = performance.now();
  const stats = { dbTime: 0, apiTime: 0, fromCache: true };
  let fromCache = true;
  
  const startTimeMs = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  try {
    // Try to get from IndexedDB first s
    const transaction = db.transaction(["historyItems"], "readonly");
    const historyStore = transaction.objectStore("historyItems");
    const index = historyStore.index("lastVisitTime");
    
    const range = IDBKeyRange.lowerBound(startTimeMs);
    const requestPromise = new Promise((resolve, reject) => {
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        const dbEndTime = performance.now();
        stats.dbTime = (dbEndTime - startDbTime) / 1000;
        resolve(request.result);
      };
      
      request.onerror = event => {
        console.error("Error getting history from DB:", event.target.error);
        reject(event.target.error);
      };
    });
    
    let results = await requestPromise;
    
    // If no results or incomplete data, fetch from API accounts for the fact if we dont have it stored in the database
    if (!results || results.length === 0) {
      fromCache = false;
      const apiStartTime = performance.now();
      
      // Get from Firefox History API
      const historyItems = await browser.history.search({
        text: "",
        startTime: startTimeMs,
        maxResults: 999999
      });
      
      // Store for next time
      await storeHistoryItems(historyItems);
      
      // Get visit details for each URL
      for (const item of historyItems) {
        const visits = await browser.history.getVisits({ url: item.url });
        await storeVisitDetails(item.url, visits);
      }
      
      results = historyItems;
      const apiEndTime = performance.now();
      stats.apiTime = (apiEndTime - apiStartTime) / 1000;
    }
    
    stats.fromCache = fromCache;
    const endTime = performance.now();
    
    return {
      data: results,
      stats: stats,
      totalTime: (endTime - startTime) / 1000
    };
  } catch (error) {
    console.error("Error in getHistoryFromDB:", error);
    throw error;
  }
}

// Similarly modify getMostVisitedFromDB to include timing metrics
async function getMostVisitedFromDB(days, limit = 5) {
  const startTime = performance.now();
  const startDbTime = performance.now();
  const stats = { dbTime: 0, apiTime: 0, fromCache: true };
  let fromCache = true;
  
  const startTimeMs = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  try {
    // Try to get from DB first
    const transaction = db.transaction(["visitDetails"], "readonly");
    const visitsStore = transaction.objectStore("visitDetails");
    const index = visitsStore.index("visitTime");
    
    const range = IDBKeyRange.lowerBound(startTimeMs);
    
    const requestPromise = new Promise((resolve, reject) => {
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        const dbEndTime = performance.now();
        stats.dbTime = (dbEndTime - startDbTime) / 1000;
        resolve(request.result);
      };
      
      request.onerror = event => {
        reject(event.target.error);
      };
    });
    
    let visits = await requestPromise;
    
    // If no results, fetch from API
    if (!visits || visits.length === 0) {
      fromCache = false;
      const apiStartTime = performance.now();
      
      // Get from Firefox History API
      const historyItems = await browser.history.search({
        text: "",
        startTime: startTimeMs,
        maxResults: 999999
      });
      
      // Process each item
      visits = [];
      for (const item of historyItems) {
        const itemVisits = await browser.history.getVisits({ url: item.url });
        visits.push(...itemVisits.map(v => ({ ...v, url: item.url })));
        
        // Store for next time
        await storeHistoryItems([item]);
        await storeVisitDetails(item.url, itemVisits);
      }
      
      const apiEndTime = performance.now();
      stats.apiTime = (apiEndTime - apiStartTime) / 1000;
    }
    
    // Process the visits into domain counts
    const domainCounts = new Map();
    
    visits.forEach(visit => {
      try {
        const domain = extractDomain(visit.url);
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      } catch (error) {
        console.error("Error processing URL:", visit.url, error);
      }
    });
    
    // Format and sort results
    const sortedDomains = Array.from(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(item => ({ url: item[0], count: item[1] }));
    
    stats.fromCache = fromCache;
    const endTime = performance.now();
    
    return {
      data: sortedDomains,
      stats: stats,
      totalTime: (endTime - startTime) / 1000
    };
  } catch (error) {
    console.error("Error in getMostVisitedFromDB:", error);
    throw error;
  }
}

// Similarly modify getVisitDetailsFromDB
async function getVisitDetailsFromDB(url) {
  const startTime = performance.now();
  const startDbTime = performance.now();
  const stats = { dbTime: 0, apiTime: 0, fromCache: true };
  let fromCache = true;
  
  try {
    // Try to get from DB first
    const transaction = db.transaction(["visitDetails"], "readonly");
    const visitsStore = transaction.objectStore("visitDetails");
    const index = visitsStore.index("url");
    
    const requestPromise = new Promise((resolve, reject) => {
      const request = index.getAll(url);
      
      request.onsuccess = () => {
        const dbEndTime = performance.now();
        stats.dbTime = (dbEndTime - startDbTime) / 1000;
        resolve(request.result);
      };
      
      request.onerror = event => {
        console.error("Error getting visit details from DB:", event.target.error);
        reject(event.target.error);
      };
    });
    
    let results = await requestPromise;
    
    // If no results, fetch from API
    if (!results || results.length === 0) {
      fromCache = false;
      const apiStartTime = performance.now();
      
      // Get from Firefox History API
      const visits = await browser.history.getVisits({ url: url });
      
      // Store for next time
      await storeVisitDetails(url, visits);
      
      results = visits;
      const apiEndTime = performance.now();
      stats.apiTime = (apiEndTime - apiStartTime) / 1000;
    }
    
    stats.fromCache = fromCache;
    const endTime = performance.now();
    
    return {
      data: results,
      stats: stats,
      totalTime: (endTime - startTime) / 1000
    };
  } catch (error) {
    console.error("Error in getVisitDetailsFromDB:", error);
    throw error;
  }
}

// Store category for a URL
async function storeCategory(url, category) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["categories"], "readwrite");
    const categoriesStore = transaction.objectStore("categories");
    
    const request = categoriesStore.put({
      url: url,
      category: category
    });
    
    request.onsuccess = () => {
      resolve(true);
    };
    
    request.onerror = event => {
      reject(event.target.error);
    };
  });
}

// Get category for a URL
async function getCategoryFromDB(url) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["categories"], "readonly");
    const categoriesStore = transaction.objectStore("categories");
    
    const request = categoriesStore.get(url);
    
    request.onsuccess = () => {
      resolve(request.result ? request.result.category : null);
    };
    
    request.onerror = event => {
      reject(event.target.error);
    };
  });
}

// Listen for new history items and add them to the database
browser.history.onVisited.addListener(async historyItem => {
  try {
    await storeHistoryItems([historyItem]);
    const visits = await browser.history.getVisits({ url: historyItem.url });
    await storeVisitDetails(historyItem.url, visits);
    console.log(`Updated database with new visit: ${historyItem.url}`);
    
    // Here I think the zero-shot classifier would be called 
  } catch (error) {
    console.error("Error handling history event:", error);
  }
});

// Update the message handler to return the stats
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getHistory") {
    getHistoryFromDB(message.days)
      .then(result => sendResponse({ 
        success: true, 
        data: result.data,
        stats: result.stats
      }))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.toString() 
      }));
    return true; // Required for asynchronous sendResponse
  }
  else if (message.action === "getVisits") {
    getVisitDetailsFromDB(message.url)
      .then(result => sendResponse({ 
        success: true, 
        data: result.data,
        stats: result.stats
      }))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.toString() 
      }));
    return true;
  }
  else if (message.action === "getMostVisited") {
    getMostVisitedFromDB(message.days, message.limit)
      .then(result => sendResponse({ 
        success: true, 
        data: result.data,
        stats: result.stats
      }))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.toString() 
      }));
    return true;
  }
});

// Initialize database and fetch initial history
initDB()
  .then(() => {
    console.log("Starting initial history fetch...");
    return fetchAndStoreHistory(30); // Fetch past 30 days by default
  })
  .then(() => {
    console.log("Initial history fetch completed");
  })
  .catch(error => {
    console.error("Error during initialization:", error);
  });