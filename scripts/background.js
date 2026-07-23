/**
 * Indeed SpeedFill - Background Service Worker (Manifest V3)
 * Handles Hotkey commands, Browser Notifications, and extension communication
 */

const notificationTabMap = new Map();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'notify_captcha' && sender.tab) {
    const tabId = sender.tab.id;
    const windowId = sender.tab.windowId;
    const notifId = `captcha_notif_${tabId}_${Date.now()}`;

    notificationTabMap.set(notifId, { tabId, windowId });

    if (chrome.notifications) {
      chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADhJREFUeJztwQENAAAAwqD3T20PBxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwG048AABpWc2swAAAABJRU5ErkJggg==',
        title: '🤖 Indeed SpeedFill - CAPTCHA Required!',
        message: 'A job application tab requires CAPTCHA verification. Click to switch to this tab.',
        priority: 2,
        requireInteraction: true
      });
    }

    sendResponse({ status: 'notified' });
    return true;
  }
});

// Handle notification click to switch directly to the CAPTCHA tab
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notifId) => {
    const target = notificationTabMap.get(notifId);
    if (target) {
      chrome.tabs.update(target.tabId, { active: true });
      chrome.windows.update(target.windowId, { focused: true });
      chrome.notifications.clear(notifId);
      notificationTabMap.delete(notifId);
    }
  });
}

// Listen for keyboard command triggers (Alt+F)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'fill_form') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'trigger_autofill' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[SpeedFill Background] Message error:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
});

// Set default profile on extension installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['userProfile'], (result) => {
    if (!result.userProfile) {
      fetch(chrome.runtime.getURL('data/default_profile.json'))
        .then(res => res.json())
        .then(data => {
          chrome.storage.local.set({ userProfile: data }, () => {
            console.log('[SpeedFill Background] Default profile initialized.');
          });
        })
        .catch(err => console.error('[SpeedFill Background] Install init error:', err));
    }
  });
});
