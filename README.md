# Data Broker Opt-Out Runner

**Automate your privacy:** A Playwright-based tool that streamlines opt-out requests from **45+ data broker sites** using a **human-in-the-loop** approach for CAPTCHAs and verification steps.

> ⚠️ **Privacy-Focused & Legal:** This tool only uses official opt-out pages and never bypasses CAPTCHAs. You handle verification steps manually, ensuring compliance with Terms of Service.

## 🎯 Features

### Core Capabilities
- **45+ Data Brokers Supported** including Spokeo, Whitepages, BeenVerified, Radaris, Nuwber, and more
- **Smart Adapters**: 7 site-specific adapters for complex flows + generic adapter for 38+ simple forms
- **Human-in-the-Loop**: Pauses for CAPTCHA solving, email verification, and manual steps
- **Progress Tracking**: Real-time progress indicators and detailed summary reports
- **Error Handling**: Automatic retry with exponential backoff + screenshot capture on failures
- **Audit Logging**: Timestamped JSONL logs of all opt-out attempts

### Advanced Features ⚡
- **Stealth Mode**: Anti-bot detection with realistic browser fingerprinting and human-like behavior
- **Selective Execution**: Filter by broker name, exclude specific brokers, or limit batch size
- **Dry Run Mode**: Test configurations without actually submitting requests
- **Resume Support**: Skip already-successful brokers from previous runs
- **Smart Filtering**: Run only specific brokers or exclude problematic ones

## 📊 Coverage

### Total: 45 Data Brokers

#### Tier 1: Major People Search Sites (7 custom adapters)
- **Spokeo** - Multi-step opt-out with email verification
- **Whitepages** - Comprehensive form automation
- **BeenVerified** - Search and selection flow
- **Intelius/PeopleConnect** - Network-wide suppression
- **Radaris** - Profile-based removal
- **Nuwber** - Email verification flow
- **MyLife** - CCPA-compliant opt-out

#### Tier 2: Popular Search Sites (38 generic adapters)
FastPeopleSearch, TruePeopleSearch, CheckPeople, ThatsThem, SmartBackgroundChecks, ClustrMaps, PeopleSearchNow, AdvancedBackgroundChecks, PublicDataUSA, Dataveria, NeighborReport, FamilyTreeNow, USPhoneBook, PeopleFinders, PeekYou, InstantCheckmate, TruthFinder, USSearch, Zabasearch, AnyWho, Addresses, InfoTracer, PrivateEye, SearchQuarry, SearchBug, SpyFly, PeopleByName, OldFriends, PrivateRecords, PropertyRecords, Classmates, Acxiom, Epsilon, Experian, 411, YellowPages, VoterRecords

### Success Rate
Based on Consumer Reports research, **manual opt-outs have 70% success rate** vs. only 27% for automated services like DeleteMe. This tool combines the best of both: automation where possible, human verification where needed.

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

#### 1. Edit Your Profile (`data/profile.json`)

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

The manifest contains **45 pre-configured data brokers**. You can:
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
npm start -- --filter "Spokeo,Whitepages,Radaris"
```

**Exclude specific brokers:**
```bash
npm start -- --exclude "BeenVerified,Intelius"
```

**Resume from previous run:**
```bash
npm start -- --resume ./optouts-2025-11-05-14-30-00.jsonl
```

**Limit number of brokers:**
```bash
npm start -- --limit 5
```

**Disable stealth mode:**
```bash
npm start -- --stealth=false
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
| `--stealth` | boolean | true | Enable anti-bot detection measures |
| `--filter` | string | - | Filter brokers (comma-separated names) |
| `--exclude` | string | - | Exclude brokers (comma-separated names) |
| `--dry-run` | boolean | false | Simulate without submitting |
| `--resume` | string | - | Resume from log file |
| `--limit` | number | - | Limit number of brokers to process |

**Get help:**
```bash
npm run help
```

## 📖 How It Works

### The Process

1. **Browser Launch**: Opens Chromium (visible or headless)
2. **Iterate Brokers**: Processes each data broker in sequence
3. **Auto-Fill Forms**: Automatically fills name, email, address fields
4. **Human Pauses**: Prompts you to:
   - Search for your profile/listing
   - Solve CAPTCHAs
   - Verify email confirmations
   - Complete any manual steps
5. **Error Handling**: Retries failed requests and captures screenshots
6. **Audit Trail**: Logs all attempts with timestamps and status

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

2. Register in `src/run.ts`:
   - Add import: `import { NewBrokerAdapter } from "./adapters/sites/NewBrokerAdapter.js";`
   - Add to enum: `adapter: z.enum([..., "NewBroker"])`
   - Add to switch: `case "NewBroker": return new NewBrokerAdapter(entry);`

### Error Troubleshooting

**Screenshots**: Check `./logs/` for error screenshots with timestamps

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
{"site":"Radaris","status":"failed","ts":"2025-11-05T14:45:01Z","url":"https://radaris.com/control/privacy","message":"Navigation timeout"}
```

### Summary Report

```
============================================================
📊 Summary Report
============================================================
Total brokers processed: 20
✓ Successful: 15
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

## 🤝 Contributing

Want to add more data brokers or improve adapters?

1. Fork the repository
2. Add new broker configurations or adapters
3. Test thoroughly with your own data
4. Submit a pull request with documentation

## 📚 Resources

- [Privacy Rights Clearinghouse Data Broker Database](https://privacyrights.org/data-brokers) - 750+ data brokers
- [Big-Ass-Data-Broker-Opt-Out-List](https://github.com/yaelwrites/Big-Ass-Data-Broker-Opt-Out-List) - Comprehensive guide
- [Consumer Reports Study](https://www.consumerreports.org/) - Manual opt-outs vs. paid services

## 📄 License

MIT License - See LICENSE file for details

## ⚠️ Disclaimer

This tool is provided as-is for legal privacy protection purposes. Always:
- Use only on official opt-out pages
- Respect website Terms of Service
- Never attempt to bypass security measures
- Verify removal success manually after automation

**This tool is not affiliated with any data broker or removal service.**