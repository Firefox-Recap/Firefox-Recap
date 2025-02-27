//Note that if the user visits a site while using the extention this wont reflect until it renders again. 
// Utilitly fucntions
function daysAgoToTimestamp(days) {
  // 24 hours * 60 minutes * 60 seconds * 1000 ms
  return Date.now() - (days * 24 * 60 * 60 * 1000);
}


function formatVisitTime(timestamp) {
  if (!timestamp) return "Unknown time";
  return new Date(timestamp).toLocaleString();
}
// LLM helped me make this debounce function
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// LLM helped me make this isSafeUrl function it basically makes sure the url is valid
function isSafeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch (e) {
    return false;
  }
}

const entryCache = new Map();
const CACHE_SIZE_LIMIT = 50;

// Makes a loading indicator LLM helped me make this
function showLoading(element) {
  const loader = document.createElement('div');
  loader.className = 'loading-indicator';
  loader.textContent = 'Loading...';
  
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  
  if (element) element.appendChild(loader);
  return () => {
    if (element && element.contains(loader)) element.removeChild(loader);
  };
}

// Replace the displayHistory function to use background script
// LLM came up with this performance stuff i dont really know how accurate this is but o well.
async function displayHistory(days) {
  const startTime = performance.now();
  console.log(`[Performance] Starting history display for past ${days} days...`);
  const historyList = document.getElementById('historyList');
  const performanceStats = document.getElementById('performanceStats');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const buttons = document.querySelectorAll('button');

  // Disable buttons and show loading
  buttons.forEach(btn => btn.disabled = true);
  loadingIndicator.style.display = 'block';
  performanceStats.textContent = '';
  
  let results = [];

  try {
    // Clear old content
    while (historyList.firstChild) {
      historyList.removeChild(historyList.firstChild);
    }
    
    console.log(`[Performance] Fetching history data...`);
    const fetchStartTime = performance.now();
    // Use background script and get the information from the sql database not from the API
    const response = await getHistoryFromBackgroundScript(days);
    const fetchEndTime = performance.now();
    const fetchTime = (fetchEndTime - fetchStartTime) / 1000;
    console.log(`[Performance] History fetch completed in ${fetchTime.toFixed(2)}s`);
    
    results = response.data;
    const dbStats = response.stats;
    
    if (!results || results.length === 0) {
      const message = document.createElement('p');
      message.textContent = `No history in the past ${days} day(s).`;
      historyList.appendChild(message);
      return;
    }
    
    console.log(`[Performance] Received ${results.length} history entries`);
    console.log(`[Performance] Building UI controls...`);
    const uiStartTime = performance.now();
    
    // Create container for navigation controls
    const controlsContainer = document.createElement('div');
    controlsContainer.classList.add('navigation-controls');
    
    // Display total entries count
    const totalEntries = document.createElement('p');
    totalEntries.innerHTML = `<strong>Total entries: ${results.length}</strong>`;
    controlsContainer.appendChild(totalEntries);
    
    // Create input for entry index
    const indexInputContainer = document.createElement('div');
    indexInputContainer.classList.add('input-container');
    
    const indexLabel = document.createElement('label');
    indexLabel.textContent = 'Enter entry number (1-' + results.length + '): ';
    indexLabel.setAttribute('for', 'entryIndex');
    
    const indexInput = document.createElement('input');
    indexInput.type = 'number';
    indexInput.id = 'entryIndex';
    indexInput.min = 1;
    indexInput.max = results.length;
    indexInput.value = 1;
    
    const viewButton = document.createElement('button');
    viewButton.textContent = 'View Entry';
    viewButton.addEventListener('click', () => {
      const index = parseInt(indexInput.value, 10) - 1; // Convert to 0-based index
      if (index >= 0 && index < results.length) {
        displayHistoryEntry(results[index], index);
      }
    });
    
    indexInputContainer.appendChild(indexLabel);
    indexInputContainer.appendChild(indexInput);
    indexInputContainer.appendChild(viewButton);
    controlsContainer.appendChild(indexInputContainer);
    
    // Create div for displaying the selected entry
    const entryContainer = document.createElement('div');
    entryContainer.id = 'selectedEntry';
    
    historyList.appendChild(controlsContainer);
    historyList.appendChild(entryContainer);
    
    const uiEndTime = performance.now();
    const uiTime = (uiEndTime - uiStartTime) / 1000;
    console.log(`[Performance] UI controls built in ${uiTime.toFixed(2)}s`);
    
    // Fix: Use index 0 instead of -1 (results[-1] is undefined)
    console.log(`[Performance] Displaying first history entry...`);
    displayHistoryEntry(results[0], 0);

    // Replace the current indexInput event listener with:
    indexInput.addEventListener('input', debounce(() => {
      const index = parseInt(indexInput.value, 10) - 1;
      if (index >= 0 && index < results.length) {
        console.log(`[Performance] Displaying history entry at index ${index}`);
        displayHistoryEntry(results[index], index);
      }
    }, 300));
    
    // Remove or keep the button if you want both options
    viewButton.addEventListener('click', () => {
      const index = parseInt(indexInput.value, 10) - 1;
      if (index >= 0 && index < results.length) {
        console.log(`[Performance] Displaying history entry at index ${index} (button click)`);
        displayHistoryEntry(results[index], index);
      }
    });

    const endTime = performance.now();
    const timeElapsed = (endTime - startTime) / 1000; // Convert to seconds
    
    // Calculate the cache status label
    const cacheStatus = dbStats.fromCache ? 
      '<span class="cache-hit">✅ Cache hit</span>' : 
      '<span class="cache-miss">⚠️ Cache miss</span>';
    
    // Update performance stats in UI with both frontend and backend stats
    performanceStats.innerHTML = `
      <strong>Performance Report:</strong><br>
      📊 Total entries: ${results.length}<br>
      ⏱️ Total frontend time: ${timeElapsed.toFixed(2)} seconds<br>
      🗄️ Database access time: ${dbStats.dbTime.toFixed(2)} seconds<br>
      📡 API fetch time: ${dbStats.apiTime.toFixed(2) || '0.00'} seconds<br>
      💾 Cache status: ${cacheStatus}<br>
    `;
    
    // Log comprehensive stats to console
    console.log(`[Performance] ===== History Display Summary =====`);
    console.log(`[Performance] Total entries: ${results.length}`);
    console.log(`[Performance] Total frontend time: ${timeElapsed.toFixed(2)}s`);
    console.log(`[Performance] Database access time: ${dbStats.dbTime.toFixed(2)}s`);
    console.log(`[Performance] API fetch time: ${(dbStats.apiTime || 0).toFixed(2)}s`);
    console.log(`[Performance] UI build time: ${uiTime.toFixed(2)}s`);
    console.log(`[Performance] Cache status: ${dbStats.fromCache ? 'HIT' : 'MISS'}`);
    console.log(`[Performance] =================================`);
    
  } catch (error) {
    console.error('[Performance] Error in displayHistory:', error);
    historyList.innerHTML = `<p style="color: red;">Error loading history: ${error.message}</p>`;
  } finally {
    // Re-enable buttons and hide loading
    buttons.forEach(btn => btn.disabled = false);
    loadingIndicator.style.display = 'none';
  }
}

// Add this new function to display a single history entry makes performace much better than rendering the whole list massive improvement
async function displayHistoryEntry(item, index) {
  const startTime = performance.now();
  const cacheKey = `${item.url}-${index}`;
  const entryContainer = document.getElementById('selectedEntry');
  entryContainer.innerHTML = '';
  
  let cacheHit = false;
  
  // Check if we already rendered this entry stores from cache
  if (entryCache.has(cacheKey)) {
    console.log(`[Performance] Cache HIT for entry ${index}: ${item.url.substring(0, 50)}...`);
    cacheHit = true;
    entryContainer.appendChild(entryCache.get(cacheKey).cloneNode(true));
    console.log(`[Performance] Entry rendered from cache in ${((performance.now() - startTime)/1000).toFixed(3)}s`);
    return;
  }
  
  console.log(`[Performance] Cache MISS for entry ${index}: ${item.url.substring(0, 50)}...`);
  
  const entryDiv = document.createElement('div');
  entryDiv.classList.add('history-item');

  const basicInfo = document.createElement('div');
  const lastVisitStr = item.lastVisitTime
    ? formatVisitTime(item.lastVisitTime)
    : "Unknown";
    
  // Build the basic info section
  const indexSpan = document.createElement('strong');
  indexSpan.textContent = `${index + 1}.`;
  basicInfo.appendChild(indexSpan);
  basicInfo.appendChild(document.createTextNode(' '));
  
  const link = document.createElement('a');
  if (isSafeUrl(item.url)) {
    link.href = item.url;
    link.target = "_blank";
  } else {
    link.href = "#";
    link.title = "URL is not valid";
    link.style.textDecoration = "line-through";
    link.style.color = "red";
  }
  link.textContent = item.url;
  basicInfo.appendChild(link);
  
  basicInfo.appendChild(document.createElement('br'));
  
  basicInfo.appendChild(document.createTextNode(`Title: ${item.title || 'No title'}`));
  basicInfo.appendChild(document.createElement('br'));
  
  basicInfo.appendChild(document.createTextNode(`Last Visit: ${lastVisitStr}`));
  basicInfo.appendChild(document.createElement('br'));
  
  basicInfo.appendChild(document.createTextNode(
    `visitCount: ${item.visitCount || 0}, typedCount: ${item.typedCount || 0}`
  ));
  
  entryDiv.appendChild(basicInfo);

  // Show loading state for visit details
  const visitsContainer = document.createElement('div');
  visitsContainer.id = `visits-${index}`;
  entryDiv.appendChild(visitsContainer);
  entryContainer.appendChild(entryDiv);
  
  const hideLoading = showLoading(visitsContainer);
  const visitsStartTime = performance.now();

  try {
    console.log(`[Performance] Fetching visit details for ${item.url.substring(0, 50)}...`);
    const visitResponse = await getVisitsFromBackgroundScript(item.url);
    const visitsEndTime = performance.now();
    console.log(`[Performance] Visit details fetch completed in ${((visitsEndTime - visitsStartTime)/1000).toFixed(2)}s`);
    
    const visits = visitResponse.data;
    
    // Clear loading indicator
    hideLoading();
    
    if (visits && visits.length > 0) {
      console.log(`[Performance] Rendering ${visits.length} visit details...`);
      const renderStartTime = performance.now();
      
      const visitsHeader = document.createElement('div');
      visitsHeader.textContent = 'Visit Details:';
      visitsHeader.style.marginTop = '0.3em';
      entryDiv.appendChild(visitsHeader);
      
      visits.forEach((visit, vIndex) => {
        const visitTimeStr = formatVisitTime(visit.visitTime);
        const visitDiv = document.createElement('div');
        visitDiv.style.marginLeft = '1em';
        
        // Replace innerHTML with DOM manipulation llm told me to do this 
        visitDiv.appendChild(document.createTextNode(`${vIndex + 1}. visitId: ${visit.visitId}`));
        visitDiv.appendChild(document.createElement('br'));
        
        visitDiv.appendChild(document.createTextNode(`visitTime: ${visitTimeStr}`));
        visitDiv.appendChild(document.createElement('br'));
        
        visitDiv.appendChild(document.createTextNode(`referringVisitId: ${visit.referringVisitId}`));
        visitDiv.appendChild(document.createElement('br'));
        
        visitDiv.appendChild(document.createTextNode(`transition: ${visit.transition}`));
        
        entryDiv.appendChild(visitDiv);
      });
      
      const renderEndTime = performance.now();
      console.log(`[Performance] Visit details rendered in ${((renderEndTime - renderStartTime)/1000).toFixed(2)}s`);
    } else {
      visitsContainer.textContent = 'No detailed visit information available.';
    }
  } catch (err) {
    // Clear loading indicator on error
    hideLoading();
    
    console.error(`[Performance] Error fetching visits for ${item.url}:`, err);
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.textContent = `Error loading visit details: ${err.message}`;
    visitsContainer.appendChild(errorDiv);
  }

  entryContainer.appendChild(entryDiv);
  
  // Store in cache (limit cache size) stores the rendered html in the cache 
  console.log(`[Performance] Storing entry ${index} in cache. Current cache size: ${entryCache.size}`);
  if (entryCache.size >= CACHE_SIZE_LIMIT) {
    // Remove oldest entry
    const firstKey = entryCache.keys().next().value;
    console.log(`[Performance] Cache full, removing oldest entry: ${firstKey}`);
    entryCache.delete(firstKey);
  }
  entryCache.set(cacheKey, entryDiv.cloneNode(true));
  
  const endTime = performance.now();
  console.log(`[Performance] Total time to display entry ${index}: ${((endTime - startTime)/1000).toFixed(2)}s`);
}

// Update displayMostVisited function

async function displayMostVisited(days) {
  const mostVisitedList = document.getElementById('mostVisitedList');
  mostVisitedList.innerHTML = '<p>Loading most visited sites...</p>';
  
  try {
    const response = await getMostVisitedFromBackgroundScript(days, 5);
    mostVisitedList.innerHTML = ''; // Clear loading message
    
    if (!response.data || response.data.length === 0) {
      mostVisitedList.innerHTML = '<p>No data available for this time period.</p>';
      return;
    }
    
    const table = createTable(response.data);
    mostVisitedList.appendChild(table);
    
    const statsDiv = document.createElement('div');
    statsDiv.className = 'performance-stats-small';
    statsDiv.innerHTML = `
      <small>🗄️ DB time: ${response.stats?.dbTime?.toFixed(2) || 'N/A'}s | 
      📡 API time: ${response.stats?.apiTime?.toFixed(2) || 'N/A'}s | 
    `;
    mostVisitedList.appendChild(statsDiv);
  } catch (error) {
    console.error('Error fetching most visited:', error);
    mostVisitedList.innerHTML = `<p style="color: red;">Error loading most visited sites: ${error.message}</p>`;
  }
}

function createTable(data) {
  const table = document.createElement('table');
  table.className = 'table-most-visited';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headerURL = document.createElement('th');
  headerURL.textContent = 'URL';
  const headerVisits = document.createElement('th');
  headerVisits.textContent = 'Number of Visits';

  headerRow.appendChild(headerURL);
  headerRow.appendChild(headerVisits);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  
  // Use DocumentFragment for batch DOM updates LLM told me to do this 
  const fragment = document.createDocumentFragment();
  data.forEach(site => {
      const row = document.createElement('tr');
      const urlCell = document.createElement('td');
      urlCell.textContent = site.url;
      const visitCell = document.createElement('td');
      visitCell.textContent = site.count.toString();
      visitCell.style.textAlign = 'center';

      row.appendChild(urlCell);
      row.appendChild(visitCell);
      fragment.appendChild(row);  // Add to fragment instead of directly to DOM
  });
  
  tbody.appendChild(fragment);  // Single DOM operation
  table.appendChild(tbody);
  return table;
}

//
// Event Listeners for Buttons
//

document.getElementById('dayBtn').addEventListener('click', () => {
  displayHistory(1); // Past Day
  displayMostVisited(1);

});

document.getElementById('weekBtn').addEventListener('click', () => {
  displayHistory(7); // Past Week
  displayMostVisited(7);

});

document.getElementById('monthBtn').addEventListener('click', () => {
  displayHistory(30); // Past Month
  displayMostVisited(30);

});

// Show day by default on load
window.addEventListener('load', () => {
  displayHistory(1);
  displayMostVisited(1);
});

// This function will be used to get the history from the background script
async function getHistoryFromBackgroundScript(days) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage({
      action: "getHistory",
      days: days
    }).then(response => {
      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error));
      }
    }).catch(reject);
  });
}

async function getVisitsFromBackgroundScript(url) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage({
      action: "getVisits",
      url: url
    }).then(response => {
      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error));
      }
    }).catch(reject);
  });
}

async function getMostVisitedFromBackgroundScript(days, limit = 5) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage({
      action: "getMostVisited",
      days: days,
      limit: limit
    }).then(response => {
      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error));
      }
    }).catch(reject);
  });
}
