# Greenhouse Reject Hotkey

A tiny [Tampermonkey](https://www.tampermonkey.net/) userscript that adds a
one-key candidate rejection to [Greenhouse Recruiting](https://www.greenhouse.io/).
Press a single key on a candidate profile and the script opens the reject modal,
picks a default rejection reason, and submits, with a short undo window in case
you misfire.

> Greenhouse also ships a native `X` shortcut that *opens* the reject dialog
> (press `Shift + /` in Greenhouse to see the built-in shortcuts). This script
> goes further by completing the whole reject flow in one press.

## Install

### 1. Install Tampermonkey

Tampermonkey is the browser extension that runs userscripts. Install it for your
browser:

| Browser | Install URL |
|---------|-------------|
| Chrome  | https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo |
| Edge    | https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd |
| Firefox | https://addons.mozilla.org/firefox/addon/tampermonkey/ |
| Safari  | https://apps.apple.com/app/tampermonkey/id1482490089 |

Homepage / other browsers: https://www.tampermonkey.net/

After installing, pin the Tampermonkey icon to your toolbar so you can see when
it's active.

### 2. Add the script

**Option A — from this repo (recommended):**

1. Open `greenhouse-reject-hotkey.user.js` in this repo (or its raw view).
2. Tampermonkey detects the `.user.js` file and shows an install page.
3. Click **Install**.

If you host the raw file (e.g. on GitHub), opening the raw URL directly triggers
the same install prompt:

```
https://raw.githubusercontent.com/devindkim/greenhouse-reject-hotkey/main/greenhouse-reject-hotkey.user.js
```

**Option B — paste it in manually:**

1. Click the Tampermonkey toolbar icon → **Create a new script…**
2. Delete the template, paste the full contents of
   `greenhouse-reject-hotkey.user.js`.
3. **File → Save** (or `Ctrl/Cmd + S`).

### 3. Use it

1. Go to a candidate's profile in Greenhouse (any `*.greenhouse.io` page).
2. Make sure your cursor isn't in a text field (the script ignores the hotkey
   while you're typing).
3. Press **`R`**.
4. A toast appears: **"Rejecting in 3s… press Esc to cancel."** Let it run to
   reject, or press **`Esc`** to cancel and finish by hand.

That's it. To confirm the script is live, open the browser console and set
`debug: true` (see below) — you'll see `[gh-reject] loaded` on page load.

## Configuration

All settings live in the `CONFIG` block at the top of the script. Edit them in
the Tampermonkey editor and save.

| Setting | Default | What it does |
|---------|---------|--------------|
| `hotkey` | `'r'` | The trigger key (single character, case-insensitive). |
| `requireCtrl` / `requireShift` / `requireAlt` | `false` | Require a modifier alongside the hotkey. |
| `mode` | `'full'` | `'full'` = reject end-to-end. `'dialog'` = just open the modal and stop. |
| `defaultReason` | `'Other'` | Substring matched against reason options; first match wins. `''` submits whatever is preselected. |
| `graceMs` | `2500` | Undo window (ms) before auto-submit. `0` submits immediately. |
| `debug` | `false` | Verbose console logging to help fix selectors. |
| `selectors` | — | CSS/text selectors for the reject button, reason dropdown, and submit button. |

### Want it slower / safer?

- Set `mode: 'dialog'` to just open the reject modal (closest to Greenhouse's
  native behavior, but on your own hotkey).
- Increase `graceMs` for a longer undo window.

## Troubleshooting

Greenhouse changes its HTML from time to time, which can break the selectors.

1. Open the browser console (F12) and set `debug: true` in the script.
2. Reload the candidate page and press the hotkey.
3. Watch the `[gh-reject]` log lines to see which step failed
   (reject button, modal, reason, or submit).
4. Right-click the failing element → **Inspect**, grab a stable selector, and
   add it to the relevant list in `CONFIG.selectors`.

Each selector entry is a list tried in order, plus a text-based fallback, so you
can usually just prepend a new selector without removing the old ones.

## Notes & caveats

- This automates a **destructive** action. Test with `mode: 'dialog'` first, and
  keep the undo window on until you trust it.
- Bulk rejections and default email templates still follow your Greenhouse org's
  settings (e.g. rejection emails may be delayed to the next day by default).
- No data leaves your browser. The script has `@grant none` and makes no network
  requests of its own.

## License

MIT — see [LICENSE](LICENSE).
