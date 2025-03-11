// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const historyList = document.getElementById('history-list');
  const loadingMessage = document.getElementById('loading-message');

  async function renderHistory() {
    loadingMessage.style.display = 'block';
    loadingMessage.textContent = '⏳ Loading history...';
    historyList.innerHTML = '';

    try {
      // Fetch stored history
      const {historyLoading, historyData} = await browser.storage.local.get([
        'historyLoading',
        'historyData',
      ]);

      if (historyLoading) {
        return; // If still loading, keep the message
      }

      if (!historyData || historyData.length === 0) {
        loadingMessage.style.display = 'none';
        historyList.innerHTML = '<li>No browsing history available.</li>';
        return;
      }

      // Hide the loading message and display history
      loadingMessage.style.display = 'none';

      // Group and display domain visits
      const domainGroups = {};
      historyData.forEach((item) => {
        let domain;
        try {
          domain = new URL(item.url).hostname;
        } catch (e) {
          domain = item.url; // Fallback if parsing fails
        }
        if (!domainGroups[domain]) {
          domainGroups[domain] = {
            domain,
            category: item.category || 'Uncategorized',
            visitCount: 0,
          };
        }
        domainGroups[domain].visitCount++;
      });

      Object.values(domainGroups)
        .sort((a, b) => b.visitCount - a.visitCount)
        .forEach((group) => {
          const li = document.createElement('li');

          // Handle both string and array categories
          const categoryDisplay = Array.isArray(group.category)
            ? group.category.join(', ')
            : group.category;

          li.innerHTML = `
            <strong>${group.domain}</strong> 
            (${group.visitCount} visits) 
            - <em>${categoryDisplay}</em>
        `;
          historyList.appendChild(li);
        });
    } catch (err) {
      console.error('❌ Error rendering history:', err);
      loadingMessage.textContent = '❌ Error loading history.';
    }
  }

  // Initial load when the popup opens
  renderHistory();

  // Refresh automatically when storage updates
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.historyData || changes.historyLoading)) {
      renderHistory();
    }
  });
});
