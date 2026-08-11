/**
 * Indeed SpeedFill - Matcher Module
 * Sub-10ms Fuzzy Label & Field Identifier Engine
 */

(function() {
  const CONTAINER_SELECTORS = [
    'div[role="dialog"][aria-modal="true"]',
    'div[role="dialog"]',
    '[data-testid="ia-container"]',
    '[data-testid="ia-modal"]',
    '[data-testid="ia-JobApplication"]',
    'main#ia-container',
    '#ia-container',
    'div.ia-BasePage',
    'div.ia-Container',
    'form#ia-Form',
    'form[id*="ia"]',
    'form[class*="ia-"]',
    'div[class*="ia-Form"]',
    'div[class*="ia-Application"]',
    '[class*="ia-Form"]',
    '[class*="ia-Application"]',
    'form[action*="apply"]'
  ];

  const EXCLUDED_CONTAINER_SELECTORS = [
    '[data-gnav-element]',
    '[data-gnav-region]',
    '[data-gnav-container]',
    'header',
    'nav',
    '[role="navigation"]',
    '#gnav-header',
    '#gnav-header-container',
    '#gnav-footer',
    'footer',
    '[role="contentinfo"]',
    'div[class*="gnav"]',
    'div[class*="GNav"]',
    'header[class*="gnav"]',
    'footer[class*="gnav"]',
    '#jobsearch',
    'form[role="search"]',
    'form[action*="/jobs"]',
    '.jobsearch-SearchBox',
    'div[class*="SearchBox"]',
    'div[class*="searchBox"]',
    '#jobalert-form',
    'form[class*="jobalert"]',
    'div[class*="JobAlert"]',
    'form[action*="/cmp"]',
    'form[action*="/salaries"]',
    'div[id*="signin"]',
    'div[class*="auth-modal"]',
    'form[action*="/account"]',
    '#feedback-form',
    'div[class*="feedback-modal"]'
  ];

  const EXCLUDED_ELEMENT_IDS = new Set([
    'text-input-what',
    'text-input-where',
    'jobsearch-q',
    'jobsearch-l',
    'q',
    'l',
    'jobalert-email',
    'feedback-input',
    'user-email-signin',
    'indeed-search-fill-btn'
  ]);

  const EXCLUDED_ELEMENT_NAMES = new Set([
    'q',
    'l',
    'radius',
    'from',
    'filter',
    'sort',
    'search',
    'feedback'
  ]);

  // Field dictionary mapping label keywords to profile paths
  // Specific compound keys come BEFORE generic single-word keys
  const FIELD_MAPPINGS = [
    // Target Role (Specific compound keys)
    { keys: ['target job title', 'desired job title', 'target role', 'desired position', 'desired role', 'role applying for', 'job title showing relevant experience'], path: 'work.targetRole.jobTitle' },
    { keys: ['target location', 'preferred location', 'desired city'], path: 'work.targetRole.targetLocation' },
    { keys: ['expected ctc', 'expected salary', 'desired salary'], path: 'work.targetRole.expectedSalary' },
    { keys: ['notice period', 'how soon can you start'], path: 'work.targetRole.noticePeriod' },

    // Current Role (Specific compound keys)
    { keys: ['current job title', 'present position', 'recent job title', 'current role'], path: 'work.currentRole.jobTitle' },
    { keys: ['current company', 'present company', 'company name'], path: 'work.currentRole.company' },
    { keys: ['years of experience', 'years experience', 'total experience', 'experience in years'], path: 'work.currentRole.yearsExperience' },
    { keys: ['current ctc', 'current salary', 'present salary'], path: 'work.currentRole.currentSalary' },

    // Personal Details (Specific compound keys)
    { keys: ['first name', 'given name'], path: 'personal.firstName' },
    { keys: ['last name', 'surname', 'family name'], path: 'personal.lastName' },
    { keys: ['full name'], path: 'personal.fullName' },
    { keys: ['email address'], path: 'personal.email' },
    { keys: ['contact number', 'phone number'], path: 'personal.phone' },
    { keys: ['current city'], path: 'personal.city' },
    { keys: ['linkedin profile', 'linkedin url'], path: 'personal.linkedin' },

    // Education (Specific compound keys)
    { keys: ['highest degree', 'education level'], path: 'education.degree' },
    { keys: ['field of study'], path: 'education.major' },
    { keys: ['graduation year', 'year of completion', 'passing year'], path: 'education.graduationYear' },

    // Generic Single-Word Keys (Fallback)
    { keys: ['job title', 'title', 'role', 'designation', 'position'], path: 'work.currentRole.jobTitle' },
    { keys: ['company', 'employer', 'organization'], path: 'work.currentRole.company' },
    { keys: ['notice', 'availability'], path: 'work.targetRole.noticePeriod' },
    { keys: ['name'], path: 'personal.fullName' },
    { keys: ['email'], path: 'personal.email' },
    { keys: ['phone', 'mobile'], path: 'personal.phone' },
    { keys: ['city', 'location'], path: 'personal.city' },
    { keys: ['state', 'province'], path: 'personal.state' },
    { keys: ['country'], path: 'personal.country' },
    { keys: ['linkedin'], path: 'personal.linkedin' },
    { keys: ['github', 'portfolio'], path: 'personal.github' },
    { keys: ['degree', 'qualification'], path: 'education.degree' },
    { keys: ['major', 'stream', 'specialization'], path: 'education.major' },
    { keys: ['university', 'college', 'school', 'institution'], path: 'education.university' }
  ];

  /**
   * Check if element is inside an excluded parent container
   */
  function isInsideExcludedContainer(el) {
    if (!el) return false;
    for (const selector of EXCLUDED_CONTAINER_SELECTORS) {
      if (el.closest && el.closest(selector)) return true;
    }
    return false;
  }

  /**
   * Get active job application container
   */
  function getAppContainer() {
    const EXCLUDED_CHILD_FORMS = '#feedback-form, #jobalert-form, form[class*="jobalert"], div[class*="auth-modal"], form[action*="/account"], form[action*="/cmp"], form[action*="/salaries"]';
    for (const selector of CONTAINER_SELECTORS) {
      const candidates = document.querySelectorAll(selector);
      for (const container of candidates) {
        if (!container) continue;
        if (isInsideExcludedContainer(container)) continue;
        if (container.querySelector(EXCLUDED_CHILD_FORMS) !== null) continue;
        return container;
      }
    }
    if (typeof window !== 'undefined' && window.top !== window.self) {
      const href = (window.location && window.location.href) || '';
      if (
        href.includes('indeed.com/apply') ||
        href.includes('/apply') ||
        href.includes('smartapply.indeed.com') ||
        href.includes('indeedapply.com') ||
        href.includes('ia.indeed.com')
      ) {
        return document.body;
      }
    }
    return null;
  }

  /**
   * Check if element is a non-application input or search bar
   */
  function isNonApplicationInput(el) {
    if (!el) return true;

    if (isInsideExcludedContainer(el)) return true;

    const id = (el.id || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const role = (el.getAttribute ? (el.getAttribute('role') || '') : '').toLowerCase();

    if (EXCLUDED_ELEMENT_IDS.has(id)) return true;
    if (EXCLUDED_ELEMENT_NAMES.has(name)) return true;
    if (role === 'searchbox') return true;

    if (el.hasAttribute && (el.hasAttribute('data-gnav-element') || el.hasAttribute('data-gnav-region'))) {
      return true;
    }

    const placeholder = (el.placeholder || (el.getAttribute ? (el.getAttribute('placeholder') || '') : '')).toLowerCase();
    const ariaLabel = (el.getAttribute ? (el.getAttribute('aria-label') || '') : '').toLowerCase();

    if (
      ariaLabel.includes('search job') ||
      ariaLabel.includes('search location') ||
      ariaLabel.includes('search title') ||
      ariaLabel.includes('search position') ||
      ariaLabel.startsWith('search') ||
      placeholder.includes('job title') ||
      placeholder.includes('city, state') ||
      placeholder.includes('keywords') ||
      placeholder.includes('search jobs') ||
      placeholder.includes('search location')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if element is a search input
   */
  function isSearchInput(el) {
    if (!el) return false;
    if (isNonApplicationInput(el)) return true;
    const searchForm = el.closest ? el.closest('form[role="search"], .jobsearch-SearchBox, nav, header') : null;
    if (searchForm) return true;
    return false;
  }

  /**
   * Helper to safely extract nested value from object path
   */
  function getNestedValue(obj, path) {
    if (!obj || !path) return null;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current[key] === undefined || current[key] === null) return null;
      current = current[key];
    }
    return current;
  }

  /**
   * Find label text associated with a given input element
   */
  function getElementLabelText(el) {
    let labelTexts = [];

    // 1. Explicit <label for="id">
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl) labelTexts.push(labelEl.textContent);
    }

    // 2. Parent <label>
    const parentLabel = el.closest ? el.closest('label') : null;
    if (parentLabel) {
      labelTexts.push(parentLabel.textContent);
    }

    // 3. Preceding / Nearby sibling header or legend or aria-labelledby
    const ariaLabelledBy = el.getAttribute ? el.getAttribute('aria-labelledby') : null;
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.trim().split(/\s+/);
      for (const id of ids) {
        if (id) {
          const target = document.getElementById(id);
          if (target && target.textContent) {
            labelTexts.push(target.textContent);
          }
        }
      }
    }

    // 4. aria-label, placeholder, name, id, and data-testid
    if (el.getAttribute && el.getAttribute('aria-label')) labelTexts.push(el.getAttribute('aria-label'));
    if (el.getAttribute && el.getAttribute('data-testid')) labelTexts.push(el.getAttribute('data-testid'));
    if (el.placeholder) labelTexts.push(el.placeholder);
    if (el.name) labelTexts.push(el.name);
    if (el.id) labelTexts.push(el.id);

    // 5. Closest container section header / legend text (sanitized: no [class*="css-"] or form > div)
    if (el.closest) {
      const container = el.closest('.ia-FormGroup, .ia-Questions-item, fieldset, div[class*="Job"], div[class*="Form"]');
      if (container) {
        const header = container.querySelector('h1, h2, h3, h4, legend, label, [class*="label"], [class*="header"]');
        if (header) labelTexts.push(header.textContent);
      }
    }

    return labelTexts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Match an input element to user profile value
   */
  function matchField(el, profile) {
    if (!profile) return null;

    const id = (el.id || '').toLowerCase();
    const name = (el.name || '').toLowerCase();

    if (isSearchInput(el)) return null;

    const labelText = getElementLabelText(el);
    if (!labelText) return null;

    // Check direct dictionary mappings
    for (const mapping of FIELD_MAPPINGS) {
      for (const key of mapping.keys) {
        if (labelText.includes(key)) {
          const val = getNestedValue(profile, mapping.path);
          if (val) return { value: val, confidence: 0.95, keyMatched: key };
        }
      }
    }

    // Check screening Q&A bank
    if (profile.screening && Array.isArray(profile.screening)) {
      const cleanLabelText = labelText.replace(/[^a-z0-9 ]/g, '');
      for (const item of profile.screening) {
        const keywords = item.keywords.toLowerCase().split(/[,/|]/).map(k => k.trim().replace(/[^a-z0-9 ]/g, ''));
        for (const kw of keywords) {
          if (kw && (cleanLabelText.includes(kw) || labelText.includes(kw))) {
            return { value: item.answer, confidence: 0.85, keyMatched: kw };
          }
        }
      }
    }

    return null;
  }

  /**
   * Locate Indeed's global search bar container
   */
  function findSearchContainer(doc) {
    const scope = doc || (typeof document !== 'undefined' ? document : null);
    if (!scope) return null;
    return scope.querySelector('#jobsearch, form[role="search"], .jobsearch-SearchBox, form[action*="/jobs"]');
  }

  /**
   * Locate Indeed's What (q) and Where (l) search inputs
   */
  function getSearchInputs(containerOrDoc) {
    const scope = containerOrDoc || (typeof document !== 'undefined' ? document : null);
    if (!scope) return { whatInput: null, whereInput: null };

    const whatInput = scope.querySelector('#text-input-what, input[name="q"], #jobsearch-q, input[aria-label*="what" i]');
    const whereInput = scope.querySelector('#text-input-where, input[name="l"], #jobsearch-l, input[aria-label*="where" i]');

    return { whatInput, whereInput };
  }

  /**
   * Safely extract job title and target location from profile with fallback unwrap
   */
  function extractSearchFillData(profile) {
    if (!profile) return { jobTitle: '', targetLocation: '' };

    const jobTitle = String(
      profile.work?.targetRole?.jobTitle ||
      profile.work?.currentRole?.jobTitle ||
      profile.work?.recentJobTitle ||
      profile.recentJobTitle ||
      ''
    ).trim();

    const targetLocation = String(
      profile.work?.targetRole?.targetLocation ||
      profile.personal?.city ||
      profile.city ||
      ''
    ).trim();

    return { jobTitle, targetLocation };
  }

  /**
   * Check if location hostname is an indeed.com domain
   */
  function isIndeedPage(hostname) {
    if (!hostname) return false;
    const host = String(hostname).toLowerCase().trim();
    return host === 'indeed.com' || host.endsWith('.indeed.com') || host.includes('indeed.com');
  }

  /**
   * Safely set value on HTMLInputElement using native property setter and dispatch React events
   */
  function setNativeInputValue(input, value) {
    if (!input || value === undefined || value === null) return false;
    const valueStr = String(value);

    const prototype = (typeof window !== 'undefined' && window.HTMLInputElement && window.HTMLInputElement.prototype)
      ? window.HTMLInputElement.prototype
      : (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : null);
    
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : null;
    const setter = descriptor ? descriptor.set : null;

    if (setter) {
      setter.call(input, valueStr);
    } else {
      input.value = valueStr;
    }

    if (input._valueTracker && typeof input._valueTracker.setValue === 'function') {
      input._valueTracker.setValue('');
    }

    const EventClass = (typeof window !== 'undefined' && window.Event) ? window.Event : (typeof Event !== 'undefined' ? Event : null);
    if (EventClass && typeof input.dispatchEvent === 'function') {
      input.dispatchEvent(new EventClass('input', { bubbles: true }));
      input.dispatchEvent(new EventClass('change', { bubbles: true }));
      input.dispatchEvent(new EventClass('blur', { bubbles: true }));
    }

    return true;
  }

  const SpeedFillMatcher = {
    matchField,
    getElementLabelText,
    isSearchInput,
    getAppContainer,
    isInsideExcludedContainer,
    isNonApplicationInput,
    findSearchContainer,
    getSearchInputs,
    extractSearchFillData,
    isIndeedPage,
    setNativeInputValue
  };

  if (typeof window !== 'undefined') {
    window.SpeedFillMatcher = SpeedFillMatcher;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpeedFillMatcher;
  }
})();
