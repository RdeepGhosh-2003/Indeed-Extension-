/**
 * Lightweight DOM Simulator for Indeed Extension Isolation Tests
 * Supports element creation, attributes, DOM hierarchy, and selector matching
 */

if (!global.CSS) {
  global.CSS = {
    escape: function(str) {
      return String(str).replace(/([^\w-])/g, '\\$1');
    }
  };
}

class SimulatedElement {
  constructor(tagName, attrs = {}, textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.classList = new Set();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.nextSibling = null;
    this.previousElementSibling = null;
    this.dataset = {};
    this.style = {};
    this.value = attrs.value || '';
    this.disabled = !!attrs.disabled;
    this.readOnly = !!attrs.readOnly;
    this.checked = !!attrs.checked;
    this.offsetWidth = attrs.offsetWidth !== undefined ? attrs.offsetWidth : 100;
    this.offsetHeight = attrs.offsetHeight !== undefined ? attrs.offsetHeight : 30;

    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'class' || key === 'className') {
        val.split(/\s+/).forEach(c => c && this.classList.add(c));
      } else if (key.startsWith('data-')) {
        const camelKey = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        this.dataset[camelKey] = val;
        this.attributes[key] = val;
      } else {
        this.attributes[key] = val;
      }
    }

    this._textContent = textContent;
  }

  get id() { return this.attributes['id'] || ''; }
  set id(val) { this.attributes['id'] = val; }

  get name() { return this.attributes['name'] || ''; }
  set name(val) { this.attributes['name'] = val; }

  get placeholder() { return this.attributes['placeholder'] || ''; }
  set placeholder(val) { this.attributes['placeholder'] = val; }

  get type() { return this.attributes['type'] || 'text'; }
  set type(val) { this.attributes['type'] = val; }

  get textContent() {
    let text = this._textContent;
    for (const child of this.children) {
      text += ' ' + child.textContent;
    }
    return text.trim();
  }

  set textContent(val) {
    this._textContent = val;
    this.children = [];
  }

  get options() {
    if (this.tagName !== 'SELECT') return [];
    return this.children.filter(c => c.tagName === 'OPTION');
  }

  getAttribute(attr) {
    return this.attributes[attr] !== undefined ? String(this.attributes[attr]) : null;
  }

  setAttribute(attr, val) {
    this.attributes[attr] = String(val);
    if (attr === 'class') {
      this.classList.clear();
      String(val).split(/\s+/).forEach(c => c && this.classList.add(c));
    }
  }

  hasAttribute(attr) {
    return this.attributes[attr] !== undefined;
  }

  removeAttribute(attr) {
    delete this.attributes[attr];
  }

  appendChild(child) {
    child.parentElement = this;
    child.parentNode = this;
    if (this.children.length > 0) {
      const last = this.children[this.children.length - 1];
      last.nextSibling = child;
      child.previousElementSibling = last;
    }
    this.children.push(child);
    return child;
  }

  matches(selector) {
    const sel = selector.trim();

    if (sel.includes(':checked')) {
      if (!this.checked) return false;
      const baseSel = sel.replace(':checked', '');
      return baseSel ? this.matches(baseSel) : true;
    }

    // Comma separated selectors
    if (sel.includes(',')) {
      return sel.split(',').some(sub => this.matches(sub));
    }

    // Direct tag check
    if (/^[a-zA-Z0-9]+$/.test(sel)) {
      return this.tagName === sel.toUpperCase();
    }

    // ID selector
    if (sel.startsWith('#')) {
      return this.id === sel.slice(1);
    }

    // Class selector
    if (sel.startsWith('.')) {
      return this.classList.has(sel.slice(1));
    }

    // Tag#id
    const tagIdMatch = sel.match(/^([a-zA-Z0-9]+)#([a-zA-Z0-9_-]+)$/);
    if (tagIdMatch) {
      return this.tagName === tagIdMatch[1].toUpperCase() && this.id === tagIdMatch[2];
    }

    // Tag.class
    const tagClassMatch = sel.match(/^([a-zA-Z0-9]+)\.([a-zA-Z0-9_-]+)$/);
    if (tagClassMatch) {
      return this.tagName === tagClassMatch[1].toUpperCase() && this.classList.has(tagClassMatch[2]);
    }

    // Attribute selector [attr=val], [attr*=val], [attr]
    const attrMatch = sel.match(/^(?:([a-zA-Z0-9]+))?\[([a-zA-Z0-9_-]+)(?:([\*\^$=])"?([^"\]]*)"?)?\]$/);
    if (attrMatch) {
      const [, tag, attr, op, val] = attrMatch;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (!this.hasAttribute(attr)) return false;
      if (!op) return true;
      const actualVal = this.getAttribute(attr);
      if (op === '=') return actualVal === val;
      if (op === '*=') return actualVal.includes(val);
      if (op === '^=') return actualVal.startsWith(val);
      if (op === '$=') return actualVal.endsWith(val);
    }

    // Compound selector like div[role="dialog"][aria-modal="true"] or form[class*="jobalert"]
    const compoundMatch = sel.match(/^([a-zA-Z0-9]+)(\[[^\]]+\])+$/) || sel.match(/^(\[[^\]]+\]){2,}$/);
    if (compoundMatch) {
      const tag = compoundMatch[1];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const attrBlocks = sel.match(/\[[^\]]+\]/g);
      for (const block of attrBlocks) {
        if (!this.matches(block)) return false;
      }
      return true;
    }

    return false;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results.length > 0 ? results[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }

  dispatchEvent(event) {
    return true;
  }

  addEventListener() {}
  removeEventListener() {}

  cloneNode(deep) {
    const clone = new SimulatedElement(this.tagName, { ...this.attributes }, this._textContent);
    if (deep) {
      for (const child of this.children) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    }
  }
}

class SimulatedDocument extends SimulatedElement {
  constructor() {
    super('DOCUMENT');
    this.body = new SimulatedElement('BODY');
    this.appendChild(this.body);
  }

  createElement(tagName) {
    return new SimulatedElement(tagName);
  }

  createTextNode(text) {
    return new SimulatedElement('SPAN', {}, text);
  }

  getElementById(id) {
    const results = this.querySelectorAll(`#${id}`);
    return results.length > 0 ? results[0] : null;
  }
}

function createDOM() {
  const doc = new SimulatedDocument();
  global.document = doc;
  global.MutationObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
  };
  global.window = {
    document: doc,
    location: { href: 'https://www.indeed.com/jobs?q=developer' },
    Event: function(type) { return { type }; },
    HTMLInputElement: { prototype: {} },
    HTMLTextAreaElement: { prototype: {} },
    HTMLSelectElement: { prototype: {} },
    MutationObserver: global.MutationObserver
  };
  return doc;
}

module.exports = {
  SimulatedElement,
  SimulatedDocument,
  createDOM
};
