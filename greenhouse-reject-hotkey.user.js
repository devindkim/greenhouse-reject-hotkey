// ==UserScript==
// @name         Greenhouse Reject Hotkey
// @namespace    https://github.com/devindkim/greenhouse-reject-hotkey
// @version      0.1.0
// @description  One-key candidate rejection for Greenhouse Recruiting, with a short undo window.
// @author       devindkim
// @match        https://*.greenhouse.io/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG — tweak these to taste.
  // ---------------------------------------------------------------------------
  const CONFIG = {
    // Which key triggers a reject. Single character, case-insensitive.
    hotkey: 'r',
    // Optional modifiers. Set to true to require them alongside the hotkey.
    requireCtrl: false,
    requireShift: false,
    requireAlt: false,

    // 'full'   -> open the reject modal, pick the default reason, and submit.
    // 'dialog' -> just open the reject modal and stop (you finish by hand).
    mode: 'full',

    // Substring (case-insensitive) matched against the rejection-reason options.
    // The first option whose visible text contains this wins. Leave '' to skip
    // reason selection and just submit whatever is preselected.
    defaultReason: 'Other',

    // Undo window (ms) shown before the modal is auto-submitted in 'full' mode.
    // Press Esc during this window to cancel. Set to 0 to submit immediately.
    graceMs: 2500,

    // Verbose logging to the console, plus element dumps to help you fix
    // selectors on your Greenhouse instance.
    debug: false,

    // --- Selectors. Greenhouse ships DOM changes periodically; if the script
    // stops finding things, flip debug=true and adjust these. Each entry is a
    // list of CSS selectors tried in order; text-based fallbacks run after.
    selectors: {
      // The "Reject" control on a candidate profile.
      rejectTrigger: ['a.reject', 'a[href*="reject"]', 'button.reject'],
      rejectTriggerText: ['reject'],

      // The rejection-reason picker inside the modal.
      reasonSelect: ['#rejection_reason_id', 'select[name*="rejection_reason"]', 'select[id*="reason"]'],

      // The confirm/submit button inside the modal.
      submitButton: ['input[type="submit"][value*="Reject"]', 'button[type="submit"]'],
      submitButtonText: ['reject candidate', 'reject application', 'confirm', 'reject'],
    },
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const log = (...a) => CONFIG.debug && console.log('[gh-reject]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function isTypingContext() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable
    );
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // Poll until predicate returns a truthy value or timeout elapses.
  async function waitFor(predicate, { timeout = 6000, interval = 100 } = {}) {
    const start = Date.now();
    for (;;) {
      const value = predicate();
      if (value) return value;
      if (Date.now() - start >= timeout) return null;
      await sleep(interval);
    }
  }

  // Find the first visible element matching any CSS selector, then fall back to
  // matching visible <a>/<button>/<input> elements by their text/value.
  function findControl(cssSelectors, textNeedles, root = document) {
    for (const sel of cssSelectors || []) {
      const els = Array.from(root.querySelectorAll(sel)).filter(isVisible);
      if (els.length) return els[0];
    }
    if (textNeedles && textNeedles.length) {
      const candidates = Array.from(
        root.querySelectorAll('a, button, input[type="submit"], input[type="button"]')
      ).filter(isVisible);
      for (const needle of textNeedles) {
        const n = norm(needle);
        const hit = candidates.find((el) => {
          const label = norm(el.value || el.textContent);
          return label === n || label.includes(n);
        });
        if (hit) return hit;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Toast / undo UI
  // ---------------------------------------------------------------------------
  let toastEl = null;
  function toast(message, { spinner = false } = {}) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 2147483647,
        background: '#1f2933',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        font: '13px/1.4 -apple-system, system-ui, sans-serif',
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        maxWidth: '320px',
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.style.opacity = '1';
    return toastEl;
  }
  function hideToast(delay = 0) {
    if (!toastEl) return;
    setTimeout(() => {
      if (toastEl) toastEl.style.opacity = '0';
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Core flow
  // ---------------------------------------------------------------------------
  function selectReason(modalRoot) {
    if (!CONFIG.defaultReason) return true;
    const select = findControl(CONFIG.selectors.reasonSelect, null, modalRoot);
    if (!select || select.tagName !== 'SELECT') {
      log('reason <select> not found; leaving preselected value');
      return false;
    }
    const needle = norm(CONFIG.defaultReason);
    const option = Array.from(select.options).find((o) =>
      norm(o.textContent).includes(needle)
    );
    if (!option) {
      log('no reason option matched', CONFIG.defaultReason);
      return false;
    }
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    log('selected reason:', option.textContent.trim());
    return true;
  }

  async function runReject() {
    // 1. Open the reject modal.
    const trigger = findControl(
      CONFIG.selectors.rejectTrigger,
      CONFIG.selectors.rejectTriggerText
    );
    if (!trigger) {
      toast('Reject button not found on this page.');
      hideToast(2500);
      log('no reject trigger. Are you on a candidate profile?');
      return;
    }
    log('clicking reject trigger', trigger);
    trigger.click();

    // 2. Wait for the modal (detected via its reason select or submit button).
    const modalReady = await waitFor(() => {
      const reason = findControl(CONFIG.selectors.reasonSelect, null);
      const submit = findControl(
        CONFIG.selectors.submitButton,
        CONFIG.selectors.submitButtonText
      );
      return reason || submit ? { reason, submit } : null;
    });

    if (!modalReady) {
      toast('Reject modal did not open.');
      hideToast(2500);
      return;
    }

    if (CONFIG.mode === 'dialog') {
      toast('Reject dialog opened. Finish it by hand.');
      hideToast(2500);
      return;
    }

    // 3. Pick the default reason.
    selectReason(document);

    // 4. Grace / undo window, then submit.
    let cancelled = false;
    const onEsc = (e) => {
      if (e.key === 'Escape') cancelled = true;
    };
    document.addEventListener('keydown', onEsc, true);

    const remainingS = () => Math.ceil((deadline - Date.now()) / 1000);
    const deadline = Date.now() + CONFIG.graceMs;
    while (Date.now() < deadline && !cancelled) {
      toast(`Rejecting in ${remainingS()}s… press Esc to cancel`);
      await sleep(150);
    }
    document.removeEventListener('keydown', onEsc, true);

    if (cancelled) {
      toast('Reject cancelled. Modal left open.');
      hideToast(2000);
      return;
    }

    const submit = findControl(
      CONFIG.selectors.submitButton,
      CONFIG.selectors.submitButtonText
    );
    if (!submit) {
      toast('Submit button not found; finish it by hand.');
      hideToast(3000);
      return;
    }
    log('submitting', submit);
    submit.click();
    toast('Candidate rejected.');
    hideToast(2000);
  }

  // ---------------------------------------------------------------------------
  // Hotkey wiring
  // ---------------------------------------------------------------------------
  let running = false;
  function matchesHotkey(e) {
    if (norm(e.key) !== norm(CONFIG.hotkey)) return false;
    if (CONFIG.requireCtrl !== (e.ctrlKey || e.metaKey)) return false;
    if (CONFIG.requireShift !== e.shiftKey) return false;
    if (CONFIG.requireAlt !== e.altKey) return false;
    return true;
  }

  window.addEventListener(
    'keydown',
    async (e) => {
      if (!matchesHotkey(e)) return;
      if (isTypingContext()) return; // don't hijack typing
      if (running) return;
      e.preventDefault();
      running = true;
      try {
        await runReject();
      } catch (err) {
        console.error('[gh-reject] error', err);
        toast('Reject failed; see console.');
        hideToast(3000);
      } finally {
        running = false;
      }
    },
    true
  );

  log('loaded. hotkey =', CONFIG.hotkey, 'mode =', CONFIG.mode);
})();
