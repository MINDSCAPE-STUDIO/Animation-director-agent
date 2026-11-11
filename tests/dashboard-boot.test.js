const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DASHBOARD_SOURCE = fs.readFileSync(path.join(ROOT, 'dashboard.js'), 'utf8');

const elements = new Map();
const insertions = [];
const listeners = new Map();

const root = {
  id: 'root',
  insertBefore(node) { insertions.push({ parent: 'root', node }); node.parentNode = root; return node; },
  appendChild(child) { child.parentNode = root; return child; }
};

function registerElement(id) {
  if (elements.has(id)) return elements.get(id);
  const element = {
    tagName: 'DIV',
    id,
    className: '',
    textContent: '',
    title: '',
    href: '',
    style: {},
    children: [],
    _innerHTML: '',
    parentNode: root,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(node) { this.children.push(node); node.parentNode = this; insertions.push({ parent: this.id, node }); return node; },
    addEventListener(type, handler) {
      const key = `${this.id}:${type}`;
      listeners.set(key, [...(listeners.get(key) || []), handler]);
    },
    classList: {
      add() {}, remove() {}, contains() { return false; }
    },
    scrollIntoView() {},
    set innerHTML(html) {
      this._innerHTML = html;
      if (typeof html === 'string') {
        for (const match of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) registerElement(match[1]);
      }
    },
    get innerHTML() { return this._innerHTML; }
  };
  elements.set(id, element);
  return element;
}

const body = {
  appendChild() {},
  insertBefore() {}
};

global.document = {
  getElementById: id => elements.get(id) || null,
  createElement: tag => {
    const element = { tagName: tag.toUpperCase(), id: '', className: '', textContent: '', title: '', style: {}, children: [], parentNode: null };
    Object.defineProperty(element, 'id', {
      set(value) { this._id = value; if (value) registerElement(value); },
      get() { return this._id || ''; }
    });
    Object.defineProperty(element, 'innerHTML', {
      set(html) { this._html = html; if (typeof html === 'string') { for (const match of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) registerElement(match[1]); } },
      get() { return this._html || ''; }
    });
    element.appendChild = child => { element.children.push(child); return child; };
    element.addEventListener = (type, handler) => {
      const key = `${element.id || 'anonymous'}:${type}`;
      listeners.set(key, [...(listeners.get(key) || []), handler]);
    };
    element.classList = { add() {}, remove() {} };
    element.scrollIntoView = () => {};
    return element;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  head: { appendChild() {} },
  body
};
global.window = {};
global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.fetch = async () => { throw new Error('offline test environment'); };
const realSetInterval = global.setInterval;
global.setInterval = () => 0;

for (const match of INDEX_HTML.matchAll(/id="([A-Za-z0-9_-]+)"/g)) registerElement(match[1]);

require(path.join(ROOT, 'dashboard.js'));

test('dashboard wires the Production Intelligence panel into the page', async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  const inserted = insertions.filter(entry => entry.node.id === 'production-intelligence');
  assert.equal(inserted.length, 1, 'production-intelligence section should be inserted exactly once');
  assert.equal(inserted[0].parent, 'root');
  assert.ok(listeners.has('routeDetail:click'), 'route detail button should have a click listener');
});

test('dashboard refresh cycle populates live elements without a live backend', async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(elements.get('systemStatus').textContent, 'Configuration Attention');
  assert.equal(elements.get('healthPercent').textContent, '0%');
  assert.equal(elements.get('nanoStatus').textContent.startsWith('● '), true);
  assert.equal(elements.get('wanStatus').textContent.startsWith('● '), true);
  assert.equal(elements.get('nanoEngineName').textContent, 'Image engine');
  assert.equal(elements.get('wanEngineName').textContent, 'Video engine');
  assert.equal(elements.get('timelineState').textContent, 'READY');
  assert.equal(elements.get('queueRows').innerHTML.length > 0, true);
});

test('every element id looked up by the dashboard exists in static or injected HTML', () => {
  const lookup = new Set();
  for (const match of DASHBOARD_SOURCE.matchAll(/\$\((?:'|"|`)([A-Za-z0-9_-]+)(?:'|"|`)\)/g)) lookup.add(match[1]);
  for (const match of DASHBOARD_SOURCE.matchAll(/getElementById\((?:'|"|`)([A-Za-z0-9_-]+)(?:'|"|`)\)/g)) lookup.add(match[1]);
  const defined = new Set();
  for (const match of INDEX_HTML.matchAll(/id="([A-Za-z0-9_-]+)"/g)) defined.add(match[1]);
  for (const match of DASHBOARD_SOURCE.matchAll(/id="([A-Za-z0-9_-]+)"/g)) defined.add(match[1]);
  // refreshDashboard and the style/panel guards are intentionally optional lookups.
  const optional = new Set(['refreshDashboard', 'mindscape-intelligence-styles', 'production-intelligence']);
  const missing = [...lookup].filter(id => !defined.has(id) && !optional.has(id));
  assert.deepEqual(missing, [], 'dashboard references ids that exist nowhere in the UI');
});

after(() => {
  global.setInterval = realSetInterval;
});
