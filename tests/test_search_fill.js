/**
 * Unit & Integration Test Suite for Indeed Search Fill Feature
 * Tests UI Injection, Domain Filtering, Search Bar Absence Guard, Storage Retrieval,
 * Fallback Unwrapping, and Native Event Dispatching.
 */

const assert = require('assert');
const { createDOM, SimulatedElement } = require('./simulated_dom');

// Initialize DOM environment before loading matcher
const doc = createDOM();
const SpeedFillMatcher = require('../scripts/matcher');

let passCount = 0;
let failCount = 0;
const results = [];

function testAssert(condition, testName, details = '') {
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

// Mock chrome.storage.local API
const mockStorage = {};
global.chrome = {
  storage: {
    local: {
      get: function(key, callback) {
        if (key === null) {
          callback(mockStorage);
        } else if (Array.isArray(key)) {
          const res = {};
          key.forEach(k => res[k] = mockStorage[k]);
          callback(res);
        } else if (typeof key === 'string') {
          callback({ [key]: mockStorage[key] });
        } else {
          callback(mockStorage);
        }
      },
      set: function(obj, callback) {
        Object.assign(mockStorage, obj);
        if (callback) callback();
      }
    },
    onChanged: {
      addListener: function() {}
    }
  },
  runtime: {
    getURL: (path) => path,
    sendMessage: (msg, cb) => cb && cb({}),
    onMessage: { addListener: () => {} }
  }
};

function runSearchFillTests() {
  console.log('====================================================');
  console.log('STARTING INDEED SEARCH FILL TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: Domain Restriction Guard
  console.log('--- TEST 1: Domain Restriction Guard ---');
  global.window.location = { hostname: 'google.com', href: 'https://google.com' };
  
  const isIndeedOtherDomain = SpeedFillMatcher.isIndeedPage(global.window.location.hostname);
  testAssert(
    isIndeedOtherDomain === false,
    'isIndeedPage returns FALSE on non-indeed.com domain',
    `Hostname: ${global.window.location.hostname}`
  );

  global.window.location = { hostname: 'www.indeed.com', href: 'https://www.indeed.com' };
  const isIndeedPageValid = SpeedFillMatcher.isIndeedPage(global.window.location.hostname);
  testAssert(
    isIndeedPageValid === true,
    'isIndeedPage returns TRUE on www.indeed.com',
    `Hostname: ${global.window.location.hostname}`
  );

  // TEST 2: Storage Data Extraction & Fallback Unwrapping
  console.log('\n--- TEST 2: Storage Data Extraction & Fallbacks ---');
  
  // 2.1 Standard Target Role Profile
  const profileStandard = {
    work: {
      targetRole: { jobTitle: 'Senior React Developer', targetLocation: 'New York, NY' },
      currentRole: { jobTitle: 'Junior Dev', company: 'Acme' },
      recentJobTitle: 'Dev'
    },
    personal: { city: 'Boston' }
  };

  const extracted1 = SpeedFillMatcher.extractSearchFillData(profileStandard);
  testAssert(
    extracted1.jobTitle === 'Senior React Developer' && extracted1.targetLocation === 'New York, NY',
    'Extract targetRole jobTitle and targetLocation when present',
    `Result: ${JSON.stringify(extracted1)}`
  );

  // 2.2 Empty Target Role with Fallback to recentJobTitle & city
  const profileFallback = {
    work: {
      targetRole: { jobTitle: '', targetLocation: '' },
      currentRole: { jobTitle: 'Full Stack Engineer' },
      recentJobTitle: 'Lead Architect'
    },
    personal: { city: 'Bengaluru' }
  };

  const extracted2 = SpeedFillMatcher.extractSearchFillData(profileFallback);
  testAssert(
    extracted2.jobTitle === 'Full Stack Engineer' && extracted2.targetLocation === 'Bengaluru',
    'Fallback unwrap to currentRole/recentJobTitle and personal.city when targetRole is empty',
    `Result: ${JSON.stringify(extracted2)}`
  );

  // 2.3 Top-level unwrapped profile
  const profileTopLevel = {
    recentJobTitle: 'DevOps Engineer',
    city: 'San Francisco, CA'
  };

  const extracted3 = SpeedFillMatcher.extractSearchFillData(profileTopLevel);
  testAssert(
    extracted3.jobTitle === 'DevOps Engineer' && extracted3.targetLocation === 'San Francisco, CA',
    'Fallback unwrap to top-level recentJobTitle and city',
    `Result: ${JSON.stringify(extracted3)}`
  );

  // TEST 3: Search Bar & Inputs Helper Detection
  console.log('\n--- TEST 3: Search Container & Input Resolution ---');
  
  const testDoc = createDOM();
  const searchForm = new SimulatedElement('FORM', { id: 'jobsearch', role: 'search' });
  const whatInput = new SimulatedElement('INPUT', { id: 'text-input-what', name: 'q' });
  const whereInput = new SimulatedElement('INPUT', { id: 'text-input-where', name: 'l' });
  
  searchForm.appendChild(whatInput);
  searchForm.appendChild(whereInput);
  testDoc.body.appendChild(searchForm);

  const foundContainer = SpeedFillMatcher.findSearchContainer(testDoc);
  testAssert(
    foundContainer === searchForm,
    'findSearchContainer locates #jobsearch form',
    `Found container tag: ${foundContainer ? foundContainer.tagName : 'null'}`
  );

  const foundInputs = SpeedFillMatcher.getSearchInputs(testDoc);
  testAssert(
    foundInputs.whatInput === whatInput && foundInputs.whereInput === whereInput,
    'getSearchInputs resolves #text-input-what and #text-input-where',
    `whatInput found: ${!!foundInputs.whatInput}, whereInput found: ${!!foundInputs.whereInput}`
  );

  // TEST 4: Native Property Setter & React Event Dispatching
  console.log('\n--- TEST 4: Native Input Value Setter & Event Dispatch ---');
  
  const targetInput = new SimulatedElement('INPUT', { id: 'text-input-what', name: 'q' });
  let eventsDispatched = [];
  targetInput.dispatchEvent = function(event) {
    eventsDispatched.push(event.type);
    return true;
  };
  targetInput._valueTracker = {
    setValue: function(val) {
      targetInput._trackerVal = val;
    }
  };

  const setSuccess = SpeedFillMatcher.setNativeInputValue(targetInput, 'Frontend Lead');
  
  testAssert(
    setSuccess === true && targetInput.value === 'Frontend Lead',
    'setNativeInputValue sets input value correctly',
    `Input value: ${targetInput.value}`
  );

  testAssert(
    targetInput._trackerVal === '',
    'setNativeInputValue resets _valueTracker.setValue("")',
    `Tracker value: ${targetInput._trackerVal}`
  );

  testAssert(
    eventsDispatched.includes('input') && eventsDispatched.includes('change') && eventsDispatched.includes('blur'),
    'setNativeInputValue dispatches bubbling input, change, and blur native events',
    `Events dispatched: ${eventsDispatched.join(', ')}`
  );

  // SUMMARY REPORT
  console.log('\n====================================================');
  console.log(`SEARCH FILL TEST RESULTS SUMMARY: PASSED=${passCount}, FAILED=${failCount}`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  return { passCount, failCount, results };
}

if (require.main === module) {
  runSearchFillTests();
}

module.exports = { runSearchFillTests };
