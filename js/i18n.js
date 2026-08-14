/* Auto-translation layer. SOURCE_LANG is editable if the page's source language changes. */
const SOURCE_LANG = 'fr';

(() => {
  'use strict';
  const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);
  const STORAGE_LANG = '__i18n_lang';
  const CACHE_PREFIX = '__i18n_cache_v1:';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  let target = null;
  let timer = null;
  let scanAgain = false;

  const baseLang = (code) => String(code || '').trim().toLowerCase().replace(/_/g, '-').split('-')[0] || SOURCE_LANG;
  const browserLang = () => {
    const saved = localStorage.getItem(STORAGE_LANG);
    if (saved) return baseLang(saved);
    const languages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
    return baseLang(languages.find(Boolean));
  };
  const hash = (value) => { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const cacheKey = (text) => `${CACHE_PREFIX}${target}:${hash(text)}`;
  const cached = (text) => { try { return localStorage.getItem(cacheKey(text)); } catch (_) { return null; } };
  const putCache = (text, translated) => { try { localStorage.setItem(cacheKey(text), translated); } catch (_) {} };
  const skipped = (el) => { for (let node = el; node; node = node.parentElement) if (SKIP.has(node.tagName) || node.hasAttribute('data-no-translate')) return true; return false; };
  const addText = (node, texts, updates) => {
    if (!node.parentElement || skipped(node.parentElement)) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const text = originalText.get(node);
    if (text.trim()) { texts.push(text); updates.push(() => { node.nodeValue = translated(text); }); }
  };
  const translatedValues = new Map();
  const translated = (text) => translatedValues.get(text) || cached(text) || text;
  const collect = () => {
    const texts = [], updates = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) addText(node, texts, updates);
    (document.body || document.documentElement).querySelectorAll('*').forEach((el) => {
      if (skipped(el)) return;
      const attrs = ['placeholder', 'title', 'alt', 'aria-label'];
      if (el.matches('input[type="button"], input[type="submit"]')) attrs.push('value');
      let originals = originalAttrs.get(el); if (!originals) { originals = {}; originalAttrs.set(el, originals); }
      attrs.forEach((attr) => { if (!el.hasAttribute(attr)) return; if (!(attr in originals)) originals[attr] = el.getAttribute(attr); const text = originals[attr]; if (text?.trim()) { texts.push(text); updates.push(() => el.setAttribute(attr, translated(text))); } });
    });
    return { texts: [...new Set(texts)], updates };
  };
  const run = async () => {
    if (!target || target === SOURCE_LANG) return;
    const { texts, updates } = collect();
    const missing = texts.filter((text) => !cached(text));
    if (missing.length) {
      try {
        const response = await fetch('/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: missing, source: SOURCE_LANG, target }) });
        if (!response.ok) throw new Error('translation request failed');
        const data = await response.json();
        (data.translations || []).forEach((value, i) => { if (typeof value === 'string') { translatedValues.set(missing[i], value); putCache(missing[i], value); } });
      } catch (_) { /* graceful failure: original DOM values remain in place */ }
    }
    updates.forEach((update) => update());
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { timer = null; run(); }, 150); };
  const setLang = (code) => { target = baseLang(code); localStorage.setItem(STORAGE_LANG, target); document.documentElement.lang = target; document.documentElement.dir = RTL_LANGS.has(target) ? 'rtl' : 'ltr'; translatedValues.clear(); collect().updates.forEach((update) => update()); if (target !== SOURCE_LANG) schedule(); };
  window.__i18n = { setLang };
  const start = () => { setLang(browserLang()); new MutationObserver(() => schedule()).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'alt', 'aria-label', 'value'] }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
