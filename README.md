# Data Broker Opt-Out Runner

A Playwright-based tool that walks you through opt-out requests at **74 data broker and marketing opt-out pages**, 46 of them people-search sites. It opens each broker's official opt-out page, fills in what it safely can, and pauses for you to do the rest: finding your listing, CAPTCHAs, and email or phone verification.

> ⚠️ **What this tool is and is not:** it is a guided assistant, not a removal service. It only visits official opt-out pages and it never solves a CAPTCHA for you. It does not check afterwards that a listing is gone; you have to do that yourself (see [What "success" means](#what-success-means)).

## Why This Matters

Data brokers collect and sell personal information — home addresses, phone numbers, family members, employment history — making it trivially easy for anyone to find details about you online. For stalking victims, domestic abuse survivors, and anyone concerned about their privacy, this exposure is dangerous. The opt-out process is deliberately tedious: dozens of different sites, each with their own forms, CAPTCHAs, and verification steps. Most people give up. This tool keeps the list, opens the right page, and keeps track of where you are.

## 🎯 Features

### Core Capabilities
- **74 opt-out pages in the manifest**, tagged by what the opt-out actually does (see [Coverage](#-coverage))
- **6 guided walkthroughs** for the larger people-search companies (Whitepages, Spokeo, BeenVerified, PeopleConnect, Nuwber, MyLife): step-by-step instructions with pauses. The only automation in them is filling a name or email field; you do the searching, selecting and submitting
- **Generic adapter** for the other 68 entries: opens the opt-out page and hands over to you. It types and clicks nothing unless the entry is marked `verified: true`, meaning a person has checked its CSS selectors against the live page; no entry in the shipped manifest is marked verified yet, so today every one of these is a page you finish by hand
- **Human-in-the-Loop**: Pauses for CAPTCHA solving, email verification, and manual steps
- **Progress Tracking**: Real-time progress indicators and a summary report
- **Error Handling**: Retry with exponential backoff, plus a screenshot on failure. Screenshots are saved to `./logs/*.png` and **can show your name, address, phone number or email**; treat that folder as private and delete it when you are done
- **Audit Logging**: Timestamped JSONL logs of every attempt

### Advanced Features ⚡
- **Stealth Mode** (on by default): makes the automated browser look like an ordinary one so that basic bot detection does not turn it away. See [Stealth mode](#stealth-mode) for exactly what it changes and how to turn it off
- **Selective Execution**: Filter by broker name, exclude specific brokers, or limit batch size
- **Dry Run Mode**: Test configurations without actually submitting requests
- **Resume Support**: Skip brokers a previous run logged as `success`
- **Manifest health check**: `npm run check:manifest` reports dead, blocked and moved opt-out pages

## 📊 Coverage

### Total: 74 entries, by what the opt-out does

Only the first group removes a public listing of your name, address or phone number. The others are worth doing, but they stop marketing, ad targeting or data sales; they do not take a people-search listing down.

| Category | Entries | What opting out does |
|---|---|---|
| `people-search` | 46 | Asks a people-search, phone-lookup or public-records site to remove or suppress your listing |
| `b2b` | 10 | Asks a business-contact or identity-data company to stop selling your details to its customers |
| `marketing` | 6 | Stops marketing use of your data, junk mail, catalogs or telemarketing calls |
| `credit` | 6 | Stops pre-approved credit offers or marketing use by credit and consumer-reporting agencies, or places a security freeze |
| `ad-tech` | 6 | Stops ad targeting tied to a browser cookie or a device's advertising ID |

#### People-search sites (46)

Guided walkthroughs (6): **Whitepages**, **Spokeo**, **BeenVerified**, **PeopleConnect**, **Nuwber**, **MyLife**

Generic adapter (40): FastPeopleSearch, TruePeopleSearch, CheckPeople, ThatsThem, SmartBackgroundChecks, FamilyTreeNow, USPhoneBook, PeopleSearchNow, AdvancedBackgroundChecks, NeighborReport, PeopleFinders, InfoTracer, SearchQuarry, SearchBug, PeopleByName, OldFriends, PrivateRecords, PropertyRecords, Classmates, 411, VoterRecords, CocoFinder, CyberBackgroundChecks, GladIKnow, PeopleWhiz, USAPeopleSearch, Unmask, Precise Leads (NumLookup), RecordsFinder, AncestryFree (RootsWeb), TrueCaller, Hiya, CallerSmart, PeopleSmart, RealPeopleSearch, NumLooker, FastBackgroundCheck, SocialCatfish, PeopleSearchExpert, ValidNumber

#### Business-contact and identity data (10)
Apollo.io, Lusha, RocketReach, Hunter.io, ContactOut, FullContact, AtData (formerly TowerData), Pipl, Melissa Data, Clearview AI

#### Marketing (6)
Acxiom, Epsilon, DataAxle (InfoUSA/Donnelley), DMAChoice, National Do Not Call Registry, Catalog Choice

#### Credit and consumer reporting (6)
Experian, OptOutPrescreen (Equifax, Experian, Innovis and TransUnion), Innovis, ChexSystems, LexisNexis, Cotality (formerly CoreLogic)

#### Ad tech and tracking (6)
LiveRamp, Lotame, Tapad, ShareThis, Unacast (Gravy Analytics), YellowPages

> **One entry per company.** Sites that share an opt-out are listed in that entry's `notes`, not counted separately. **PeopleConnect** covers Intelius, TruthFinder, Instant Checkmate, US Search, Zabasearch and Addresses.com. **BeenVerified** covers PeopleLooker, Ownerly, NeighborWho and NumberGuru. **Spokeo** covers AnyWho.

> **Link rot is real.** When these pages were last checked (2026-11-17, headless browser, nothing typed or clicked), 56 of the 74 loaded at the listed address and 18 refused an automated browser and can only be confirmed by a person in a visible browser. Radaris and its sister sites are no longer listed: their domains were transferred by court order in 2026 and have no opt-out page. Run `npm run check:manifest` for the current picture.

### What "success" means

A `success` line in the log means **the steps for that broker ran without an error**. It does not mean the broker removed your record, and the tool does not go back to check. Because `--resume` skips every broker already logged as `success`, re-run without `--resume` when you want to repeat a broker.

After a run, search each site for yourself again a week or two later, and repeat every few months: brokers re-list people when they receive new records.

### How well do opt-outs work?

This tool's own removal rate has not been measured. For context, Consumer Reports' 2024 study *Data Defense: Evaluating People-Search Site Removal Services* found that manual opt-outs, done by hand by its researchers, had about **70%** of profiles gone within a week, while the paid removal services it tested had removed only **35%** of profiles overall after four months. The authors note the sample (32 volunteers, 13 people-search sites) is small and not nationally representative. This tool is neither the manual method nor one of the services that study tested.

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd data-broker-optouts

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Configuration

#### 1. Configure Your Profile

**Desktop App (Recommended):** Open the app and navigate to the **Profile** page to enter your information through a secure form. Your data never leaves your machine.

**CLI Users:** Copy `data/profile.example.json` to `data/profile.json` and fill in your details:

```json
{
  "fullName": "John Doe",
  "email": "john.doe@example.com",
  "city": "San Francisco",
  "state": "California",
  "zip": "94102",
  "phone": "555-123-4567",
  "address": "123 Main St"
}
```

**Privacy Note:** Only include information you're comfortable using for opt-out requests.

#### 2. Review Manifest (`data/manifest.json`)

The manifest contains **74 pre-configured entries**, each tagged with a `category` (`people-search`, `marketing`, `ad-tech`, `credit` or `b2b`). You can:
- Enable/disable specific brokers by removing entries
- Add custom brokers using the generic adapter
- Modify selectors for sites that have changed their forms

### Run the Tool

#### Basic Usage

**Headful Mode (Recommended for first run):**
```bash
npm start
```

**Headless Mode (Background):**
```bash
npm run start:headless
```

**Dry Run (Test without submitting):**
```bash
npm run start:dry-run
```

#### Advanced CLI Options

The tool supports powerful filtering and control options:

**Filter specific brokers:**
```bash
npm start -- --filter "Spokeo,Whitepages,Nuwber"
```

**Exclude specific brokers:**
```bash
npm start -- --exclude "BeenVerified,PeopleConnect"
```

**Resume from previous run:**
```bash
npm start -- --resume ./optouts-2025-11-05-14-30-00.jsonl
```

**Limit number of brokers:**
```bash
npm start -- --limit 5
```

**Combine multiple options:**
```bash
npm start -- --filter "True,Fast,Check" --limit 10 --dry-run
```

#### All CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--manifest` | string | required | Path to manifest.json |
| `--profile` | string | required | Path to profile.json |
| `--headful` | boolean | false | Run browser in visible mode |
| `--stealth` | boolean | true | Make the automated browser look like an ordinary one (see [Stealth mode](#stealth-mode)) |
| `--filter` | string | - | Filter brokers (comma-separated names) |
| `--exclude` | string | - | Exclude brokers (comma-separated names) |
| `--dry-run` | boolean | false | Simulate without submitting |
| `--resume` | string | - | Resume from log file |
| `--limit` | number | - | Limit number of brokers to process |

**Get help:**
```bash
npm run help
```

#### Stealth mode

Stealth mode is **on by default**. Many opt-out pages turn away anything that looks like an automated browser, so with stealth on the tool hides the usual signs: it removes the `navigator.webdriver` flag, reports a fake browser-plugin list and language list, reports a fake `window.chrome` object, and uses a regular desktop Chrome user agent and a common window size. In plain terms, it is there to get past basic bot detection so that you can reach the opt-out form.

It does **not** solve or skip CAPTCHAs, log in for you, or defeat a full challenge page; when a site shows one, the tool pauses and you handle it. Some sites' terms of service forbid automated access of any kind, so decide for yourself whether you are comfortable with that. To turn the disguise off:

```bash
npm start -- --stealth=false
```

With stealth off none of that is applied: the browser is started with no disguise flags and reports Chromium's own user agent.

#### Checking the manifest for dead links

Opt-out pages move and brokers shut down, so the manifest goes stale. `npm run check:manifest` loads every `removalUrl` once in headless Chromium and reports which entries are dead (page missing, domain gone, server error), blocked (the site refuses a headless browser, so a person has to check it) or redirected to a different address. It is read-only: it never types or clicks, it does not read your profile, and it exits with code 1 if any entry is dead. Add `-- --json ./.temp/check.json` to save the details.

## 📖 How It Works

### The Process

1. **Browser Launch**: Opens Chromium (visible or headless)
2. **Iterate Brokers**: Processes each data broker in sequence
3. **Auto-Fill Forms**: The guided walkthroughs fill a name or email field where they can; the generic adapter fills fields only for entries marked `verified`
4. **Human Pauses**: Prompts you to:
   - Search for your profile/listing
   - Solve CAPTCHAs
   - Verify email confirmations
   - Complete any manual steps
5. **Error Handling**: Retries failed requests and captures screenshots (saved to `./logs`; they can show your personal details)
6. **Audit Trail**: Logs all attempts with timestamps and status. `success` means the steps ran without error, not that the record was removed

### Terminal Output Example

```
============================================================
🚀 Data Broker Opt-Out Runner
============================================================

📋 Loaded 20 data brokers from manifest
👤 Profile: John Doe (john.doe@example.com)
🌐 Browser mode: Headful (visible)
📝 Log file: ./optouts-2025-11-05-14-30-00.jsonl

============================================================

[1/20] Processing: Whitepages
    URL: https://www.whitepages.com/suppression-requests
    Adapter: Whitepages
    Requirements: online, captcha

[Whitepages] Starting suppression request process...
[Whitepages] STEP 1: Search for your listing...
[Press Enter to continue]
```

## 🛠️ Advanced Usage

### Adding a Custom Data Broker

#### Option 1: Use Generic Adapter (Simple Forms)

Add to `data/manifest.json`:

```json
{
  "name": "NewBroker",
  "category": "people-search",
  "removalUrl": "https://newbroker.com/opt-out",
  "requirements": ["online", "captcha"],
  "adapter": "generic",
  "config": {
    "selectors": {
      "name": "input[name='fullName']",
      "email": "input[type='email']",
      "city": "input[name='city']",
      "state": "select[name='state']",
      "submit": "button[type='submit']"
    },
    "checkboxes": ["input[name='agreeTerms']"],
    "postSubmitWaitMs": 3000
  },
  "notes": "Email verification required. 72-hour removal."
}
```

#### Option 2: Create Custom Adapter (Complex Flows)

1. Create `src/adapters/sites/NewBrokerAdapter.ts`:

```typescript
import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class NewBrokerAdapter extends BaseAdapter {
  public name(): string { return "NewBroker"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    // Custom implementation here
    await waitForEnter("Complete CAPTCHA and press Enter...");
  }
}
```

2. Register in `src/factories/AdapterFactory.ts`:
   - Add import: `import { NewBrokerAdapter } from "../adapters/sites/NewBrokerAdapter.js";`
   - Add to switch in `createAdapter()`: `case "NewBroker": return new NewBrokerAdapter(entry);`
   - Update `src/config/schemas.ts` to add the adapter name to the enum

### Error Troubleshooting

**Screenshots**: Check `./logs/` for error screenshots with timestamps. They are full-page captures of the opt-out page as it was when the error happened, so they can contain your name, address, phone number or email. Do not attach them to a public issue without checking, and delete them when you no longer need them

**Audit Logs**: Review JSONL files for detailed error messages:
```bash
tail -f optouts-2025-11-05-14-30-00.jsonl
```

**Common Issues**:
- **Navigation timeout**: Site may be slow or down - check URL manually
- **Selector not found**: Site changed their form - update selectors in manifest
- **CAPTCHA failure**: Make sure to wait for CAPTCHA to fully load before solving

## 📝 Output & Logs

### JSONL Audit Log

Each run creates a timestamped log file:

```json
{"site":"Spokeo","status":"success","ts":"2025-11-05T14:35:22Z","url":"https://spokeo.com/optout","message":"Submitted (some steps may have been manual)."}
{"site":"Whitepages","status":"success","ts":"2025-11-05T14:42:18Z","url":"https://whitepages.com/suppression-requests","message":"Submitted (some steps may have been manual)."}
{"site":"Nuwber","status":"failed","ts":"2025-11-05T14:45:01Z","url":"https://nuwber.com/removal/link","message":"Navigation timeout"}
```

`success` here means the steps for that broker ran without an error. It is not confirmation that the broker removed anything; see [What "success" means](#what-success-means).

### Summary Report

```
============================================================
📊 Summary Report
============================================================
Total brokers processed: 20
✓ Successful: 15   (steps ran without error; not a confirmed removal)
✗ Failed: 2
⊘ Skipped: 1
⚠ Manual needed: 2
============================================================
```

## ⚡ Performance Tips

1. **Run in batches**: Process 5-10 brokers at a time to avoid fatigue
2. **Use headful mode first**: Verify everything works before switching to headless
3. **Set aside time**: Budget 5-10 minutes per broker for manual steps
4. **Keep email open**: Many sites require immediate email verification
5. **Re-run periodically**: Data brokers repopulate info every 3-6 months

## 🔒 Privacy & Security

- **No data leaves your machine** except to official opt-out pages you configure
- **No telemetry or tracking** - completely open source
- **Your credentials are never stored** - only profile data you provide
- **Audit logs are local** - review and delete as needed
- **Error screenshots are local too, and sensitive** - `./logs/*.png` can show the personal details you entered on a form; keep the folder private and delete it when you are done

## 🤝 Contributing

Contributions welcome! Here's how you can help:

### Add a New Data Broker (Easiest)
1. Find the broker's official opt-out page
2. Add an entry to `data/manifest.json` with CSS selectors for form fields
3. Give the entry a `category` and run `npm test` to verify the manifest validates
4. Submit a PR

### Improve an Existing Adapter
1. Check if selectors are outdated (sites change their forms)
2. Update selectors in `data/manifest.json` or adapter code in `src/adapters/sites/`
3. Test with `npm start -- --filter "BrokerName" --dry-run`

### Report Broken Opt-Outs
Open an issue with the broker name and what's broken — even just "Spokeo form changed" helps.

### General Guidelines
1. Fork the repository
2. Run `npm test` before submitting
3. Include the broker's opt-out URL in your PR description
4. One broker per PR is fine — small PRs merge faster

## ⚖️ Your Legal Rights

Data broker opt-outs are backed by strong legal frameworks:

- **CCPA/CPRA (California)**: Right to delete personal info and opt out of data sales. Brokers must comply within 45 days.
- **California's DROP (Delete Request and Opt-out Platform)**: Since January 2026, California residents can file **one** deletion request at [privacy.ca.gov/drop](https://privacy.ca.gov/drop/) that goes to every data broker registered with the state, instead of contacting each one. If you live in California, do this first; it reaches hundreds of brokers this tool does not list. It does not cover brokers that have not registered, so the site-by-site opt-outs here are still useful.
- **VCDPA (Virginia)**, **CPA (Colorado)**, **CTDPA (Connecticut)**, **UCPA (Utah)**: Similar deletion and opt-out rights for state residents.
- **GDPR (EU/EEA)**: Right to erasure ("right to be forgotten") and right to object to processing.
- **Federal**: The FTC regulates data brokers under "unfair or deceptive practices." The National Do Not Call Registry covers telemarketing.

**Tips for leveraging your rights:**
- Mention the specific law (e.g., "pursuant to CCPA Section 1798.105") in opt-out requests for faster compliance
- Re-submit opt-outs every 3-6 months — brokers often re-acquire your data
- Keep audit logs (this tool generates them automatically) as a record of what you requested and when

## 📚 Resources

- [Privacy Rights Clearinghouse Data Broker Database](https://privacyrights.org/data-brokers) - 750+ data brokers
- [Big-Ass-Data-Broker-Opt-Out-List](https://github.com/yaelwrites/Big-Ass-Data-Broker-Opt-Out-List) - Comprehensive guide
- [Consumer Reports: Data Defense (2024)](https://innovation.consumerreports.org/new-report-data-defense-evaluating-people-search-site-removal-services/) - Manual opt-outs vs. paid removal services
- [California DROP](https://privacy.ca.gov/drop/) - One deletion request to every registered data broker (California residents)
- [EFF Surveillance Self-Defense](https://ssd.eff.org/) - Digital privacy best practices
- [CCPA Official Text](https://oag.ca.gov/privacy/ccpa) - California Consumer Privacy Act

## 📄 License

MIT License - See LICENSE file for details

## ⚠️ Disclaimer

This tool is provided as-is for legal privacy protection purposes. Always:
- Use only on official opt-out pages
- Read each website's Terms of Service; stealth mode, which is on by default, disguises the automated browser (see [Stealth mode](#stealth-mode)), and some sites do not allow automated access
- Solve CAPTCHAs and verification steps yourself; the tool never does this for you
- Check for yourself that a listing is gone; a `success` in the log is not proof of removal

**This tool is not affiliated with any data broker or removal service.**