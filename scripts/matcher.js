/**
 * Indeed SpeedFill - Matcher Module
 * Sub-10ms Fuzzy Label & Field Identifier Engine
 */

window.SpeedFillMatcher = (function() {
  
  // Field dictionary mapping label keywords to profile paths
  const FIELD_MAPPINGS = [
    // Current Role
    { keys: ['current job title', 'current role', 'present position', 'recent job title', 'job title', 'title', 'role', 'designation', 'position'], path: 'work.currentRole.jobTitle' },
    { keys: ['current company', 'present company', 'company name', 'company', 'employer', 'organization'], path: 'work.currentRole.company' },
    { keys: ['years of experience', 'years experience', 'total experience', 'experience in years'], path: 'work.currentRole.yearsExperience' },
    { keys: ['current ctc', 'current salary', 'present salary'], path: 'work.currentRole.currentSalary' },

    // Target Role
    { keys: ['target job title', 'desired role', 'target role', 'job title showing relevant experience', 'desired position', 'role applying for'], path: 'work.targetRole.jobTitle' },
    { keys: ['expected ctc', 'expected salary', 'desired salary'], path: 'work.targetRole.expectedSalary' },
    { keys: ['notice period', 'notice', 'how soon can you start', 'availability'], path: 'work.targetRole.noticePeriod' },
    { keys: ['target location', 'preferred location', 'desired city'], path: 'work.targetRole.targetLocation' },

    // Personal Details
    { keys: ['first name', 'given name'], path: 'personal.firstName' },
    { keys: ['last name', 'surname', 'family name'], path: 'personal.lastName' },
    { keys: ['full name', 'name'], path: 'personal.fullName' },
    { keys: ['email', 'email address'], path: 'personal.email' },
    { keys: ['phone', 'mobile', 'contact number', 'phone number'], path: 'personal.phone' },
    { keys: ['city', 'location', 'current city'], path: 'personal.city' },
    { keys: ['state', 'province'], path: 'personal.state' },
    { keys: ['country'], path: 'personal.country' },
    { keys: ['linkedin', 'linkedin profile', 'linkedin url'], path: 'personal.linkedin' },
    { keys: ['github', 'portfolio'], path: 'personal.github' },

    // Education
    { keys: ['degree', 'highest degree', 'qualification', 'education level'], path: 'education.degree' },
    { keys: ['field of study', 'major', 'stream', 'specialization'], path: 'education.major' },
    { keys: ['university', 'college', 'school', 'institution'], path: 'education.university' },
    { keys: ['graduation year', 'year of completion', 'passing year'], path: 'education.graduationYear' }
  ];

  /**
   * Check if element belongs strictly to Indeed's top main search bar (what/where)
   */
  function isSearchInput(el) {
    if (!el) return false;

    // If inside an application container or modal, it is NEVER a search bar!
    if (el.closest('div[role="dialog"], [class*="ia-"], [class*="Application"], form[id*="ia"]')) {
      return false;
    }

    const id = (el.id || '').toLowerCase();
    const name = (el.name || '').toLowerCase();

    // Exact search inputs (what / where / q / l)
    if (id === 'text-input-what' || id === 'text-input-where' || name === 'q' || name === 'l') {
      return true;
    }

    // Top navbar or global jobsearch box
    const searchForm = el.closest('form[role="search"], .jobsearch-SearchBox, nav, header');
    if (searchForm) return true;

    return false;
  }

  /**
   * Helper to safely extract nested value from object path (e.g. 'work.currentRole.jobTitle')
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
   * Find label text associated with a given input element (including data-testid & aria-labelledby)
   */
  function getElementLabelText(el) {
    let labelTexts = [];

    // 1. Explicit <label for="id">
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl) labelTexts.push(labelEl.textContent);
    }

    // 2. Parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      labelTexts.push(parentLabel.textContent);
    }

    // 3. Preceding / Nearby sibling header or legend or aria-labelledby
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const target = document.getElementById(ariaLabelledBy);
      if (target) labelTexts.push(target.textContent);
    }

    // 4. aria-label, placeholder, name, id, and data-testid
    if (el.getAttribute('aria-label')) labelTexts.push(el.getAttribute('aria-label'));
    if (el.getAttribute('data-testid')) labelTexts.push(el.getAttribute('data-testid'));
    if (el.placeholder) labelTexts.push(el.placeholder);
    if (el.name) labelTexts.push(el.name);
    if (el.id) labelTexts.push(el.id);

    // 5. Closest container section header / legend text
    const container = el.closest('.ia-FormGroup, .ia-Questions-item, [class*="css-"], fieldset, form > div, div[class*="Job"], div[class*="Form"]');
    if (container) {
      const header = container.querySelector('h1, h2, h3, h4, legend, label, [class*="label"], [class*="header"]');
      if (header) labelTexts.push(header.textContent);
    }

    return labelTexts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Match an input element to user profile value
   */
  function matchField(el, profile) {
    if (!profile) return null;

    // NEVER match main navbar search inputs
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
      for (const item of profile.screening) {
        const keywords = item.keywords.toLowerCase().split(',').map(k => k.trim());
        for (const kw of keywords) {
          if (kw && labelText.includes(kw)) {
            return { value: item.answer, confidence: 0.85, keyMatched: kw };
          }
        }
      }
    }

    return null;
  }

  return {
    matchField,
    getElementLabelText,
    isSearchInput
  };
})();
