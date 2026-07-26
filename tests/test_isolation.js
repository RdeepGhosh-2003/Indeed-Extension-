/**
 * Empirical Test Suite for Form vs Search Isolation Challenger
 * Tests DOM container identification, non-application input exclusion,
 * field matching, and 0-fill guarantees on non-application elements.
 */

const { createDOM, SimulatedElement } = require('./simulated_dom');

// Initialize DOM environment before loading matcher
createDOM();
const SpeedFillMatcher = require('../scripts/matcher');

// Standard test profile
const testProfile = {
  personal: {
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    email: 'john.doe@example.com',
    phone: '555-0199',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India'
  },
  work: {
    currentRole: {
      jobTitle: 'Software Engineer',
      company: 'TechCorp',
      yearsExperience: '5'
    },
    targetRole: {
      jobTitle: 'Senior Software Engineer',
      expectedSalary: '150000',
      noticePeriod: '30 days'
    }
  },
  screening: [
    { keywords: 'background check', answer: 'Yes' },
    { keywords: 'drug test', answer: 'Yes' }
  ]
};

let passCount = 0;
let failCount = 0;
const results = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    results.push({ testName, status: 'PASS', details });
    console.log(`[PASS] ${testName}`);
  } else {
    failCount++;
    results.push({ testName, status: 'FAIL', details });
    console.error(`[FAIL] ${testName} - ${details}`);
  }
}

function runTests() {
  console.log('====================================================');
  console.log('STARTING FORM VS SEARCH ISOLATION EMPIRICAL TEST SUITE');
  console.log('====================================================\n');

  // TEST SUITE 1: Search Inputs Exclusion
  console.log('--- TEST SUITE 1: Non-Application / Search Input Identification ---');
  
  const searchInputs = [
    { id: 'text-input-what', name: 'q', placeholder: 'Job title, keywords, or company', role: 'searchbox' },
    { id: 'text-input-where', name: 'l', placeholder: 'City, state, zip code, or remote' },
    { id: 'jobsearch-q', name: 'q', placeholder: 'Search jobs' },
    { id: 'jobsearch-l', name: 'l', placeholder: 'Search location' },
    { id: 'jobalert-email', name: 'email', placeholder: 'Enter your email for job alerts' },
    { id: 'feedback-input', name: 'feedback', placeholder: 'Feedback comments' },
    { id: 'user-email-signin', name: 'email', placeholder: 'Sign in email' }
  ];

  searchInputs.forEach(attr => {
    const el = new SimulatedElement('INPUT', attr);
    const isNonApp = SpeedFillMatcher.isNonApplicationInput(el);
    const isSearch = SpeedFillMatcher.isSearchInput(el);
    const match = SpeedFillMatcher.matchField(el, testProfile);

    assert(
      isNonApp === true && isSearch === true && match === null,
      `Exclusion check for search input #${attr.id || attr.name}`,
      `isNonApp=${isNonApp}, isSearch=${isSearch}, match=${JSON.stringify(match)}`
    );
  });

  // TEST SUITE 2: Excluded Container Hierarchy
  console.log('\n--- TEST SUITE 2: Excluded Container Ancestry ---');

  const doc = createDOM();
  
  // 2.1 Search bar container (#jobsearch)
  const jobsearchForm = new SimulatedElement('FORM', { id: 'jobsearch', role: 'search' });
  const innerWhatInput = new SimulatedElement('INPUT', { id: 'custom-what-input', name: 'custom_q' });
  jobsearchForm.appendChild(innerWhatInput);
  doc.body.appendChild(jobsearchForm);

  assert(
    SpeedFillMatcher.isInsideExcludedContainer(innerWhatInput) === true,
    'Input inside #jobsearch is flagged as inside excluded container',
    'Input inside #jobsearch should be excluded'
  );

  assert(
    SpeedFillMatcher.isNonApplicationInput(innerWhatInput) === true,
    'Input inside #jobsearch is flagged as non-application input',
    'Input inside #jobsearch should be excluded'
  );

  assert(
    SpeedFillMatcher.matchField(innerWhatInput, testProfile) === null,
    'Input inside #jobsearch returns null matchField',
    'Match should be null'
  );

  // 2.2 Global Navigation Header
  const gnavHeader = new SimulatedElement('HEADER', { id: 'gnav-header', 'data-gnav-container': 'true' });
  const gnavInput = new SimulatedElement('INPUT', { id: 'gnav-search-input', placeholder: 'Search...' });
  gnavHeader.appendChild(gnavInput);
  doc.body.appendChild(gnavHeader);

  assert(
    SpeedFillMatcher.isInsideExcludedContainer(gnavInput) === true,
    'Input inside gnav header is flagged as inside excluded container',
    'Header input should be excluded'
  );

  assert(
    SpeedFillMatcher.matchField(gnavInput, testProfile) === null,
    'Input inside gnav header returns null matchField',
    'Match should be null'
  );

  // 2.3 Job Alert Form
  const jobalertForm = new SimulatedElement('FORM', { id: 'jobalert-form' });
  const jobalertInput = new SimulatedElement('INPUT', { id: 'alert-email-field', name: 'email' });
  jobalertForm.appendChild(jobalertInput);
  doc.body.appendChild(jobalertForm);

  assert(
    SpeedFillMatcher.isInsideExcludedContainer(jobalertInput) === true,
    'Input inside #jobalert-form is excluded',
    'Job alert input should be excluded'
  );

  // TEST SUITE 3: Application Container Isolation & Detection
  console.log('\n--- TEST SUITE 3: Application Container Isolation ---');

  // 3.1 Page with Search Bar ONLY (No application modal)
  const docOnlySearch = createDOM();
  const mainSearchHeader = new SimulatedElement('HEADER', { id: 'gnav-header' });
  const searchBox = new SimulatedElement('FORM', { id: 'jobsearch' });
  searchBox.appendChild(new SimulatedElement('INPUT', { id: 'text-input-what' }));
  mainSearchHeader.appendChild(searchBox);
  docOnlySearch.body.appendChild(mainSearchHeader);

  const containerOnSearchPage = SpeedFillMatcher.getAppContainer();
  assert(
    containerOnSearchPage === null,
    'getAppContainer() returns NULL on pure search page (0 container false positive)',
    `Expected null, got: ${containerOnSearchPage ? containerOnSearchPage.tagName : null}`
  );

  // 3.2 Page with BOTH Search Bar AND Application Modal
  const docWithModal = createDOM();
  const searchHeader = new SimulatedElement('HEADER', { id: 'gnav-header' });
  const searchForm = new SimulatedElement('FORM', { id: 'jobsearch' });
  searchForm.appendChild(new SimulatedElement('INPUT', { id: 'text-input-what' }));
  searchHeader.appendChild(searchForm);
  docWithModal.body.appendChild(searchHeader);

  // Application Modal Container
  const appModal = new SimulatedElement('DIV', { role: 'dialog', 'aria-modal': 'true', id: 'ia-modal-container' });
  const iaForm = new SimulatedElement('FORM', { id: 'ia-Form' });
  
  const firstNameInput = new SimulatedElement('INPUT', { id: 'applicant-first-name', name: 'firstName' });
  const firstNameLabel = new SimulatedElement('LABEL', { for: 'applicant-first-name' }, 'First name');
  
  const lastNameInput = new SimulatedElement('INPUT', { id: 'applicant-last-name', name: 'lastName' });
  const lastNameLabel = new SimulatedElement('LABEL', { for: 'applicant-last-name' }, 'Last name');

  const emailInput = new SimulatedElement('INPUT', { id: 'applicant-email', name: 'email', type: 'email' });
  const emailLabel = new SimulatedElement('LABEL', { for: 'applicant-email' }, 'Email address');

  iaForm.appendChild(firstNameLabel);
  iaForm.appendChild(firstNameInput);
  iaForm.appendChild(lastNameLabel);
  iaForm.appendChild(lastNameInput);
  iaForm.appendChild(emailLabel);
  iaForm.appendChild(emailInput);

  appModal.appendChild(iaForm);
  docWithModal.body.appendChild(appModal);

  const activeAppContainer = SpeedFillMatcher.getAppContainer();
  assert(
    activeAppContainer === appModal,
    'getAppContainer() correctly isolates Application Modal when search bar is also present',
    `Isolated container ID: ${activeAppContainer ? activeAppContainer.id : 'none'}`
  );

  // TEST SUITE 4: Field Matching Accuracy inside Application Container
  console.log('\n--- TEST SUITE 4: Field Matching Accuracy inside Application Container ---');

  const firstNameMatch = SpeedFillMatcher.matchField(firstNameInput, testProfile);
  assert(
    firstNameMatch !== null && firstNameMatch.value === 'John',
    'First Name field matched correctly inside application modal',
    `Value: ${firstNameMatch ? firstNameMatch.value : 'null'}`
  );

  const lastNameMatch = SpeedFillMatcher.matchField(lastNameInput, testProfile);
  assert(
    lastNameMatch !== null && lastNameMatch.value === 'Doe',
    'Last Name field matched correctly inside application modal',
    `Value: ${lastNameMatch ? lastNameMatch.value : 'null'}`
  );

  const emailMatch = SpeedFillMatcher.matchField(emailInput, testProfile);
  assert(
    emailMatch !== null && emailMatch.value === 'john.doe@example.com',
    'Email field matched correctly inside application modal',
    `Value: ${emailMatch ? emailMatch.value : 'null'}`
  );

  // TEST SUITE 5: Adversarial Attack Vectors & Stress Scenarios
  console.log('\n--- TEST SUITE 5: Adversarial Attack Vectors & Stress Scenarios ---');

  // 5.1 Main role container with ambiguous search box outside modal
  const docMainRole = createDOM();
  const mainRole = new SimulatedElement('MAIN', { role: 'main' });
  const ambiguousInput = new SimulatedElement('INPUT', { 
    id: 'search-input-custom', 
    name: 'keywords', 
    placeholder: 'Find your next role' 
  });
  const ambiguousLabel = new SimulatedElement('LABEL', { for: 'search-input-custom' }, 'Desired Role');
  mainRole.appendChild(ambiguousLabel);
  mainRole.appendChild(ambiguousInput);
  docMainRole.body.appendChild(mainRole);

  const mainContainerFound = SpeedFillMatcher.getAppContainer();
  const isAmbiguousNonApp = SpeedFillMatcher.isNonApplicationInput(ambiguousInput);
  const ambiguousMatch = SpeedFillMatcher.matchField(ambiguousInput, testProfile);

  console.log(`[ANALYSIS] Main role container found: ${mainContainerFound ? mainContainerFound.tagName : 'null'}`);
  console.log(`[ANALYSIS] Ambiguous input isNonApp: ${isAmbiguousNonApp}, match: ${JSON.stringify(ambiguousMatch)}`);

  // 5.2 Search bar with custom aria-label
  const docSearchAria = createDOM();
  const ariaSearchInput = new SimulatedElement('INPUT', {
    id: 'custom-aria-search',
    'aria-label': 'Search jobs by title or company'
  });
  docSearchAria.body.appendChild(ariaSearchInput);

  assert(
    SpeedFillMatcher.isNonApplicationInput(ariaSearchInput) === true && SpeedFillMatcher.matchField(ariaSearchInput, testProfile) === null,
    'Custom aria-label "Search jobs..." correctly excluded',
    'Aria search input must be excluded'
  );

  // SUMMARY REPORT
  console.log('\n====================================================');
  console.log(`TEST RESULTS SUMMARY: PASSED=${passCount}, FAILED=${failCount}`);
  console.log('====================================================');

  return { passCount, failCount, results };
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
