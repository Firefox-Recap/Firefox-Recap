// Taimur Hasan
function daysAgoToTimestamp(days) {
  // 24 hours * 60 minutes * 60 seconds * 1000 ms
  return Date.now() - (days * 24 * 60 * 60 * 1000);
}

function formatVisitTime(timestamp) {
  if (!timestamp) return "Unknown time";
  return new Date(timestamp).toLocaleString();
}

const historyCache = new Map();

async function getCachedHistory(days) {
  const cacheKey = `history-${days}`;
  if (historyCache.has(cacheKey)) {
    return historyCache.get(cacheKey);
  }
  
  const results = await browser.history.search({
    text: "",
    startTime: daysAgoToTimestamp(days),
    maxResults: 999999
  });
  
  historyCache.set(cacheKey, results);
  return results;
}

// it takes some time to load the information if your history is large

async function displayHistory(days) {
  const startTime = performance.now();
  const historyList = document.getElementById('historyList');
  const performanceStats = document.getElementById('performanceStats');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const buttons = document.querySelectorAll('button');

  // Disable buttons and show loading
  buttons.forEach(btn => btn.disabled = true);
  loadingIndicator.style.display = 'block';
  performanceStats.textContent = '';

  try {
    // Clear old content
    while (historyList.firstChild) {
      historyList.removeChild(historyList.firstChild);
    }
    const results = await getCachedHistory(days);
    if (!results || results.length === 0) {
      const message = document.createElement('p');
      message.textContent = `No history in the past ${days} day(s).`;
      historyList.appendChild(message);
      return;
    }
    //Claude came up with the batch size 
    // Process results in batches to improve performance
    const BATCH_SIZE = 10;
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (item, index) => {
        const entryDiv = document.createElement('div');
        entryDiv.classList.add('history-item');

        const basicInfo = document.createElement('div');
        const lastVisitStr = item.lastVisitTime
          ? formatVisitTime(item.lastVisitTime)
          : "Unknown";
        basicInfo.innerHTML = `
          <strong>${i + index + 1}.</strong> 
          <a href="${item.url}" target="_blank">${item.url}</a><br/>
          Title: ${item.title || 'No title'}<br/>
          Last Visit: ${lastVisitStr}<br/>
          visitCount: ${item.visitCount || 0}, typedCount: ${item.typedCount || 0}
        `;
        entryDiv.appendChild(basicInfo);

        try {
          const visits = await browser.history.getVisits({ url: item.url });
          if (visits && visits.length > 0) {
            const visitsHeader = document.createElement('div');
            visitsHeader.textContent = 'Visit Details:';
            visitsHeader.style.marginTop = '0.3em';
            entryDiv.appendChild(visitsHeader);
            
            visits.forEach((visit, vIndex) => {
              const visitTimeStr = formatVisitTime(visit.visitTime);
              const visitDiv = document.createElement('div');
              visitDiv.style.marginLeft = '1em';
              visitDiv.innerHTML = `
                ${vIndex + 1}. visitId: ${visit.visitId}<br/>
                visitTime: ${visitTimeStr}<br/>
                referringVisitId: ${visit.referringVisitId}<br/>
                transition: ${visit.transition}
              `;
              entryDiv.appendChild(visitDiv);
            });
          }
        } catch (err) {
          console.error(`Error fetching visits for ${item.url}:`, err);
        }

        historyList.appendChild(entryDiv);
        historyList.appendChild(document.createElement('hr'));
      }));
    }

    const endTime = performance.now();
    const timeElapsed = (endTime - startTime) / 1000; // Convert to seconds
    
    // Update performance stats in UI
    performanceStats.innerHTML = `
      <strong>Performance Report:</strong><br>
      📊 Total entries: ${results.length}<br>
      ⏱️ Time taken: ${timeElapsed.toFixed(2)} seconds<br>
      ⚡ Average time per entry: ${(timeElapsed / results.length).toFixed(3)} seconds
    `;
    
  } catch (error) {
    console.error('Error:', error);
    historyList.innerHTML = `<p style="color: red;">Error loading history: ${error.message}</p>`;
  } finally {
    // Re-enable buttons and hide loading
    buttons.forEach(btn => btn.disabled = false);
    loadingIndicator.style.display = 'none';
  }
}

//
// Event Listeners for Buttons
//

document.getElementById('dayBtn').addEventListener('click', () => {
  displayHistory(1); // Past Day
});

document.getElementById('weekBtn').addEventListener('click', () => {
  displayHistory(7); // Past Week
});

document.getElementById('monthBtn').addEventListener('click', () => {
  displayHistory(30); // Past Month
});

// Show day by default on load
window.addEventListener('load', () => {
  displayHistory(1);
});
