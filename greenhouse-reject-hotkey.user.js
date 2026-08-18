// ==UserScript==
// @name         Greenhouse Reject Hotkey
// @namespace    https://github.com/devindkim/greenhouse-reject-hotkey
// @version      0.1.0
// @description  One-key candidate rejection for Greenhouse Recruiting.
// @author       devindkim
// @match        https://*.greenhouse.io/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // CONFIG — tweak these to taste.
  // ---------------------------------------------------------------------------
  const CONFIG = {
    // Which key triggers a reject. Single character, case-insensitive.
    hotkey: "r",
    // Optional modifiers. Set to true to require them alongside the hotkey.
    requireCtrl: false,
    requireShift: false,
    requireAlt: false,

    // 'full'   -> open the reject modal, pick the default reason, and submit.
    // 'dialog' -> just open the reject modal and stop (you finish by hand).
    mode: "full",

    // Substring (case-insensitive) matched against the rejection-reason options.
    // The first option whose visible text contains this wins. Leave '' to skip
    // reason selection and just submit whatever is preselected.
    defaultReason: "Other",

    // Delay (ms) after setting the reason before clicking submit. This is
    // Greenhouse's own modal-render/state-settle time, not network — the submit
    // button looks ready before it actually is, so clicking too early is
    // swallowed. Observed floor is ~300ms; 400 leaves margin for load spikes.
    // Raise it if rejects intermittently don't go through.
    submitDelayMs: 300,

    // Rain confetti from the top of the screen on a successful reject.
    confetti: true,

    // Verbose console logging to help you fix selectors on your instance.
    debug: false,

    // --- Selectors. Greenhouse ships DOM changes periodically; if the script
    // stops finding things, flip debug=true and adjust these. Each entry is a
    // list of CSS selectors tried in order; text-based fallbacks run after.
    selectors: {
      rejectTrigger: ["a.reject", 'a[href*="reject"]', "button.reject"],
      rejectTriggerText: ["reject"],

      reasonSelect: [
        "#rejection_reason_id",
        'select[name*="rejection_reason"]',
        'select[id*="reason"]',
      ],

      submitButton: [
        'input[type="submit"][value*="Reject"]',
        'button[type="submit"]',
      ],
      submitButtonText: [
        "reject candidate",
        "reject application",
        "confirm",
        "reject",
      ],
    },
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const log = (...a) => CONFIG.debug && console.log("[gh-reject]", ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  function isTypingContext() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
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
        root.querySelectorAll(
          'a, button, input[type="submit"], input[type="button"]',
        ),
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
  // Confetti — self-contained canvas rain (no external library, CSP-safe).
  // ---------------------------------------------------------------------------
  function rainConfetti() {
    const COLORS = [
      "#ff4d4d",
      "#ffb84d",
      "#ffe14d",
      "#4dff88",
      "#4db8ff",
      "#b84dff",
      "#ff4db8",
    ];
    const COUNT = 140;
    const DURATION = 2600; // ms until cleanup

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: 2147483647,
    });
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.5, // start above the top edge
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      vy: 2 + Math.random() * 3, // downward speed
      vx: -1 + Math.random() * 2, // sideways drift
      rot: Math.random() * Math.PI,
      vrot: -0.15 + Math.random() * 0.3,
    }));

    const start = Date.now();
    function frame() {
      const elapsed = Date.now() - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of pieces) {
        p.y += p.vy;
        p.x += p.vx;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha =
          elapsed > DURATION - 600
            ? Math.max(0, (DURATION - elapsed) / 600)
            : 1;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < DURATION) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Core flow
  // ---------------------------------------------------------------------------
  function selectReason(root) {
    if (!CONFIG.defaultReason) return;
    const select = findControl(CONFIG.selectors.reasonSelect, null, root);
    if (!select || select.tagName !== "SELECT") {
      log("reason <select> not found; leaving preselected value");
      return;
    }
    const needle = norm(CONFIG.defaultReason);
    const option = Array.from(select.options).find((o) =>
      norm(o.textContent).includes(needle),
    );
    if (!option) {
      log("no reason option matched", CONFIG.defaultReason);
      return;
    }
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    log("selected reason:", option.textContent.trim());
  }

  async function runReject() {
    const trigger = findControl(
      CONFIG.selectors.rejectTrigger,
      CONFIG.selectors.rejectTriggerText,
    );
    if (!trigger) {
      log("no reject trigger found. Are you on a candidate profile?");
      return;
    }
    log("clicking reject trigger", trigger);
    trigger.click();

    const modalReady = await waitFor(() => {
      const reason = findControl(CONFIG.selectors.reasonSelect, null);
      const submit = findControl(
        CONFIG.selectors.submitButton,
        CONFIG.selectors.submitButtonText,
      );
      return reason || submit ? { reason, submit } : null;
    });
    if (!modalReady) {
      log("reject modal did not open");
      return;
    }

    if (CONFIG.mode === "dialog") {
      log("dialog mode: modal open, stopping.");
      return;
    }

    selectReason(document);

    await sleep(CONFIG.submitDelayMs);

    const submit = findControl(
      CONFIG.selectors.submitButton,
      CONFIG.selectors.submitButtonText,
    );
    if (!submit) {
      log("submit button not found");
      return;
    }
    log("submitting", submit);
    submit.click();
    if (CONFIG.confetti) rainConfetti();
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
    "keydown",
    async (e) => {
      if (!matchesHotkey(e)) return;
      if (isTypingContext()) return; // don't hijack typing
      if (running) return;
      e.preventDefault();
      running = true;
      try {
        await runReject();
      } catch (err) {
        console.error("[gh-reject] error", err);
      } finally {
        running = false;
      }
    },
    true,
  );

  log("loaded. hotkey =", CONFIG.hotkey, "mode =", CONFIG.mode);
})();
