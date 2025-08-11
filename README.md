# Data Broker Opt-Out Runner (Headful + Human-in-the-Loop)

This project automates portions of common data-broker opt-out flows using **Playwright** with a **human-in-the-loop** pause whenever a site requires CAPTCHA, email/SMS verification, ID upload, or quirky manual steps.

> ⚠️ **Use only on official opt-out pages you specify.** Respect Terms of Service. This tool never bypasses CAPTCHAs; you handle those manually.

## Prereqs

- Node 20+
- `npm i`
- Install Playwright browsers: `npx playwright install`

## Configure

Edit these two files:

- `data/profile.json` – your info you are comfortable sharing
- `data/manifest.json` – list of sites and how to interact with them

## Run (headful, recommended)

```bash
npm start
```

A Chromium window will open. The script will auto-fill simple fields. Whenever a site needs your help, the terminal will prompt you to **complete the step** (solve CAPTCHA, verify email, upload ID, select your listing) and then **press Enter** to continue.

Results are appended to a timestamped JSONL audit log in the project root.

## Notes

- `adapter: "generic"` uses CSS selectors you provide to fill forms + click submit.
- Custom adapters are included for **Spokeo** and **Whitepages** as starting points.
- You can add more adapters under `src/adapters/sites`.