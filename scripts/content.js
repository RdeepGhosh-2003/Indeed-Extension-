/**
 * Indeed SpeedFill - Main Content Script
 * Monitors DOM, auto-fills form inputs, dispatches native React events,
 * handles radio groups, CAPTCHA alerts, and interactive auto-advance.
 */

(function () {
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
   * Handle dropdown select elements
  /**
   * Handle dropdown select elements with smart fuzzy, degree, notice period & proficiency matching
   */
  function setSelectValue(selectEl, value) {
    if (!selectEl || !value) return false;
    if (selectEl.disabled || document.activeElement === selectEl || selectEl.dataset.speedfillUserEdited === 'true') {
      return false;
    }

    const targetVal = String(value).toLowerCase().trim();
    if (!targetVal) return false;

    let matchedOption = null;

    // 1. Exact or Substring match
    for (const option of selectEl.options) {
      const optText = (option.textContent || '').toLowerCase().trim();
      const optVal = (option.value || '').toLowerCase().trim();
      if (!optText && !optVal) continue;
      // Skip empty or placeholder option values for substring containment checks
      if (optVal === '' && optText.includes('select')) continue;

      const isExactMatch = (optText && optText === targetVal) || (optVal && optVal === targetVal);
      const isSubMatch = (optText && optText.includes(targetVal)) ||
        (optVal && optVal.includes(targetVal)) ||
        (optVal && optVal.length > 2 && targetVal.includes(optVal)) ||
        (optText && optText.length > 3 && !optText.includes('select') && targetVal.includes(optText));

      if (isExactMatch || isSubMatch) {
        matchedOption = option;
        break;
      }
    }

    // 2. Keyword / Token Intersection match (e.g. "Bachelor of Science" matches "Bachelor's Degree")
    if (!matchedOption) {
      const targetTokens = targetVal.split(/\s+/).filter(t => t.length > 2);
      for (const option of selectEl.options) {
        const optText = (option.textContent || '').toLowerCase().trim();
        if (targetTokens.some(tok => optText.includes(tok))) {
          matchedOption = option;
          break;
        }
      }
    }

    // 3. Degree / Qualification Equivalence Match (e.g. "B.Tech" matches "Bachelor's Degree")
    if (!matchedOption && window.SpeedFillMatcher?.normalizeDegreeCategory) {
      const targetCategory = window.SpeedFillMatcher.normalizeDegreeCategory(targetVal);
      if (targetCategory) {
        for (const option of selectEl.options) {
          const optText = (option.textContent || '').toLowerCase().trim();
          if (window.SpeedFillMatcher.normalizeDegreeCategory(optText) === targetCategory) {
            matchedOption = option;
            break;
          }
        }
      }
    }

    // 4. Notice Period Equivalence Match (e.g. "30 Days" matches "1 Month")
    if (!matchedOption && window.SpeedFillMatcher?.normalizeNoticePeriod) {
      const targetNotice = window.SpeedFillMatcher.normalizeNoticePeriod(targetVal);
      if (targetNotice) {
        for (const option of selectEl.options) {
          const optText = (option.textContent || '').toLowerCase().trim();
          if (window.SpeedFillMatcher.normalizeNoticePeriod(optText) === targetNotice) {
            matchedOption = option;
            break;
          }
        }
      }
    }

    // 5. Proficiency Level Match (e.g. "3+ years" matches "Advanced" / "Intermediate")
    if (!matchedOption && window.SpeedFillMatcher?.normalizeProficiencyLevel) {
      const targetProf = window.SpeedFillMatcher.normalizeProficiencyLevel(targetVal);
      if (targetProf) {
        for (const option of selectEl.options) {
          const optText = (option.textContent || '').toLowerCase().trim();
          if (window.SpeedFillMatcher.normalizeProficiencyLevel(optText) === targetProf) {
            matchedOption = option;
            break;
          }
        }
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
   * Smart Radio Button Group Handler for Location, Commute/Relocation, Yes/No, Proficiency, Qualification & Custom Screening Questions
   */
  function handleRadioGroups(containerArg) {
    if (!userProfile) return 0;
    const containerEl = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!containerEl) return 0;

    let filledCount = 0;
    const userCity = (userProfile.personal?.city || '').toLowerCase().trim();

    const containers = containerEl.querySelectorAll('fieldset, [role="radiogroup"], .ia-Questions-item, div[class*="Question"], div[class*="FormGroup"]');

    containers.forEach(container => {
      if (window.SpeedFillMatcher?.isInsideExcludedContainer(container)) return;

      // Extract Question Title
      let questionText = '';
      const cAriaLabelledBy = container.getAttribute('aria-labelledby');
      if (cAriaLabelledBy) {
        const target = document.getElementById(cAriaLabelledBy);
        if (target && target.textContent) questionText = target.textContent.toLowerCase().trim();
      }

      if (!questionText) {
        let headerEl = container.querySelector('legend, h1, h2, h3, h4, [id$="-label"]');
        if (!headerEl) {
          headerEl = Array.from(container.querySelectorAll('[class*="label"], [class*="Label"], [class*="header"], [class*="Header"], [class*="title"], [class*="Title"], [class*="question"], [class*="Question"], p, span'))
            .find(el => !el.querySelector('input[type="radio"]') && !el.closest('label:has(input)'));
        }
        if (headerEl) {
          questionText = headerEl.textContent.toLowerCase().trim();
        } else {
          const clone = container.cloneNode(true);
          clone.querySelectorAll('input, .speedfill-save-btn').forEach(el => el.remove());
          clone.querySelectorAll('label').forEach(lbl => {
            if (lbl.querySelector('input') || lbl.getAttribute('for')) lbl.remove();
          });
          questionText = clone.textContent.toLowerCase().replace(/\s+/g, ' ').trim();
        }
      }

      const radioInputs = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radioInputs.length === 0) return;
      if (radioInputs.some(r => window.SpeedFillMatcher?.isNonApplicationInput(r))) return;
      if (radioInputs.some(r => r.checked)) return;

      let selectedInput = null;

      // 1. Skill Proficiency Rating Questions (e.g. "How would you rate your SQL proficiency?")
      if (!selectedInput && window.SpeedFillMatcher?.isProficiencyQuestion(questionText)) {
        let profLevel = null;

        // Check if screening QA bank has an entry for this skill
        if (userProfile.screening && Array.isArray(userProfile.screening)) {
          const cleanQ = questionText.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
          for (const item of userProfile.screening) {
            if (!item.keywords || !item.answer) continue;
            const kws = item.keywords.toLowerCase().split(/[,/|]/).map(k => k.trim());
            const isMatch = kws.some(kw => kw && (cleanQ.includes(kw) || kw.includes(cleanQ)));
            if (isMatch) {
              profLevel = window.SpeedFillMatcher.normalizeProficiencyLevel(item.answer);
              if (profLevel) break;
            }
          }
        }

        // Fallback to profile default proficiency setting or Intermediate / Advanced
        if (!profLevel) {
          profLevel = window.SpeedFillMatcher?.normalizeProficiencyLevel(userProfile.work?.defaultProficiency || 'Intermediate') || 'intermediate';
        }

        selectedInput = radioInputs.find(r => {
          const optText = getRadioText(r, containerEl);
          return window.SpeedFillMatcher?.normalizeProficiencyLevel(optText) === profLevel;
        }) || radioInputs.find(r => {
          const optText = getRadioText(r, containerEl);
          return optText.includes('intermediate') || optText.includes('advanced') || optText.includes('expert');
        });
      }

      // 2. Location / Residence Questions
      if (!selectedInput && (questionText.includes('are you located in') || questionText.includes('live in') || questionText.includes('based in') || questionText.includes('reside in'))) {
        const questionMentionsUserCity = userCity ? questionText.includes(userCity) : false;
        if (questionMentionsUserCity) {
          selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('yes'));
        } else {
          selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('no'));
        }
      }

      // 3. Commute / Relocation / Office Work / Hybrid Questions
      if (!selectedInput && window.SpeedFillMatcher?.isOfficeOrCommuteQuestion(questionText)) {
        selectedInput = radioInputs.find(r => {
          const txt = getRadioText(r, containerEl);
          return txt.includes('planning to relocate') || txt.includes('make the commute') || txt.includes('yes') || txt === 'yes';
        });
      }

      // 4. Education / Degree Questions (e.g. "What is your highest qualification?")
      if (!selectedInput && (questionText.includes('qualification') || questionText.includes('degree') || questionText.includes('education'))) {
        const userDegree = userProfile.education?.degree || '';
        const targetCategory = window.SpeedFillMatcher?.normalizeDegreeCategory(userDegree);
        if (targetCategory) {
          selectedInput = radioInputs.find(r => {
            const optText = getRadioText(r, containerEl);
            return window.SpeedFillMatcher?.normalizeDegreeCategory(optText) === targetCategory;
          });
        }
      }

      // 5. Notice Period / Availability Questions
      if (!selectedInput && (questionText.includes('notice') || questionText.includes('how soon') || questionText.includes('availability'))) {
        const userNotice = userProfile.work?.targetRole?.noticePeriod || '30 Days';
        const targetNotice = window.SpeedFillMatcher?.normalizeNoticePeriod(userNotice);
        if (targetNotice) {
          selectedInput = radioInputs.find(r => {
            const optText = getRadioText(r, containerEl);
            return window.SpeedFillMatcher?.normalizeNoticePeriod(optText) === targetNotice;
          });
        }
      }

      // 6. Check Standard Profile Field Mappings (e.g. Notice Period, Degree, Years Experience)
      if (!selectedInput) {
        const fieldMatch = window.SpeedFillMatcher?.matchField(container, userProfile);
        if (fieldMatch && fieldMatch.value) {
          const targetVal = String(fieldMatch.value).toLowerCase().trim();
          selectedInput = radioInputs.find(r => {
            const optionText = getRadioText(r, containerEl);
            return optionText === targetVal || optionText.includes(targetVal) || targetVal.includes(optionText);
          });
        }
      }

      // 7. Q&A Bank Matching for other screening questions
      if (!selectedInput && userProfile.screening && Array.isArray(userProfile.screening)) {
        const cleanQuestionText = questionText.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

        for (const item of userProfile.screening) {
          if (!item.keywords || !item.answer) continue;

          const keywords = item.keywords.toLowerCase().split(/[,/|]/).map(k => k.trim());
          const isMatched = keywords.some(rawKw => {
            const kw = rawKw.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!kw) return false;
            if (cleanQuestionText.includes(kw) || questionText.includes(kw) || kw.includes(cleanQuestionText)) return true;
            const kwTokens = kw.split(' ').filter(t => t.length > 2 && !['what', 'your', 'with', 'have', 'from', 'this', 'that', 'rate', 'how', 'are', 'you'].includes(t));
            return kwTokens.length > 0 && kwTokens.every(tok => cleanQuestionText.includes(tok) || questionText.includes(tok));
          });

          if (isMatched) {
            const targetAns = item.answer.toLowerCase().trim();

            // Match specific dynamic text (e.g., "Intermediate", "Expert", "30 Days", "Immediate")
            selectedInput = radioInputs.find(r => {
              const optionText = getRadioText(r, containerEl);
              return optionText === targetAns || optionText.includes(targetAns) || targetAns.includes(optionText);
            });

            // Normalizers fallback
            if (!selectedInput && window.SpeedFillMatcher?.normalizeDegreeCategory) {
              const degreeCat = window.SpeedFillMatcher.normalizeDegreeCategory(targetAns);
              if (degreeCat) {
                selectedInput = radioInputs.find(r => window.SpeedFillMatcher.normalizeDegreeCategory(getRadioText(r, containerEl)) === degreeCat);
              }
            }
            if (!selectedInput && window.SpeedFillMatcher?.normalizeNoticePeriod) {
              const noticeCat = window.SpeedFillMatcher.normalizeNoticePeriod(targetAns);
              if (noticeCat) {
                selectedInput = radioInputs.find(r => window.SpeedFillMatcher.normalizeNoticePeriod(getRadioText(r, containerEl)) === noticeCat);
              }
            }
            if (!selectedInput && window.SpeedFillMatcher?.normalizeProficiencyLevel) {
              const profCat = window.SpeedFillMatcher.normalizeProficiencyLevel(targetAns);
              if (profCat) {
                selectedInput = radioInputs.find(r => window.SpeedFillMatcher.normalizeProficiencyLevel(getRadioText(r, containerEl)) === profCat);
              }
            }

            // Fallback for standard Yes/No questions
            if (!selectedInput) {
              if (targetAns.includes('yes') || targetAns.includes('true')) {
                selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('yes') || getRadioText(r, containerEl) === 'yes');
              } else if (targetAns.includes('no') || targetAns.includes('false')) {
                selectedInput = radioInputs.find(r => getRadioText(r, containerEl).includes('no') || getRadioText(r, containerEl) === 'no');
              }
            }

            if (selectedInput) break;
          }
        }
      }

      // 8. Safe Default for unrecognized Yes/No questions
      if (!selectedInput) {
        selectedInput = radioInputs.find(r => getRadioText(r, containerEl) === 'yes') ||
          radioInputs.find(r => getRadioText(r, containerEl).includes('yes'));
      }

      if (selectedInput && !selectedInput.checked) {
        console.log('[Indeed SpeedFill] Auto-selecting radio option:', getRadioText(selectedInput, containerEl));

        const nativeRadioValueSetter = typeof window !== 'undefined' && window.HTMLInputElement ? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set : null;
        if (nativeRadioValueSetter) {
          nativeRadioValueSetter.call(selectedInput, true);
        } else {
          selectedInput.checked = true;
        }

        if (selectedInput._valueTracker) {
          selectedInput._valueTracker.setValue('');
        }
        
        const EventClass = typeof window !== 'undefined' && window.Event ? window.Event : Event;
        selectedInput.dispatchEvent(new EventClass('input', { bubbles: true }));
        selectedInput.dispatchEvent(new EventClass('change', { bubbles: true }));

        // Dispatch a single trusted MouseEvent to the label to trigger the visual React UI update
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        const label = selectedInput.id ? document.querySelector(`label[for="${CSS.escape(selectedInput.id)}"]`) : selectedInput.closest('label');
        
        if (label) {
          label.dispatchEvent(clickEvent);
        } else {
          selectedInput.dispatchEvent(clickEvent);
        }

        filledCount++;
      }
    });

    return filledCount;
  }

  function getRadioText(radio, containerEl) {
    if (!radio) return '';
    let text = '';
    const scope = containerEl || document;

    if (radio.id) {
      let lbl = scope.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      if (!lbl && containerEl && scope !== document) {
        lbl = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      }
      if (lbl) text = lbl.textContent;
    }
    if (!text && radio.closest('label')) {
      text = radio.closest('label').textContent;
    }
    if (!text && radio.parentElement) {
      const clone = radio.parentElement.cloneNode(true);
      clone.querySelectorAll('.speedfill-save-btn').forEach(b => b.remove());
      text = clone.textContent;
    }
    if (!text && radio.nextElementSibling && radio.nextElementSibling.textContent) {
      text = radio.nextElementSibling.textContent;
    }
    if (!text && radio.previousElementSibling && radio.previousElementSibling.textContent) {
      text = radio.previousElementSibling.textContent;
    }
    if (!text && radio.value) {
      text = radio.value;
    }
    if (!text && radio.getAttribute('aria-label')) {
      text = radio.getAttribute('aria-label');
    }

    text = String(text)
      .replace(/💾\s*Save to SpeedFill/gi, '')
      .replace(/Save to SpeedFill/gi, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();

    if (text === '1' || text === 'true') text = 'yes';
    if (text === '0' || text === 'false') text = 'no';

    return text;
  }

  /**
   * Handle "Add a resume" step: auto-select existing PDF resume and click Continue
   */
  /**
   * Handle "Add a resume" step: auto-select existing PDF resume and click Continue
   */
  function handleResumeStep(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return false;

    // 🚨 THE ULTIMATE PHYSICAL GUARD: If there are radio buttons, text areas, or dropdowns
    // anywhere on the screen, we are physically on a Q&A page. Abort the Resume check instantly!
    const hasQAElements = appContainer.querySelector('input[type="radio"], textarea, select, .ia-Questions');
    if (hasQAElements) {
      return false;
    }

    const headings = Array.from(appContainer.querySelectorAll('h1, h2, h3'));
    const visibleResumeHeading = headings.find(h => {
      if (h.offsetWidth === 0 && h.offsetHeight === 0) return false; 
      const t = h.textContent.toLowerCase();
      return t.includes('resume') && !t.includes('review');
    });
    if (!visibleResumeHeading) return false;

    const potentialCards = Array.from(appContainer.querySelectorAll('[data-testid*="resume"], [class*="ResumeCard"], [class*="resume-card"], [class*="resume-option"]'));

    const resumeCards = potentialCards.filter(card => {
      if (card.offsetWidth === 0 && card.offsetHeight === 0) return false; 
      const txt = card.textContent.toLowerCase();
      return txt.includes('.pdf') || txt.includes('.doc') || txt.includes('uploaded');
    });

    if (resumeCards.length === 0) return false;

    let targetCard = null;
    const targetResumeName = userProfile?.work?.targetRole?.targetResumeName?.toLowerCase().trim();

    if (targetResumeName) {
      targetCard = resumeCards.find(card => card.textContent.toLowerCase().includes(targetResumeName));
    }
    if (!targetCard) {
      targetCard = resumeCards[0];
    }

    const isAlreadySelected = targetCard &&
      (targetCard.classList.contains('selected') ||
       targetCard.getAttribute('aria-checked') === 'true' ||
       targetCard.getAttribute('aria-selected') === 'true');

    if (targetCard && !isAlreadySelected) {
      console.log('[Indeed SpeedFill] Auto-selecting resume...');
      targetCard.click();
    }

    const delay = userProfile?.settings?.stepDelayMs || 500;
    if (userProfile?.settings?.autoSelectResume !== false || userProfile?.settings?.autoAdvanceStep !== false) {
      if (!window._speedfillAdvanceTimer) {
        window._speedfillAdvanceTimer = setTimeout(() => {
          window._speedfillAdvanceTimer = null;
          clickContinueButton(appContainer);
        }, delay);
      }
      return true;
    }
    return false;
  }

  /**
   * Detect CAPTCHA and send browser notification to user across multi-tab applications
   */
  function detectCaptchaAndNotify() {
    const hasCaptchaElement = document.querySelector('iframe[src*="recaptcha"], iframe[title*="recaptcha"], .g-recaptcha, [class*="captcha"]');
    const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    const hasCaptchaText = bodyText.includes("I'm not a robot") || bodyText.includes("reCAPTCHA");

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
          // Automatically render save button
          if (typeof injectSaveButton === 'function') injectSaveButton(el);
        }
      } else {
        el.classList.remove('speedfill-warning');
      }
    });

    const radioContainers = appContainer.querySelectorAll('fieldset, [role="radiogroup"], .ia-Questions-item');
    radioContainers.forEach(container => {
      if (window.SpeedFillMatcher?.isInsideExcludedContainer(container)) return;

      const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radios.length > 0) {
        if (radios.some(r => window.SpeedFillMatcher?.isNonApplicationInput(r))) return;

        if (!radios.some(r => r.checked)) {
          unmatchedCount++;
          container.classList.add('speedfill-warning');
          // Automatically render save button for empty radio groups
          if (typeof injectSaveButton === 'function') injectSaveButton(container, radios[0]);
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
    // FOOLPROOF DUPLICATE PREVENTION: Physically check if the button already exists in the DOM
    if (container.querySelector('.speedfill-save-btn')) return;
    if (container.parentElement && container.parentElement.querySelector('.speedfill-save-btn')) return;
    if (container.dataset.speedfillSaveInjected === 'true') return;

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

      let headerEl = null;
      if (inputEl && inputEl.type === 'radio') {
        headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="header"]');
      } else {
        headerEl = appContainer.querySelector(`label[for="${CSS.escape(targetInput.id)}"]`) || container.closest('label') || container.previousElementSibling;
      }

      let questionText = '';
      if (headerEl) {
        const clone = headerEl.cloneNode(true);
        clone.querySelectorAll('.speedfill-save-btn').forEach(b => b.remove());
        questionText = clone.textContent.trim();
      }

      if (!questionText && container.parentElement) {
        const clone = container.parentElement.cloneNode(true);
        clone.querySelectorAll('.speedfill-save-btn').forEach(b => b.remove());
        questionText = clone.innerText ? clone.innerText.split('\n')[0] : clone.textContent.trim();
      }

      if (!questionText) questionText = 'Unknown Question';

      questionText = questionText
        .replace(/how would you rate your/gi, '')
        .replace(/what is/gi, '')
        .replace(/please select/gi, '')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .toLowerCase()
        .substring(0, 80)
        .trim();

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

      if (userProfile && userProfile.screening) {
        userProfile.screening.push({ keywords: questionText, answer: answerText });
        chrome.storage.local.set({ userProfile: userProfile }, () => {
          btn.innerHTML = '✅ Saved!';
          btn.classList.add('saved');
          btn.disabled = true;
          console.log('[SpeedFill] Saved new Q&A:', questionText, '->', answerText);

          // Force form validation re-check to trigger auto-advance
          setTimeout(() => {
            handleUserManualInput({ isTrusted: true, target: targetInput });
          }, 300);
        });
      }
    });

    if (inputEl && inputEl.type === 'radio') {
      const header = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="header"]');
      if (header) {
        header.appendChild(btn);
      } else {
        container.appendChild(btn);
      }
    } else {
      const wrapper = container.closest('.ia-Questions-item') || container.parentElement;
      if (wrapper && wrapper.nextSibling) {
        wrapper.parentNode.insertBefore(btn, wrapper.nextSibling);
      } else if (wrapper) {
        wrapper.parentNode.appendChild(btn);
      } else {
        container.parentNode.insertBefore(btn, container.nextSibling);
      }
      btn.style.display = 'block';
      btn.style.marginTop = '6px';
      btn.style.marginLeft = '0';
    }
  }

  function handleUserManualInput(e) {
    // If triggered by a browser event, enforce the human-click rule to prevent loops.
    // BUT allow programmatic calls (where e is undefined) to pass through.
    if (e && !e.isTrusted) return;

    if (e && e.target && e.target.tagName && !e.target.dataset.speedfillSaveInjected) {
      const el = e.target;
      if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'select') {

        // FILTER: Do not inject on global search inputs
        if (window.SpeedFillMatcher?.isSearchInput && window.SpeedFillMatcher.isSearchInput(el)) {
          return;
        }

        // FILTER: If this is a standard recognized field, DO NOT inject the Q&A save button.
        if (el.type !== 'radio') {
          const match = window.SpeedFillMatcher?.matchField(el, userProfile);
          if (match !== null && match !== undefined) {
            return;
          }
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
          date: new Date().toISOString()
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
    window._speedfillAdvanceTimer = null; 
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer();
    if (!appContainer) return false;

    const buttons = Array.from(appContainer.querySelectorAll('button, a[role="button"]'));
    const continueBtn = buttons.find(b => {
      if (b.offsetWidth === 0 && b.offsetHeight === 0) return false; // MUST BE VISIBLE
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
      
      // 🛡️ NEW GUARD: Do not aggressively overwrite if the user is actively typing in the box!
      if (document.activeElement === input) return;

      const match = window.SpeedFillMatcher?.matchField(input, userProfile);
      if (match && match.value) {
        const success = window.SpeedFillMatcher.setNativeInputValue(input, match.value);
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

    // 5. Delay the unmatched field check so React has time to re-render radio selections.
    //    Running this synchronously sees stale r.checked = false even after a successful click.
    const stepDelay = userProfile?.settings?.stepDelayMs !== undefined ? userProfile.settings.stepDelayMs : 150;
    const runUnmatchedCheck = () => {
      const unmatchedCount = checkUnmatchedUnfilledFields(appContainer);
      updatePillStatus(unmatchedCount, filledCount);

      // 6. PAUSE AUTO-ADVANCE / SUBMIT if there are unmatched empty fields and feature is enabled
      if (unmatchedCount > 0 && !handledResume && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
        console.log(`[Indeed SpeedFill] Pausing auto-advance: ${unmatchedCount} field(s) need manual input/dashboard entry.`);
        return;
      }

      // 7. Check for auto-submit & monitor CAPTCHA resolution
      if (userProfile?.settings?.autoSubmitApplication !== false) {
        setTimeout(() => clickSubmitButton(appContainer), stepDelay);
        monitorCaptchaAndSubmit(appContainer);
      }

      // 8. Optionally auto-advance intermediate steps when all required fields on screen are filled
      if (unmatchedCount === 0 && !handledResume && userProfile?.settings?.autoAdvanceStep !== false) {
        const hasUnsaved = appContainer.querySelectorAll('.speedfill-save-btn:not(.saved)').length > 0;
        if (!hasUnsaved) {
          if (!window._speedfillAdvanceTimer) {
            window._speedfillAdvanceTimer = setTimeout(() => {
              window._speedfillAdvanceTimer = null;
              clickContinueButton(appContainer);
            }, stepDelay);
          }
        } else {
          const pill = document.getElementById('speedfill-floating-pill');
          if (pill) {
            pill.classList.add('pill-warning');
            pill.innerHTML = `<span>⏸️ Paused (Save to Resume)</span>`;
          }
        }
      }
    };

    // If we filled radios, give React 350ms to reconcile before checking unmatched fields
    if (filledCount > 0) {
      setTimeout(runUnmatchedCheck, 350);
    } else {
      runUnmatchedCheck();
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
      }
      filledCount++;
    }

    if (whereInput && targetLocation) {
      if (window.SpeedFillMatcher?.setNativeInputValue) {
        window.SpeedFillMatcher.setNativeInputValue(whereInput, targetLocation);
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
          // Ignore mutations caused by SpeedFill's own DOM injections (Save buttons, pill, warning classes)
          // to prevent the observer from re-triggering fillCurrentForm in an infinite loop.
          const isOwnMutation = Array.from(m.addedNodes).every(node => {
            if (node.nodeType !== 1) return true; // text nodes are fine
            const cls = (node.className || '').toString();
            return cls.includes('speedfill') || cls.includes('indeed-search-fill-btn');
          });
          if (!isOwnMutation) {
            shouldFill = true;
            break;
          }
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
        }, 400); // 400ms debounce — gives React time to re-render after radio clicks
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
      const filled = submitted ? 0 : fillCurrentForm();
      sendResponse({ status: 'done', filled, submitted });
    }
  });

  // Initialization & Repeated Fill Retries for async React rendering
  loadProfile(() => {
    setupDOMObserver();
    injectSearchFillButton();
    setInterval(injectSearchFillButton, 1000);

    setTimeout(fillCurrentForm, 100);
    setTimeout(fillCurrentForm, 400);
    setTimeout(fillCurrentForm, 1000);
    monitorCaptchaAndSubmit();
  });

})();
