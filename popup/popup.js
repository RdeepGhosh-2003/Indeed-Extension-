/**
 * Indeed SpeedFill - Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const saveBtn = document.getElementById('save-btn');
  const addQaBtn = document.getElementById('add-qa-btn');
  const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
  const qaContainer = document.getElementById('qa-container');
  const toast = document.getElementById('toast');
  const stepDelayInput = document.getElementById('stepDelayMs');
  const stepDelayDisplay = document.getElementById('stepDelayDisplay');

  let currentProfile = {};

  // Slider input listener for live text badge update
  stepDelayInput?.addEventListener('input', (e) => {
    if (stepDelayDisplay) {
      stepDelayDisplay.textContent = `${e.target.value} ms`;
    }
  });

  // Tab Navigation Handler
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Load stored profile into UI
  function loadProfileData() {
    chrome.storage.local.get(['userProfile'], (result) => {
      if (result && result.userProfile) {
        currentProfile = result.userProfile;
        populateForm(currentProfile);
      } else {
        resetToDefaultJson();
      }
    });
  }

  function resetToDefaultJson() {
    fetch(chrome.runtime.getURL('data/default_profile.json'))
      .then(res => res.json())
      .then(data => {
        currentProfile = data;
        chrome.storage.local.set({ userProfile: data }, () => {
          populateForm(data);
          showToast('Profile Reset to Defaults!');
        });
      });
  }

  // Populate HTML inputs from profile object
  function populateForm(profile) {
    // Current Role
    document.getElementById('currentJobTitle').value = profile.work?.currentRole?.jobTitle || profile.work?.recentJobTitle || '';
    document.getElementById('currentCompany').value = profile.work?.currentRole?.company || profile.work?.recentCompany || '';
    document.getElementById('yearsExperience').value = profile.work?.currentRole?.yearsExperience || profile.work?.yearsExperience || '';
    document.getElementById('currentSalary').value = profile.work?.currentRole?.currentSalary || profile.work?.currentSalary || '';

    // Target Role
    document.getElementById('targetJobTitle').value = profile.work?.targetRole?.jobTitle || profile.work?.recentJobTitle || '';
    document.getElementById('targetLocation').value = profile.work?.targetRole?.targetLocation || profile.personal?.city || '';
    document.getElementById('targetResumeName').value = profile.work?.targetRole?.targetResumeName || '';
    document.getElementById('noticePeriod').value = profile.work?.targetRole?.noticePeriod || profile.work?.noticePeriod || '';
    document.getElementById('expectedSalary').value = profile.work?.targetRole?.expectedSalary || profile.work?.expectedSalary || '';

    // Personal
    document.getElementById('fullName').value = profile.personal?.fullName || '';
    document.getElementById('firstName').value = profile.personal?.firstName || '';
    document.getElementById('lastName').value = profile.personal?.lastName || '';
    document.getElementById('email').value = profile.personal?.email || '';
    document.getElementById('phone').value = profile.personal?.phone || '';
    document.getElementById('city').value = profile.personal?.city || '';
    document.getElementById('state').value = profile.personal?.state || '';
    document.getElementById('linkedin').value = profile.personal?.linkedin || '';

    // Education
    document.getElementById('degree').value = profile.education?.degree || '';
    document.getElementById('major').value = profile.education?.major || '';
    document.getElementById('university').value = profile.education?.university || '';
    document.getElementById('graduationYear').value = profile.education?.graduationYear || '';

    // Settings
    document.getElementById('autoFillOnLoad').checked = profile.settings?.autoFillOnLoad !== false;
    document.getElementById('pauseOnUnmatchedFields').checked = profile.settings?.pauseOnUnmatchedFields !== false;
    document.getElementById('autoSelectResume').checked = profile.settings?.autoSelectResume !== false;
    document.getElementById('autoAdvanceStep').checked = profile.settings?.autoAdvanceStep !== false;
    document.getElementById('autoSubmitApplication').checked = profile.settings?.autoSubmitApplication !== false;
    document.getElementById('highlightFilledFields').checked = profile.settings?.highlightFilledFields !== false;

    const delayVal = profile.settings?.stepDelayMs !== undefined ? profile.settings.stepDelayMs : 500;
    if (stepDelayInput) stepDelayInput.value = delayVal;
    if (stepDelayDisplay) stepDelayDisplay.textContent = `${delayVal} ms`;

    // Q&A Bank
    renderQaCards(profile.screening || []);
  }

  // Render Q&A screening cards
  function renderQaCards(screeningList) {
    qaContainer.innerHTML = '';
    screeningList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'qa-card';
      card.innerHTML = `
        <button class="delete-btn" data-index="${index}">✕</button>
        <div class="form-group">
          <label>Question Keywords (comma separated)</label>
          <input type="text" class="qa-keywords" value="${escapeHtml(item.keywords)}" placeholder="e.g. excel, vlookup">
        </div>
        <div class="form-group">
          <label>Pre-Saved Answer</label>
          <input type="text" class="qa-answer" value="${escapeHtml(item.answer)}" placeholder="e.g. Yes, 3+ years experience">
        </div>
      `;
      qaContainer.appendChild(card);
    });

    // Delete event handlers
    qaContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        currentProfile.screening.splice(idx, 1);
        renderQaCards(currentProfile.screening);
      });
    });
  }

  // Add new blank Q&A item
  addQaBtn?.addEventListener('click', () => {
    if (!currentProfile.screening) currentProfile.screening = [];
    currentProfile.screening.push({ keywords: '', answer: '' });
    renderQaCards(currentProfile.screening);
  });

  resetDefaultsBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset profile to defaults (Software Engineer / Acme Corporation)?')) {
      resetToDefaultJson();
    }
  });

  // Extract form input data and save to chrome.storage.local
  saveBtn.addEventListener('click', () => {
    const qaCards = qaContainer.querySelectorAll('.qa-card');
    const updatedScreening = [];
    qaCards.forEach(card => {
      const kw = card.querySelector('.qa-keywords').value;
      const ans = card.querySelector('.qa-answer').value;
      if (kw || ans) {
        updatedScreening.push({ keywords: kw, answer: ans });
      }
    });

    const parsedDelay = parseInt(document.getElementById('stepDelayMs').value, 10);

    const updatedProfile = {
      work: {
        currentRole: {
          jobTitle: document.getElementById('currentJobTitle').value.trim(),
          company: document.getElementById('currentCompany').value.trim(),
          yearsExperience: document.getElementById('yearsExperience').value.trim(),
          currentSalary: document.getElementById('currentSalary').value.trim()
        },
        targetRole: {
          jobTitle: document.getElementById('targetJobTitle').value.trim(),
          targetLocation: document.getElementById('targetLocation').value.trim(),
          targetResumeName: document.getElementById('targetResumeName').value.trim(),
          noticePeriod: document.getElementById('noticePeriod').value.trim(),
          expectedSalary: document.getElementById('expectedSalary').value.trim()
        }
      },
      personal: {
        fullName: document.getElementById('fullName').value.trim(),
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        city: document.getElementById('city').value.trim(),
        state: document.getElementById('state').value.trim(),
        linkedin: document.getElementById('linkedin').value.trim()
      },
      education: {
        degree: document.getElementById('degree').value.trim(),
        major: document.getElementById('major').value.trim(),
        university: document.getElementById('university').value.trim(),
        graduationYear: document.getElementById('graduationYear').value.trim()
      },
      screening: updatedScreening,
      settings: {
        autoFillOnLoad: document.getElementById('autoFillOnLoad').checked,
        pauseOnUnmatchedFields: document.getElementById('pauseOnUnmatchedFields').checked,
        stepDelayMs: isNaN(parsedDelay) ? 500 : parsedDelay,
        autoSelectResume: document.getElementById('autoSelectResume').checked,
        autoAdvanceStep: document.getElementById('autoAdvanceStep').checked,
        autoSubmitApplication: document.getElementById('autoSubmitApplication').checked,
        highlightFilledFields: document.getElementById('highlightFilledFields').checked
      }
    };

    chrome.storage.local.set({ userProfile: updatedProfile }, () => {
      currentProfile = updatedProfile;
      showToast('Profile Saved Successfully!');
    });
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
  }

  // Load Applied Jobs Logs
  function loadLogs() {
    chrome.storage.local.get(['appliedJobs'], (result) => {
      const logs = result.appliedJobs || [];
      document.getElementById('total-applications-count').textContent = logs.length;
      
      const logsContainer = document.getElementById('logs-container');
      logsContainer.innerHTML = '';
      
      if (logs.length === 0) {
        logsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 11px; text-align: center; margin-top: 10px;">No applications tracked yet.</p>';
        return;
      }

      // Show most recent first
      logs.slice().reverse().forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <div class="log-item-header">
            <span class="log-item-title" title="${escapeHtml(log.title)}">${escapeHtml(log.title)}</span>
            <span class="log-item-date">${escapeHtml(log.date)}</span>
          </div>
          <div class="log-item-company">${escapeHtml(log.company)}</div>
        `;
        // Add link on click if url exists
        if (log.url) {
          item.style.cursor = 'pointer';
          item.addEventListener('click', () => chrome.tabs.create({ url: log.url }));
        }
        logsContainer.appendChild(item);
      });
    });
  }

  // Export CSV
  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    chrome.storage.local.get(['appliedJobs'], (result) => {
      const logs = result.appliedJobs || [];
      if (logs.length === 0) {
        showToast('No applications to export!');
        return;
      }

      // Create CSV header
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Date Applied,Company Name,Job Title,Job Link\r\n";

      logs.forEach(log => {
        const date = `"${log.date || ''}"`;
        const company = `"${(log.company || '').replace(/"/g, '""')}"`;
        const title = `"${(log.title || '').replace(/"/g, '""')}"`;
        const url = `"${log.url || ''}"`;
        csvContent += `${date},${company},${title},${url}\r\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Indeed_SpeedFill_Applications_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });

  loadProfileData();
  loadLogs();
});
