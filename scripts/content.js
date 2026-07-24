/**
 * Indeed SpeedFill - Main Content Script
 * Monitors DOM, auto-fills form inputs, dispatches native React events,
 * handles radio groups, CAPTCHA alerts, and interactive auto-advance.
 */

(function() {
  let userProfile = null;
  let isObserverActive = false;
  let hasNotifiedCaptcha = false;
  let originalDocumentTitle = document.title;
  let currentJobTitle = 'Unknown Role';
  let currentCompany = 'Unknown Company';

  // Load user profile from chrome.storage.local
  function loadProfile(callback) {
    chrome.storage.local.get(['userProfile'], (result) => {
      if (result && result.userProfile) {
        userProfile = result.userProfile;
      } else {
        fetch(chrome.runtime.getURL('data/default_profile.json'))
          .then(res => res.json())
          .then(data => {
            userProfile = data;
            chrome.storage.local.set({ userProfile: data });
          })
          .catch(err => console.error('[SpeedFill] Error loading default profile:', err));
      }
      if (callback) callback();
    });
  }

  // Listen for real-time storage changes when user updates profile in popup
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.userProfile) {
      userProfile = changes.userProfile.newValue;
      console.log('[SpeedFill] User profile updated in real-time!');
    }
  });

  /**
   * Inject value into React input control safely
   */
  function setReactInputValue(el, value) {
    if (!el || value === undefined || value === null) return false;

    // Skip if disabled, readOnly, focused, manually edited, or already filled
    if (
      el.disabled || 
      el.readOnly || 
      document.activeElement === el || 
      el.dataset.speedfillUserEdited === 'true' || 
      el.value === String(value)
    ) {
      return false;
    }

    // Attach listener to track manual user edits
    if (!el.dataset.speedfillListenerAttached) {
      el.addEventListener('input', (e) => {
        if (e.isTrusted) {
          el.dataset.speedfillUserEdited = 'true';
        }
      });
      el.dataset.speedfillListenerAttached = 'true';
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const isTextArea = el.tagName.toLowerCase() === 'textarea';
    const setter = isTextArea ? nativeTextAreaValueSetter : nativeInputValueSetter;

    if (setter) {
      setter.call(el, String(value));
    } else {
      el.value = String(value);
    }

    // Dispatch synthetic React state events
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    // Visual emerald feedback glow
    if (userProfile?.settings?.highlightFilledFields !== false) {
      el.classList.remove('speedfill-warning');
      el.classList.add('speedfill-highlight');
      setTimeout(() => el.classList.remove('speedfill-highlight'), 2500);
    }

    return true;
  }

  /**
   * Handle dropdown select elements
   */
  function setSelectValue(selectEl, value) {
    if (!selectEl || !value) return false;
    if (selectEl.disabled || document.activeElement === selectEl || selectEl.dataset.speedfillUserEdited === 'true') {
      return false;
    }

    const targetVal = String(value).toLowerCase().trim();
    let matchedOption = null;

    for (const option of selectEl.options) {
      const optText = option.textContent.toLowerCase().trim();
      const optVal = option.value.toLowerCase().trim();
      if (optText.includes(targetVal) || optVal.includes(targetVal) || targetVal.includes(optText)) {
        matchedOption = option;
        break;
      }
    }

    if (matchedOption) {
      selectEl.value = matchedOption.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
    return false;
  }

  /**
   * Smart Radio Button Group Handler for Location, Commute/Relocation, & Yes/No Screening Questions
   */
  function handleRadioGroups() {
    if (!userProfile) return 0;

    let filledCount = 0;
    const userCity = (userProfile.personal?.city || 'Bengaluru').toLowerCase();
    const isUserBengaluru = userCity.includes('bengaluru') || userCity.includes('bangalore');

    // Find radio group containers
    const containers = document.querySelectorAll('fieldset, [role="radiogroup"], .ia-Questions-item, div[class*="Question"]');

    containers.forEach(container => {
      // Find question header text
      const headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="header"]');
      const questionText = headerEl ? headerEl.textContent.toLowerCase().trim() : container.textContent.toLowerCase().trim();

      // Find radio options inside this container
      const radioInputs = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radioInputs.length === 0) return;

      // Skip if a radio option is already selected
      const isAlreadySelected = radioInputs.some(r => r.checked);
      if (isAlreadySelected) return;

      let selectedInput = null;

      // 1. Are you located in [City]?
      if (questionText.includes('are you located in') || questionText.includes('live in') || questionText.includes('based in') || questionText.includes('reside in')) {
        const questionMentionsUserCity = questionText.includes('bengaluru') || questionText.includes('bangalore') || questionText.includes(userCity);

        if (questionMentionsUserCity) {
          // User IS located here -> Click "Yes"
          selectedInput = radioInputs.find(r => getRadioText(r).includes('yes'));
        } else {
          // User IS NOT located here (e.g. HITEC City, Hyderabad or Ahmedabad) -> Click "No"
          selectedInput = radioInputs.find(r => getRadioText(r).includes('no'));
        }
      }

      // 2. Will you be able to reliably commute or relocate to [City]...?
      else if (questionText.includes('commute or relocate') || questionText.includes('relocate') || questionText.includes('commute to')) {
        // Preferred option: "Yes, I am planning to relocate" OR "Yes, I can make the commute"
        selectedInput = radioInputs.find(r => {
          const txt = getRadioText(r);
          return txt.includes('planning to relocate') || txt.includes('make the commute') || txt.includes('yes');
        });
      }

      // 3. Q&A Bank Matching for other screening questions
      else if (userProfile.screening && Array.isArray(userProfile.screening)) {
        for (const item of userProfile.screening) {
          const keywords = item.keywords.toLowerCase().split(',').map(k => k.trim());
          const match = keywords.some(kw => kw && questionText.includes(kw));
          if (match) {
            const ans = item.answer.toLowerCase();
            if (ans.includes('yes') || ans.includes('true')) {
              selectedInput = radioInputs.find(r => getRadioText(r).includes('yes'));
            } else if (ans.includes('no') || ans.includes('false')) {
              selectedInput = radioInputs.find(r => getRadioText(r).includes('no'));
            }
            break;
          }
        }
      }

      // Execute click if option found
      if (selectedInput && !selectedInput.checked) {
        console.log('[Indeed SpeedFill] Auto-selecting radio option:', getRadioText(selectedInput));
        selectedInput.click();
        selectedInput.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    });

    return filledCount;
  }

  function getRadioText(radio) {
    let text = '';
    if (radio.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      if (lbl) text = lbl.textContent;
    }
    if (!text && radio.closest('label')) {
      text = radio.closest('label').textContent;
    }
    if (!text && radio.parentElement) {
      text = radio.parentElement.textContent;
    }
    return text.toLowerCase().trim();
  }

  /**
   * Handle "Add a resume" step: auto-select existing PDF resume and click Continue
   */
  function handleResumeStep() {
    const isResumeStep = Array.from(document.querySelectorAll('h1, h2, h3, legend, header, div')).some(el => {
      const txt = el.textContent.toLowerCase().trim();
      return txt.includes('add a resume') || txt.includes('select a resume') || txt.includes('choose a resume');
    });

    if (!isResumeStep) return false;

    // Locate all resume cards
    const resumeCards = Array.from(document.querySelectorAll('[data-testid*="resume"], [class*="ResumeCard"], [class*="resume-option"], div[role="radio"]'));
    if (resumeCards.length === 0) return false;

    let targetCard = null;
    const targetResumeName = userProfile?.work?.targetRole?.targetResumeName?.toLowerCase().trim();

    // 1. Try to find a specific resume if user defined one
    if (targetResumeName) {
      targetCard = resumeCards.find(card => card.textContent.toLowerCase().includes(targetResumeName));
    }

    // 2. Fallback to the first resume if no specific target or not found
    if (!targetCard) {
      targetCard = resumeCards[0];
    }

    if (targetCard && !targetCard.classList.contains('selected') && targetCard.getAttribute('aria-checked') !== 'true') {
      console.log('[Indeed SpeedFill] Auto-selecting resume...');
      targetCard.click();
    }

    const delay = userProfile?.settings?.stepDelayMs || 500;
    if (userProfile?.settings?.autoSelectResume !== false || userProfile?.settings?.autoAdvanceStep !== false) {
      setTimeout(clickContinueButton, delay);
      return true;
    }
    return false;
  }

  /**
   * Detect CAPTCHA and send browser notification to user across multi-tab applications
   */
  function detectCaptchaAndNotify() {
    const hasCaptchaElement = document.querySelector('iframe[src*="recaptcha"], iframe[title*="recaptcha"], .g-recaptcha, [class*="captcha"]');
    const hasCaptchaText = document.body.innerText.includes("I'm not a robot") || document.body.innerText.includes("reCAPTCHA");

    if ((hasCaptchaElement || hasCaptchaText) && !hasNotifiedCaptcha) {
      hasNotifiedCaptcha = true;

      // Update tab document title visually
      if (!document.title.includes('🚨 CAPTCHA REQUIRED')) {
        document.title = `🚨 CAPTCHA REQUIRED - ${originalDocumentTitle}`;
      }

      // Notify background service worker to trigger browser notification
      chrome.runtime.sendMessage({ action: 'notify_captcha' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[SpeedFill] Captcha notify error:', chrome.runtime.lastError.message);
        }
      });

      const pill = document.getElementById('speedfill-floating-pill');
      if (pill) {
        pill.classList.add('pill-warning');
        pill.innerHTML = `<span>🤖 CAPTCHA Verification Needed!</span>`;
      }
    }
  }

  /**
   * Check for empty/unfilled inputs on the screen that could NOT be matched with dashboard data
   */
  function checkUnmatchedUnfilledFields() {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea, select'
    );

    let unmatchedCount = 0;

    inputs.forEach(el => {
      if (el.offsetWidth === 0 && el.offsetHeight === 0 || el.disabled || el.readOnly) return;
      if (window.SpeedFillMatcher?.isSearchInput(el)) return;

      const isSelect = el.tagName.toLowerCase() === 'select';
      const isValEmpty = isSelect ? !el.value : !el.value.trim();

      if (isValEmpty) {
        const match = window.SpeedFillMatcher?.matchField(el, userProfile);
        if (!match || !match.value) {
          unmatchedCount++;
          el.classList.add('speedfill-warning');
        }
      } else {
        el.classList.remove('speedfill-warning');
      }
    });

    // Check unfilled radio button groups
    const radioContainers = document.querySelectorAll('fieldset, [role="radiogroup"], .ia-Questions-item');
    radioContainers.forEach(container => {
      const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radios.length > 0 && !radios.some(r => r.checked)) {
        unmatchedCount++;
        container.classList.add('speedfill-warning');
      } else {
        container.classList.remove('speedfill-warning');
      }
    });

    return unmatchedCount;
  }

  /**
   * Attach interactive listeners so when user manually fills a missing field, auto-advance triggers instantly!
   */
  function attachInteractiveAutoAdvanceListeners() {
    const appContainer = document.querySelector('div[role="dialog"], [class*="ia-Form"], form') || document.body;
    if (appContainer.dataset.speedfillListenersAttached) return;

    appContainer.addEventListener('change', handleUserManualInput);
    appContainer.addEventListener('input', handleUserManualInput);
    appContainer.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.type === 'radio') {
        setTimeout(() => handleUserManualInput(e), 100);
      }
    });

    appContainer.dataset.speedfillListenersAttached = 'true';
  }

  function injectSaveButton(container, inputEl = null) {
    if (container.dataset.speedfillSaveInjected) return;
    container.dataset.speedfillSaveInjected = 'true';

    const btn = document.createElement('button');
    btn.className = 'speedfill-save-btn';
    btn.type = 'button';
    btn.innerHTML = '💾 Save to SpeedFill';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const targetInput = inputEl || container;
      
      // Get Question Text
      let headerEl = null;
      if (inputEl && inputEl.type === 'radio') {
        headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="header"]');
      } else {
        headerEl = document.querySelector(`label[for="${CSS.escape(targetInput.id)}"]`) || container.closest('label') || container.previousElementSibling;
      }
      
      let questionText = headerEl ? headerEl.textContent.trim() : '';
      if (!questionText && container.parentElement) questionText = container.parentElement.innerText.split('\n')[0];
      if (!questionText) questionText = 'Unknown Question';

      // Clean Question
      questionText = questionText.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().substring(0, 30).trim();

      // Get Answer
      let answerText = '';
      if (inputEl && inputEl.type === 'radio') {
        const selected = container.querySelector('input[type="radio"]:checked');
        answerText = selected ? getRadioText(selected) : '';
      } else {
        answerText = targetInput.value;
      }

      if (!answerText) {
        btn.innerHTML = '❌ Empty';
        setTimeout(() => btn.innerHTML = '💾 Save to SpeedFill', 1500);
        return;
      }

      // Save to Storage
      if (userProfile && userProfile.screening) {
        userProfile.screening.push({ keywords: questionText, answer: answerText });
        chrome.storage.local.set({ userProfile: userProfile }, () => {
          btn.innerHTML = '✅ Saved!';
          btn.classList.add('saved');
          btn.disabled = true;
          console.log('[SpeedFill] Saved new Q&A:', questionText, '->', answerText);
        });
      }
    });

    if (inputEl && inputEl.type === 'radio') {
      const header = container.querySelector('legend, h1, h2, h3, h4');
      if (header) header.appendChild(btn);
      else container.appendChild(btn);
    } else {
      container.parentNode.insertBefore(btn, container.nextSibling);
    }
  }

  function handleUserManualInput(e) {
    if (e && e.target && e.target.tagName && !e.target.dataset.speedfillSaveInjected) {
      const el = e.target;
      if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'select') {
        if (el.type !== 'radio' && el.type !== 'checkbox') {
          if (!el.value) return; // Don't inject if they just cleared it
          injectSaveButton(el);
        } else if (el.type === 'radio') {
          const container = el.closest('fieldset, [role="radiogroup"], .ia-Questions-item');
          if (container && !container.dataset.speedfillSaveInjected) {
            injectSaveButton(container, el);
          }
        }
      }
    }

    const remainingUnmatched = checkUnmatchedUnfilledFields();
    updatePillStatus(remainingUnmatched, 0);

    // If remaining unmatched fields reach 0, auto-advance step!
    if (remainingUnmatched === 0 && userProfile?.settings?.autoAdvanceStep !== false) {
      console.log('[Indeed SpeedFill] All missing fields completed by user! Auto-advancing step...');
      const delay = userProfile?.settings?.stepDelayMs || 500;
      setTimeout(clickContinueButton, delay);
    }
  }

  /**
   * Update floating pill widget UI based on fill status & warnings
   */
  function updatePillStatus(unmatchedCount, filledCount) {
    const pill = document.getElementById('speedfill-floating-pill');
    if (!pill) return;

    if (unmatchedCount > 0 && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      pill.classList.add('pill-warning');
      pill.innerHTML = `<span>⚠️ Review Needed (${unmatchedCount} Unfilled)</span>`;
    } else {
      pill.classList.remove('pill-warning');
      pill.innerHTML = `<span>⚡ SpeedFill</span><span class="speedfill-badge">Alt + F</span>`;
    }
  }

  /**
   * Find and click "Submit your application" button as soon as it becomes enabled
   */
  function clickSubmitButton() {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"]'));
    const submitBtn = buttons.find(b => {
      const text = b.textContent.toLowerCase().trim();
      const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('disabled');
      return (
        text.includes('submit your application') ||
        text.includes('submit application')
      ) && !isDisabled;
    });

    if (submitBtn) {
      console.log('[Indeed SpeedFill] Auto-submitting application...');
      chrome.runtime.sendMessage({
        action: 'log_application',
        job: {
          title: currentJobTitle,
          company: currentCompany,
          url: window.location.href.split('?')[0],
          date: new Date().toLocaleDateString() + ', ' + new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })
        }
      });

      submitBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Attempt to extract the job title and company from the DOM
   * Runs continuously to catch the title before the "Review" step hides it
   */
  function extractJobDetailsEarly() {
    const titleEl = document.querySelector('.ia-JobHeader-title, h1, h2, [class*="jobTitle"]');
    const companyEl = document.querySelector('.ia-JobHeader-company, [class*="companyName"]');
    
    if (titleEl && titleEl.textContent) {
      const txt = titleEl.textContent.trim();
      // Ignore generic modal headers
      if (!txt.toLowerCase().includes('review') && !txt.toLowerCase().includes('add a resume') && txt.length > 3) {
        currentJobTitle = txt;
      }
    }
    
    if (companyEl && companyEl.textContent) {
      const txt = companyEl.textContent.trim();
      if (txt.length > 1) {
        currentCompany = txt;
      }
    }

    // Fallback to page title if we still have unknown role
    if (currentJobTitle === 'Unknown Role' || currentCompany === 'Unknown Company') {
      const pageTitle = document.title || '';
      let parsedTitle = pageTitle.replace(' - Indeed', '').replace('Apply for ', '').replace('Apply: ', '').trim();
      
      if (parsedTitle.includes(' at ')) {
        const parts = parsedTitle.split(' at ');
        if (currentCompany === 'Unknown Company') currentCompany = parts.pop().trim();
        if (currentJobTitle === 'Unknown Role') currentJobTitle = parts.join(' at ').trim();
      } else if (parsedTitle.includes(' - ')) {
        const parts = parsedTitle.split(' - ');
        if (currentCompany === 'Unknown Company') currentCompany = parts.pop().trim();
        if (currentJobTitle === 'Unknown Role') currentJobTitle = parts.join(' - ').trim();
      } else if (parsedTitle && !parsedTitle.toLowerCase().includes('job search')) {
        if (currentJobTitle === 'Unknown Role') currentJobTitle = parsedTitle;
      }
    }
  }

  /**
   * Continuous monitor watching for reCAPTCHA checkmark resolution and button enablement
   */
  function monitorCaptchaAndSubmit() {
    detectCaptchaAndNotify();

    if (window._captchaMonitorInterval) clearInterval(window._captchaMonitorInterval);

    window._captchaMonitorInterval = setInterval(() => {
      detectCaptchaAndNotify();

      if (userProfile?.settings?.autoSubmitApplication !== false) {
        if (userProfile?.settings?.pauseOnUnmatchedFields !== false) {
          const unmatched = checkUnmatchedUnfilledFields();
          if (unmatched > 0) return;
        }

        const submitted = clickSubmitButton();
        if (submitted) {
          clearInterval(window._captchaMonitorInterval);
        }
      }
    }, 350);
  }

  /**
   * Find and trigger the "Continue" or "Next" button in Indeed wizard modal
   */
  function clickContinueButton() {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    const continueBtn = buttons.find(b => {
      const text = b.textContent.toLowerCase().trim();
      const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
      return (text === 'continue' || text.includes('continue') || text.includes('next') || text.includes('review your application')) && !isDisabled;
    });

    if (continueBtn) {
      console.log('[Indeed SpeedFill] Auto-advancing step...');
      continueBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Core execution function: scan and fill all visible fields
   */
  function fillCurrentForm() {
    if (!userProfile) {
      loadProfile(() => fillCurrentForm());
      return 0;
    }

    // Attempt to parse job details at every step before they disappear
    extractJobDetailsEarly();

    // 1. Check for Resume step
    const handledResume = handleResumeStep();

    let filledCount = 0;

    // 2. Smart radio button groups auto-fill
    filledCount += handleRadioGroups();

    // 3. Scan for text inputs, email, tel, number, textarea
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea'
    );

    inputs.forEach(input => {
      if (input.offsetWidth === 0 && input.offsetHeight === 0) return;

      // AI Cover Letter Generator Hook
      if (input.tagName.toLowerCase() === 'textarea' && !input.dataset.speedfillAiInjected) {
        const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`) || input.closest('label');
        const lblTxt = lbl ? lbl.textContent.toLowerCase() : '';
        if (lblTxt.includes('cover letter') || lblTxt.includes('message to hiring') || lblTxt.includes('additional information')) {
          injectAICoverLetterButton(input);
        }
      }

      const match = window.SpeedFillMatcher?.matchField(input, userProfile);
      if (match && match.value) {
        const success = setReactInputValue(input, match.value);
        if (success) filledCount++;
      }
    });

    // 4. Scan for select dropdowns
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
      if (select.offsetWidth === 0 && select.offsetHeight === 0) return;

      const match = window.SpeedFillMatcher?.matchField(select, userProfile);
      if (match && match.value) {
        const success = setSelectValue(select, match.value);
        if (success) filledCount++;
      }
    });

    if (filledCount > 0) {
      console.log(`[Indeed SpeedFill] Auto-filled ${filledCount} application field(s).`);
    }

    // Attach manual fill auto-advance listeners
    attachInteractiveAutoAdvanceListeners();

    // 5. Check for unfilled unmatched fields that require user input
    const unmatchedCount = checkUnmatchedUnfilledFields();
    updatePillStatus(unmatchedCount, filledCount);

    const stepDelay = userProfile?.settings?.stepDelayMs || 500;

    // 6. PAUSE AUTO-ADVANCE / SUBMIT if there are unmatched empty fields and feature is enabled
    if (unmatchedCount > 0 && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      console.warn(`[Indeed SpeedFill] Pausing auto-advance: ${unmatchedCount} field(s) need manual input/dashboard entry.`);
      return filledCount;
    }

    // 7. Check for auto-submit & monitor CAPTCHA resolution
    if (userProfile?.settings?.autoSubmitApplication !== false) {
      setTimeout(clickSubmitButton, stepDelay);
      monitorCaptchaAndSubmit();
    }

    // 8. Optionally auto-advance intermediate steps
    if ((userProfile?.settings?.autoAdvanceStep !== false || handledResume) && (filledCount > 0 || handledResume)) {
      setTimeout(clickContinueButton, stepDelay);
    }

    return filledCount;
  }

  /**
   * Setup MutationObserver to watch for step updates in Indeed's modal
   */
  function setupDOMObserver() {
    if (isObserverActive) return;

    const observer = new MutationObserver((mutations) => {
      let shouldFill = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldFill = true;
          break;
        }
      }

      if (shouldFill) {
        clearTimeout(window._speedfillTimer);
        window._speedfillTimer = setTimeout(() => {
          if (userProfile?.settings?.autoFillOnLoad !== false) {
            fillCurrentForm();
          }
        }, 150);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    isObserverActive = true;
  }

  function injectAICoverLetterButton(textarea) {
    if (textarea.dataset.speedfillAiInjected) return;
    textarea.dataset.speedfillAiInjected = 'true';

    const btn = document.createElement('button');
    btn.className = 'speedfill-ai-btn';
    btn.type = 'button';
    btn.innerHTML = '✨ Generate with AI';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!userProfile?.settings?.geminiApiKey) {
        alert('Please add your Gemini API Key in the SpeedFill Settings to use the AI Cover Letter Generator.');
        return;
      }
      
      btn.innerHTML = '⏳ Generating...';
      btn.disabled = true;

      chrome.runtime.sendMessage({
        action: 'generate_cover_letter',
        jobTitle: currentJobTitle,
        company: currentCompany,
        profile: userProfile
      }, (response) => {
        btn.disabled = false;
        if (response && response.text) {
          setReactInputValue(textarea, response.text);
          btn.innerHTML = '✅ Generated!';
          setTimeout(() => btn.innerHTML = '✨ Generate with AI', 3000);
        } else {
          btn.innerHTML = '❌ Failed';
          console.error('[SpeedFill] AI Gen Error:', response?.error);
          alert('Failed to generate cover letter. Check your API key.');
          setTimeout(() => btn.innerHTML = '✨ Generate with AI', 3000);
        }
      });
    });

    textarea.parentNode.insertBefore(btn, textarea);
  }

  /**
   * Create floating widget pill on Indeed page
   */
  function createFloatingPill() {
    if (document.getElementById('speedfill-floating-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'speedfill-floating-pill';
    pill.innerHTML = `
      <span>⚡ SpeedFill</span>
      <span class="speedfill-badge">Alt + F</span>
    `;

    pill.addEventListener('click', () => {
      const submitted = clickSubmitButton();
      if (!submitted) {
        handleResumeStep();
        const count = fillCurrentForm();
        clickContinueButton();
        pill.innerHTML = `<span>✅ SpeedFill Active</span>`;
      } else {
        pill.innerHTML = `<span>🚀 Submitted!</span>`;
      }
      setTimeout(() => {
        const unmatched = checkUnmatchedUnfilledFields();
        updatePillStatus(unmatched, 0);
      }, 1500);
    });

    document.body.appendChild(pill);
  }

  // Listen for hotkey messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'trigger_autofill') {
      const submitted = clickSubmitButton();
      handleResumeStep();
      const filled = submitted ? 0 : fillCurrentForm();
      clickContinueButton();
      sendResponse({ status: 'done', filled, submitted });
    }
  });

  // Initialization & Repeated Fill Retries for async React rendering
  loadProfile(() => {
    setupDOMObserver();
    createFloatingPill();
    
    setTimeout(fillCurrentForm, 300);
    setTimeout(fillCurrentForm, 800);
    setTimeout(fillCurrentForm, 1500);
    monitorCaptchaAndSubmit();
  });

})();
