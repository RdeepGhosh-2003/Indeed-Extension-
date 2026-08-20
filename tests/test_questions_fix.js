/**
 * Empirical Unit & DOM Integration Test Suite for SpeedFill Questions Fix
 * Tests proficiency rating matching, degree normalization, notice period normalization,
 * office location willingness, and non-blocking auto-advance.
 */

const { SimulatedDocument, createDOM, SimulatedElement } = require('./simulated_dom');
const SpeedFillMatcher = require('../scripts/matcher');

// Load content script logic in global context
const doc = createDOM();
global.SpeedFillMatcher = SpeedFillMatcher;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('STARTING SPEEDFILL QUESTIONS FIXempIRICAL TEST SUITE');
console.log('====================================================\n');

// --- TEST SUITE 1: Normalizer Helpers & Classifiers ---
console.log('--- TEST SUITE 1: Normalizer Helpers & Classifiers ---');

assert(
  SpeedFillMatcher.normalizeDegreeCategory('B.Tech') === 'bachelor' &&
  SpeedFillMatcher.normalizeDegreeCategory('Bachelor of Engineering') === 'bachelor' &&
  SpeedFillMatcher.normalizeDegreeCategory("Bachelor's Degree") === 'bachelor' &&
  SpeedFillMatcher.normalizeDegreeCategory('Graduation') === 'bachelor',
  'normalizeDegreeCategory maps B.Tech, B.E., Bachelor, Graduation to "bachelor"'
);

assert(
  SpeedFillMatcher.normalizeDegreeCategory('M.Tech') === 'master' &&
  SpeedFillMatcher.normalizeDegreeCategory('MBA') === 'master' &&
  SpeedFillMatcher.normalizeDegreeCategory("Master's Degree") === 'master',
  'normalizeDegreeCategory maps M.Tech, MBA, Master to "master"'
);

assert(
  SpeedFillMatcher.normalizeDegreeCategory('Ph.D') === 'doctorate' &&
  SpeedFillMatcher.normalizeDegreeCategory('Doctorate') === 'doctorate',
  'normalizeDegreeCategory maps Ph.D & Doctorate to "doctorate"'
);

assert(
  SpeedFillMatcher.normalizeDegreeCategory('12th') === 'highschool' &&
  SpeedFillMatcher.normalizeDegreeCategory('High School') === 'highschool' &&
  SpeedFillMatcher.normalizeDegreeCategory('Higher Secondary') === 'highschool',
  'normalizeDegreeCategory maps 12th & High School to "highschool"'
);

assert(
  SpeedFillMatcher.normalizeNoticePeriod('30 Days') === '30days' &&
  SpeedFillMatcher.normalizeNoticePeriod('1 Month') === '30days' &&
  SpeedFillMatcher.normalizeNoticePeriod('30 days / 1 month') === '30days',
  'normalizeNoticePeriod maps 30 Days and 1 Month to "30days"'
);

assert(
  SpeedFillMatcher.normalizeNoticePeriod('Immediate') === 'immediate' &&
  SpeedFillMatcher.normalizeNoticePeriod('0 Days') === 'immediate' &&
  SpeedFillMatcher.normalizeNoticePeriod('Serving Notice') === 'immediate',
  'normalizeNoticePeriod maps Immediate & Serving Notice to "immediate"'
);

assert(
  SpeedFillMatcher.normalizeProficiencyLevel('Beginner') === 'beginner' &&
  SpeedFillMatcher.normalizeProficiencyLevel('Intermediate') === 'intermediate' &&
  SpeedFillMatcher.normalizeProficiencyLevel('Advanced') === 'advanced' &&
  SpeedFillMatcher.normalizeProficiencyLevel('Expert') === 'expert',
  'normalizeProficiencyLevel maps Beginner, Intermediate, Advanced, Expert'
);

assert(
  SpeedFillMatcher.isProficiencyQuestion('How would you rate your SQL proficiency?') &&
  SpeedFillMatcher.isProficiencyQuestion('Rate your proficiency in Python') &&
  SpeedFillMatcher.isProficiencyQuestion('What is your skill level in JavaScript?'),
  'isProficiencyQuestion identifies skill proficiency rating questions'
);

assert(
  SpeedFillMatcher.isOfficeOrCommuteQuestion('Are you willing to work from our Nacharam, Hyderabad office (5 days/week)?') &&
  SpeedFillMatcher.isOfficeOrCommuteQuestion('Are you able to commute to this location?'),
  'isOfficeOrCommuteQuestion identifies office location & commute questions'
);

// --- TEST SUITE 2: Content Script Form Logic Integration ---
console.log('\n--- TEST SUITE 2: Content Script Form Logic Integration ---');

// Mock content script scope
const fs = require('fs');
let contentScriptCode = fs.readFileSync('./scripts/content.js', 'utf8');

// Strip IIFE wrapper for testing
const firstBrace = contentScriptCode.indexOf('{');
const lastBrace = contentScriptCode.lastIndexOf('}');
contentScriptCode = contentScriptCode.slice(firstBrace + 1, lastBrace);

// Inject window methods & DOM for content script execution
global.SpeedFillMatcher = SpeedFillMatcher;
global.window.SpeedFillMatcher = SpeedFillMatcher;
global.chrome = {
  storage: {
    local: {
      get: (keys, callback) => callback({
        userProfile: {
          personal: { fullName: "John Doe", city: "Hyderabad" },
          work: {
            currentRole: { jobTitle: "Software Engineer", yearsExperience: "3" },
            targetRole: { noticePeriod: "30 Days" },
            defaultProficiency: "Advanced"
          },
          education: { degree: "B.Tech", major: "Computer Science" },
          screening: [
            { keywords: "sql, database", answer: "Advanced" }
          ],
          settings: { autoFillOnLoad: true, autoAdvanceStep: true, pauseOnUnmatchedFields: true }
        }
      }),
      set: () => {}
    },
    onChanged: { addListener: () => {} }
  },
  runtime: {
    getURL: () => '',
    sendMessage: () => {},
    onMessage: { addListener: () => {} }
  }
};

eval(contentScriptCode);

// DOM Test 1: Question 1 - SQL Proficiency Radios
const appModal = document.createElement('div');
appModal.id = 'ia-container';
document.body.appendChild(appModal);

// Force userProfile set synchronously
global.userProfile = {
  personal: { fullName: "John Doe", city: "Hyderabad" },
  work: {
    currentRole: { jobTitle: "Software Engineer", yearsExperience: "3" },
    targetRole: { noticePeriod: "30 Days" },
    defaultProficiency: "Advanced"
  },
  education: { degree: "B.Tech", major: "Computer Science" },
  screening: [
    { keywords: "sql, database", answer: "Advanced" }
  ],
  settings: { autoFillOnLoad: true, autoAdvanceStep: true, pauseOnUnmatchedFields: true }
};

const q1Container = document.createElement('fieldset');
const q1Legend = document.createElement('legend');
q1Legend.textContent = 'How would you rate your SQL proficiency? *';
q1Container.appendChild(q1Legend);

['Beginner', 'Intermediate', 'Advanced', 'Expert'].forEach((level, idx) => {
  const lbl = document.createElement('label');
  lbl.setAttribute('for', `sql_radio_${idx}`);
  const r = document.createElement('input');
  r.type = 'radio';
  r.name = 'sql_prof';
  r.id = `sql_radio_${idx}`;
  r.value = level;
  lbl.appendChild(r);
  lbl.appendChild(document.createTextNode(level));
  q1Container.appendChild(lbl);
});
appModal.appendChild(q1Container);

// Execute radio groups handler directly
handleRadioGroups(appModal);

const selectedSql = q1Container.querySelector('input[type="radio"]:checked');
assert(selectedSql !== null, 'Question 1 (SQL proficiency radio group) was auto-selected');
assert(selectedSql && selectedSql.value.toLowerCase() === 'advanced', 'SQL proficiency matched screening answer "Advanced"');

// DOM Test 2: Question 2 - Highest Qualification Select Dropdown
const q2Container = document.createElement('div');
q2Container.className = 'ia-Questions-item';
const q2Label = document.createElement('label');
q2Label.id = 'q2_label';
q2Label.textContent = 'What is your highest qualification? *';
q2Container.appendChild(q2Label);

const selectEl = document.createElement('select');
selectEl.setAttribute('aria-labelledby', 'q2_label');
['Select an option', 'Doctorate', "Master's Degree", "Bachelor's Degree", 'High School'].forEach(optText => {
  const opt = document.createElement('option');
  opt.value = optText === 'Select an option' ? '' : optText;
  opt.textContent = optText;
  selectEl.appendChild(opt);
});
q2Container.appendChild(selectEl);
appModal.appendChild(q2Container);

const selectSuccess = setSelectValue(selectEl, 'B.Tech');
assert(selectSuccess === true && selectEl.value === "Bachelor's Degree", 'Question 2 (Highest Qualification dropdown) matched "B.Tech" to "Bachelor\'s Degree"');

// DOM Test 3: Question 3 - Nacharam, Hyderabad Office Willingness Radios
const q3Container = document.createElement('fieldset');
const q3Legend = document.createElement('legend');
q3Legend.textContent = 'Are you willing to work from our Nacharam, Hyderabad office (5 days/week)? *';
q3Container.appendChild(q3Legend);

['Yes', 'No'].forEach((ans, idx) => {
  const lbl = document.createElement('label');
  lbl.setAttribute('for', `office_radio_${idx}`);
  const r = document.createElement('input');
  r.type = 'radio';
  r.name = 'office_work';
  r.id = `office_radio_${idx}`;
  r.value = ans;
  lbl.appendChild(r);
  lbl.appendChild(document.createTextNode(ans));
  q3Container.appendChild(lbl);
});
appModal.appendChild(q3Container);

handleRadioGroups(appModal);
const selectedOffice = q3Container.querySelector('input[type="radio"]:checked');
assert(selectedOffice !== null && selectedOffice.value === 'Yes', 'Question 3 (Office willingness radio group) auto-selected "Yes"');

// DOM Test 4: Question 4 - Notice Period Radios
const q4Container = document.createElement('fieldset');
const q4Legend = document.createElement('legend');
q4Legend.textContent = 'What is your notice period? *';
q4Container.appendChild(q4Legend);

['Immediate', '15 Days', '30 Days', '60 Days'].forEach((np, idx) => {
  const lbl = document.createElement('label');
  lbl.setAttribute('for', `notice_radio_${idx}`);
  const r = document.createElement('input');
  r.type = 'radio';
  r.name = 'notice_period';
  r.id = `notice_radio_${idx}`;
  r.value = np;
  lbl.appendChild(r);
  lbl.appendChild(document.createTextNode(np));
  q4Container.appendChild(lbl);
});
appModal.appendChild(q4Container);

handleRadioGroups(appModal);
const selectedNotice = q4Container.querySelector('input[type="radio"]:checked');
assert(selectedNotice !== null && selectedNotice.value === '30 Days', 'Question 4 (Notice Period radio group) matched "30 Days"');

console.log('\n====================================================');
console.log(`TEST RESULTS SUMMARY: PASSED=${passed}, FAILED=${failed}`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
