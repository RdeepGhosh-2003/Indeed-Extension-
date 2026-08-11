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

    // Skip if disabled, readOnly, manually edited, or already filled
    if (
      el.disabled || 
      el.readOnly || 
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
    if (!targetVal) return false;

    let matchedOption = null;

    for (const option of selectEl.options) {
      const optText = (option.textContent || '').toLowerCase().trim();
      const optVal = (option.value || '').toLowerCase().trim();

      if (!optText && !optVal) continue;

      const matchesText = optText && (optText === targetVal || optText.includes(targetVal) || targetVal.includes(optText));
      const matchesVal = optVal && (optVal === targetVal || optVal.includes(targetVal) || targetVal.includes(optVal));

      if (matchesText || matchesVal) {
        matchedOption = option;
        break;
      }
    }

    if (matchedOption) {
      if (selectEl.value === matchedOption.value) return false;

      const nativeSelectValueSetter = typeof window !== 'undefined' && window.HTMLSelectElement ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set : null;
      if (nativeSelectValueSetter) {
        nativeSelectValueSetter.call(selectEl, matchedOption.value);
      } else {
        selectEl.value = matchedOption.value;
      }

      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
    return false;
  }

  /**
   * Smart Radio Button Group Handler for Location, Commute/Relocation, & Yes/No Screening Questions
   */
  function handleRadioGroups(containerArg) {
    if (!userProfile) return 0;
    const containerEl = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!containerEl) return 0;

    let filledCount = 0;
    const userCity = (userProfile.personal?.city || '').toLowerCase().trim();

    // Find radio group containers within application container
    const containers = containerEl.querySelectorAll('fieldset, [role="radiogroup"], .ia-Questions-item, div[class*="Question"]');

    containers.forEach(container => {
      if (window.SpeedFillMatcher?.isInsideExcludedContainer(container)) return;

      // Find question header text
      const headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="header"]');
      const questionText = headerEl ? headerEl.textContent.toLowerCase().trim() : container.textContent.toLowerCase().trim();

      // Find radio options inside this container
      const radioInputs = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radioInputs.length === 0) return;

      // Skip if any radio input is a non-application input
      if (radioInputs.some(r => window.SpeedFillMatcher?.isNonApplicationInput(r))) return;

      // Skip if a radio option is already selected
      const isAlreadySelected = radioInputs.some(r => r.checked);
      if (isAlreadySelected) return;

      let selectedInput = null;

      // 1. Are you located in [City]?
      if (questionText.includes('are you located in') || questionText.includes('live in') || questionText.includes('based in') || questionText.includes('reside in')) {
        const questionMentionsUserCity = userCity ? questionText.includes(userCity) : false;

        if (questionMentionsUserCity) {
          // User IS located here -> Click "Yes"
          selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('yes'));
        } else {
          // User IS NOT located here -> Click "No"
          selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('no'));
        }
      }

      // 2. Will you be able to reliably commute or relocate to [City]...?
      else if (questionText.includes('commute or relocate') || questionText.includes('relocate') || questionText.includes('commute to')) {
        // Preferred option: "Yes, I am planning to relocate" OR "Yes, I can make the commute"
        selectedInput = radioInputs.find(r => {
          const txt = getRadioText(r, containerEl);
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
              selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('yes'));
            } else if (ans.includes('no') || ans.includes('false')) {
              selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('no'));
            }
            break;
          }
        }
      }

      // Execute click if option found
      if (selectedInput && !selectedInput.checked) {
        console.log('[Indeed SpeedFill] Auto-selecting radio option:', getRadioText(selectedInput, containerEl));
        selectedInput.click();
        selectedInput.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    });

    return filledCount;
  }

  function getRadioText(radio, containerEl) {
    let text = '';
    if (radio.id) {
      const scope = containerEl || document;
      const lbl = scope.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
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
  function handleResumeStep(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return false;

    const isResumeStep = Array.from(appContainer.querySelectorAll('h1, h2, h3, legend, header, div')).some(el => {
      if (window.SpeedFillMatcher?.isNonApplicationInput(el)) return false;
      const txt = el.textContent.toLowerCase().trim();
      return txt.includes('add a resume') || txt.includes('select a resume') || txt.includes('choose a resume');
    });

    if (!isResumeStep) return false;

    // Locate all resume cards within application container
    const resumeCards = Array.from(appContainer.querySelectorAll('[data-testid*="resume"], [class*="ResumeCard"], [class*="resume-option"], div[role="radio"]'));
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
      clearTimeout(window._speedfillAdvanceTimer);
      window._speedfillAdvanceTimer = setTimeout(() => clickContinueButton(appContainer), delay);
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
  function checkUnmatchedUnfilledFields(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return 0;

    const inputs = appContainer.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea, select'
    );

    let unmatchedCount = 0;

    inputs.forEach(el => {
      if ((el.offsetWidth === 0 && el.offsetHeight === 0) || el.disabled || el.readOnly) return;
      if (window.SpeedFillMatcher?.isNonApplicationInput(el)) return;

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
    const radioContainers = appContainer.querySelectorAll('fieldset, [role="radiogroup"], .ia-Questions-item');
    radioContainers.forEach(container => {
      if (window.SpeedFillMatcher?.isInsideExcludedContainer(container)) return;

      const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radios.length > 0) {
        if (radios.some(r => window.SpeedFillMatcher?.isNonApplicationInput(r))) return;

        if (!radios.some(r => r.checked)) {
          unmatchedCount++;
          container.classList.add('speedfill-warning');
        } else {
          container.classList.remove('speedfill-warning');
        }
      }
    });

    return unmatchedCount;
  }

  /**
   * Attach interactive listeners so when user manually fills a missing field, auto-advance triggers instantly!
   */
  function attachInteractiveAutoAdvanceListeners(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return;

    if (appContainer.dataset.speedfillListenersAttached) return;

    appContainer.addEventListener('change', handleUserManualInput);
    appContainer.addEventListener('input', handleUserManualInput);
    appContainer.addEventListener('click', (e) => {
      if (e.target && e.target.tagName && (e.target.tagName.toLowerCase() === 'input' || e.target.type === 'radio')) {
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
      const appContainer = window.SpeedFillMatcher?.getAppContainer() || document;
      
      // Get Question Text
      let headerEl = null;
      if (inputEl && inputEl.type === 'radio') {
        headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="header"]');
      } else {
        headerEl = appContainer.querySelector(`label[for="${CSS.escape(targetInput.id)}"]`) || container.closest('label') || container.previousElementSibling;
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
        answerText = selected ? getRadioText(selected, appContainer) : '';
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
          
          // Trigger manual input check to resume auto-advance
          setTimeout(() => {
            handleUserManualInput();
          }, 300);
        });
      }
    });

    if (inputEl && inputEl.type === 'radio') {
      const header = container.querySelector('legend, h1, h2, h3, h4');
      if (header) {
        header.appendChild(btn);
      } else {
        container.appendChild(btn);
      }
    } else {
      // Safely inject below the input's wrapper to avoid breaking borders
      const wrapper = container.closest('.ia-Questions-item') || container.parentElement;
      if (wrapper && wrapper.nextSibling) {
        wrapper.parentNode.insertBefore(btn, wrapper.nextSibling);
      } else if (wrapper) {
        wrapper.parentNode.appendChild(btn);
      } else {
        container.parentNode.insertBefore(btn, container.nextSibling);
      }
      
      // Ensure the button is styled to sit nicely below
      btn.style.display = 'block';
      btn.style.marginTop = '6px';
      btn.style.marginLeft = '0';
    }
  }

  function handleUserManualInput(e) {
    if (e && e.target && e.target.tagName && !e.target.dataset.speedfillSaveInjected) {
      const el = e.target;
      if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'select') {
        
        // FILTER: Do not inject on global search inputs
        if (window.SpeedFillMatcher?.isSearchInput && window.SpeedFillMatcher.isSearchInput(el)) {
          return;
        }

        // FILTER: If this is a standard recognized field, DO NOT inject the Q&A save button.
        const match = window.SpeedFillMatcher?.matchField(el, userProfile);
        if (match !== null && match !== undefined) {
          return; 
        }

        if (el.type !== 'radio' && el.type !== 'checkbox') {
          if (!el.value) return; // Don't inject if they just cleared it
          injectSaveButton(el);
        } else if (el.type === 'radio') {
          const container = el.closest('fieldset, [role="radiogroup"], .ia-Questions-item, div[class*="Question"], div[class*="FormGroup"]') || el.parentElement.parentElement;
          if (container && !container.dataset.speedfillSaveInjected) {
            injectSaveButton(container, el);
          }
        }
      }
    }

    const appContainer = window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return;

    const remainingUnmatched = checkUnmatchedUnfilledFields(appContainer);
    updatePillStatus(remainingUnmatched, 0);

    // If remaining unmatched fields reach 0, auto-advance step!
    if (remainingUnmatched === 0 && userProfile?.settings?.autoAdvanceStep !== false) {
      const hasUnsaved = appContainer.querySelectorAll('.speedfill-save-btn:not(.saved)').length > 0;
      if (hasUnsaved) {
        console.log('[Indeed SpeedFill] Pausing auto-advance to allow user to save new Q&A.');
        const pill = document.getElementById('speedfill-floating-pill');
        if (pill) {
          pill.classList.add('pill-warning');
          pill.innerHTML = `<span>⏸️ Paused (Save to Resume)</span>`;
        }
        return;
      }

      console.log('[Indeed SpeedFill] All missing fields completed by user! Auto-advancing step...');
      const delay = userProfile?.settings?.stepDelayMs || 500;
      clearTimeout(window._speedfillAdvanceTimer);
      window._speedfillAdvanceTimer = setTimeout(() => clickContinueButton(appContainer), delay);
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
  function clickSubmitButton(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return false;

    const buttons = Array.from(appContainer.querySelectorAll('button, a[role="button"], input[type="submit"]'));
    const submitBtn = buttons.find(b => {
      if (window.SpeedFillMatcher?.isNonApplicationInput(b)) return false;
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
  function extractJobDetailsEarly(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    const scope = appContainer || document;

    const titleEl = scope.querySelector('.ia-JobHeader-title, h1, h2, [class*="jobTitle"]');
    const companyEl = scope.querySelector('.ia-JobHeader-company, [class*="companyName"]');
    
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
  function monitorCaptchaAndSubmit(containerArg) {
    detectCaptchaAndNotify();

    if (window._captchaMonitorInterval) clearInterval(window._captchaMonitorInterval);

    window._captchaMonitorInterval = setInterval(() => {
      detectCaptchaAndNotify();

      const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
      if (!appContainer) return;

      if (userProfile?.settings?.autoSubmitApplication !== false) {
        if (userProfile?.settings?.pauseOnUnmatchedFields !== false) {
          const unmatched = checkUnmatchedUnfilledFields(appContainer);
          if (unmatched > 0) return;
        }

        const submitted = clickSubmitButton(appContainer);
        if (submitted) {
          clearInterval(window._captchaMonitorInterval);
        }
      }
    }, 100); // Super-fast 100ms interval for lightning fast auto-submit
  }

  /**
   * Find and trigger the "Continue" or "Next" button in Indeed wizard modal
   */
  function clickContinueButton(containerArg) {
    clearTimeout(window._speedfillAdvanceTimer);
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return false;

    const buttons = Array.from(appContainer.querySelectorAll('button, a[role="button"]'));
    const continueBtn = buttons.find(b => {
      if (window.SpeedFillMatcher?.isNonApplicationInput(b)) return false;
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

    const appContainer = window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) {
      console.log('[Indeed SpeedFill] No active application container detected. Auto-fill standing by.');
      return 0;
    }

    // Attempt to parse job details at every step before they disappear
    extractJobDetailsEarly(appContainer);

    // 1. Check for Resume step
    const handledResume = handleResumeStep(appContainer);

    let filledCount = 0;

    // 2. Smart radio button groups auto-fill
    filledCount += handleRadioGroups(appContainer);

    // 3. Scan for text inputs, email, tel, number, textarea
    const inputs = appContainer.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea'
    );

    inputs.forEach(input => {
      if (input.offsetWidth === 0 && input.offsetHeight === 0) return;
      if (window.SpeedFillMatcher?.isNonApplicationInput(input)) return;

      const match = window.SpeedFillMatcher?.matchField(input, userProfile);
      if (match && match.value) {
        const success = setReactInputValue(input, match.value);
        if (success) filledCount++;
      }
    });

    // 4. Scan for select dropdowns
    const selects = appContainer.querySelectorAll('select');
    selects.forEach(select => {
      if (select.offsetWidth === 0 && select.offsetHeight === 0) return;
      if (window.SpeedFillMatcher?.isNonApplicationInput(select)) return;

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
    attachInteractiveAutoAdvanceListeners(appContainer);

    // 5. Check for unfilled unmatched fields that require user input
    const unmatchedCount = checkUnmatchedUnfilledFields(appContainer);
    updatePillStatus(unmatchedCount, filledCount);

    const stepDelay = userProfile?.settings?.stepDelayMs !== undefined ? userProfile.settings.stepDelayMs : 150;

    // 6. PAUSE AUTO-ADVANCE / SUBMIT if there are unmatched empty fields and feature is enabled
    if (unmatchedCount > 0 && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      console.log(`[Indeed SpeedFill] Pausing auto-advance: ${unmatchedCount} field(s) need manual input/dashboard entry.`);
      return filledCount;
    }

    // 7. Check for auto-submit & monitor CAPTCHA resolution
    if (userProfile?.settings?.autoSubmitApplication !== false) {
      setTimeout(() => clickSubmitButton(appContainer), stepDelay);
      monitorCaptchaAndSubmit(appContainer);
    }

    // 8. Optionally auto-advance intermediate steps
    if ((userProfile?.settings?.autoAdvanceStep !== false || handledResume) && (filledCount > 0 || handledResume)) {
      const hasUnsaved = appContainer.querySelectorAll('.speedfill-save-btn:not(.saved)').length > 0;
      if (!hasUnsaved) {
        clearTimeout(window._speedfillAdvanceTimer);
        window._speedfillAdvanceTimer = setTimeout(() => clickContinueButton(appContainer), stepDelay);
      } else {
        const pill = document.getElementById('speedfill-floating-pill');
        if (pill) {
          pill.classList.add('pill-warning');
          pill.innerHTML = `<span>⏸️ Paused (Save to Resume)</span>`;
        }
      }
    }

    return filledCount;
  }

  /**
   * Inject or remove the "Search Fill" button based on domain and search bar presence
   */
  function injectSearchFillButton() {
    const hostname = (typeof window !== 'undefined' && window.location) ? (window.location.hostname || '') : '';
    const isIndeed = window.SpeedFillMatcher?.isIndeedPage
      ? window.SpeedFillMatcher.isIndeedPage(hostname)
      : (hostname && hostname.includes('indeed.com'));

    // Restrict injection strictly to indeed.com pages
    if (!isIndeed) {
      removeSearchFillButton();
      return null;
    }

    // Find search bar container
    const searchContainer = window.SpeedFillMatcher?.findSearchContainer
      ? window.SpeedFillMatcher.findSearchContainer()
      : document.querySelector('#jobsearch, form[role="search"]');

    // If search bar container is absent in DOM, remove/hide injected button
    if (!searchContainer) {
      removeSearchFillButton();
      return null;
    }

    // Check if button already exists
    let existingBtn = document.getElementById('indeed-search-fill-btn');
    if (existingBtn) {
      if (!searchContainer.contains(existingBtn) && existingBtn.parentElement !== searchContainer.parentElement) {
        positionSearchFillButton(existingBtn, searchContainer);
      }
      return existingBtn;
    }

    // Create new button element
    const btn = document.createElement('button');
    btn.id = 'indeed-search-fill-btn';
    btn.className = 'indeed-search-fill-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Search Fill');

    // Indeed logo SVG inline + text
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M11.566 21.996h-3.23V9.771h3.23v12.225zM9.951 7.828c-1.104 0-1.999-.895-1.999-2 0-1.105.895-2 1.999-2 1.105 0 2 .895 2 2 0 1.105-.895 2-2 2zm11.615 14.168h-3.23v-6.381c0-1.782-.638-2.997-2.234-2.997-1.22 0-1.946.82-2.266 1.613-.117.283-.146.678-.146 1.074v6.691h-3.23s.043-11.076 0-12.225h3.23v1.731c.429-.661 1.196-1.603 2.91-1.603 2.124 0 3.716 1.388 3.716 4.373v7.724z"/></svg><span>Search Fill</span>`;

    btn.addEventListener('click', handleSearchFillClick);

    positionSearchFillButton(btn, searchContainer);
    return btn;
  }

  function positionSearchFillButton(btn, searchContainer) {
    if (!btn || !searchContainer) return;
    
    // Place our button exactly to the right of the search container's outer border
    searchContainer.insertAdjacentElement('afterend', btn);

    // If the parent isn't naturally flowing horizontally, encourage it
    if (searchContainer.parentElement && window.getComputedStyle(searchContainer.parentElement).display !== 'flex') {
      searchContainer.parentElement.style.display = 'flex';
      searchContainer.parentElement.style.alignItems = 'center';
      searchContainer.parentElement.style.gap = '8px';
    }
  }

  function removeSearchFillButton() {
    const existingBtn = document.getElementById('indeed-search-fill-btn');
    if (existingBtn && existingBtn.parentNode) {
      existingBtn.parentNode.removeChild(existingBtn);
    }
  }

  /**
   * Handle Search Fill button click: read chrome.storage.local userProfile, extract target values, set inputs, dispatch React events
   */
  function handleSearchFillClick(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (result) => {
        const profile = (result && result.userProfile) ? result.userProfile : (result || userProfile);
        executeSearchFill(profile);
      });
    } else {
      executeSearchFill(userProfile);
    }
  }

  /**
   * Execute search fill using extracted profile data and native setters
   */
  function executeSearchFill(profile) {
    const activeProfile = profile || userProfile;
    const { jobTitle, targetLocation } = window.SpeedFillMatcher?.extractSearchFillData
      ? window.SpeedFillMatcher.extractSearchFillData(activeProfile)
      : {
          jobTitle: activeProfile?.work?.targetRole?.jobTitle || activeProfile?.work?.currentRole?.jobTitle || activeProfile?.work?.recentJobTitle || activeProfile?.recentJobTitle || '',
          targetLocation: activeProfile?.work?.targetRole?.targetLocation || activeProfile?.personal?.city || activeProfile?.city || ''
        };

    const { whatInput, whereInput } = window.SpeedFillMatcher?.getSearchInputs
      ? window.SpeedFillMatcher.getSearchInputs(document)
      : {
          whatInput: document.querySelector('#text-input-what, input[name="q"]'),
          whereInput: document.querySelector('#text-input-where, input[name="l"]')
        };

    let filledCount = 0;

    if (whatInput && jobTitle) {
      if (window.SpeedFillMatcher?.setNativeInputValue) {
        window.SpeedFillMatcher.setNativeInputValue(whatInput, jobTitle);
      } else {
        setReactInputValue(whatInput, jobTitle);
      }
      filledCount++;
    }

    if (whereInput && targetLocation) {
      if (window.SpeedFillMatcher?.setNativeInputValue) {
        window.SpeedFillMatcher.setNativeInputValue(whereInput, targetLocation);
      } else {
        setReactInputValue(whereInput, targetLocation);
      }
      filledCount++;
    }

    console.log(`[Indeed SpeedFill] Search Fill executed: ${filledCount} field(s) filled. Title="${jobTitle}", Location="${targetLocation}"`);
    return filledCount;
  }

  /**
   * Setup MutationObserver to watch for step updates in Indeed's modal & search bar
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
        injectSearchFillButton();
        clearTimeout(window._speedfillTimer);
        window._speedfillTimer = setTimeout(() => {
          if (userProfile?.settings?.autoFillOnLoad !== false) {
            const appContainer = window.SpeedFillMatcher?.getAppContainer();
            if (appContainer) {
              fillCurrentForm();
            }
          }
        }, 50); // Aggressive 50ms DOM mutation debounce
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    isObserverActive = true;
  }

  // Listen for hotkey messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'trigger_autofill') {
      const appContainer = window.SpeedFillMatcher?.getAppContainer();
      if (!appContainer) {
        sendResponse({ status: 'no_app_container', filled: 0, submitted: false });
        return;
      }
      const submitted = clickSubmitButton(appContainer);
      handleResumeStep(appContainer);
      const filled = submitted ? 0 : fillCurrentForm();
      clickContinueButton(appContainer);
      sendResponse({ status: 'done', filled, submitted });
    }
  });

  // Extract and save applied job keys when visiting Indeed pages or My Jobs
  function autoExtractAppliedJobs() {
    try {
      const pageText = document.documentElement.outerHTML || '';
      const foundJks = new Set();
      const regexes = [
        /jk=([a-f0-9]{16})/gi,
        /data-jk="([a-f0-9]{16})"/gi,
        /"jobkey":"([a-f0-9]{16})"/gi,
        /"jk":"([a-f0-9]{16})"/gi
      ];
      regexes.forEach(rgx => {
        let match;
        while ((match = rgx.exec(pageText)) !== null) {
          if (match[1]) foundJks.add(match[1]);
        }
      });
      if (foundJks.size > 0) {
        chrome.storage.local.get(['appliedJobs'], (res) => {
          const existing = new Set(res.appliedJobs || []);
          foundJks.forEach(k => existing.add(k));
          chrome.storage.local.set({ appliedJobs: Array.from(existing) });
        });
      }
    } catch(e){}
  }

  // Initialization & Repeated Fill Retries for async React rendering
  loadProfile(() => {
    setupDOMObserver();
    autoExtractAppliedJobs();
    injectSearchFillButton();
    setInterval(injectSearchFillButton, 1000);
    
    setTimeout(fillCurrentForm, 100); // 100ms
    setTimeout(fillCurrentForm, 400); // 400ms
    setTimeout(fillCurrentForm, 1000); // 1s
    monitorCaptchaAndSubmit();
  });

})();
