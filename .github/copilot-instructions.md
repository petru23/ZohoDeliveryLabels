# Copilot Instructions - ZohoDeliveryLabels

## Project Overview

**ZohoDeliveryLabels** is a Node.js/Express application that automates delivery label generation by connecting to Zoho Books, fetching tomorrow's scheduled deliveries, and generating print-ready Excel files (Avery 5162 format: 14 labels per A4 sheet).

**Key Files:**
- `server.js` - Core application with two main classes: `ZohoBooksAPI` and `DeliveryLabelGenerator`
- `public/index.html` - Web dashboard for warehouse staff
- `vercel.json` - Vercel deployment configuration (Express preset)
- `package.json` - Dependencies + scripts (see next section)

---

## Essential Commands

```bash
# Development
npm run dev                 # Run with nodemon (auto-reload on file changes)
npm start                  # Production start

# Testing & Verification
npm run test-labels        # Generate sample labels (no Zoho credentials needed)
npm run verify             # Test Zoho API connection with .env credentials

# Build (Vercel only)
npm run vercel-build       # Pre-deployment check
```

**Environment Setup:**
```bash
cp .env.example .env       # Create config file
# Then edit .env with your Zoho credentials
```

---

## Architecture & Key Patterns

### Class-Based Design

**`ZohoBooksAPI` class** (`server.js` ~ lines 15-60)
- `getTomorrowDeliveries()` - Queries Zoho Books for invoices with `cf_delivery_date` = tomorrow
- `getInvoiceDetails(invoiceId)` - Fetches full invoice data including custom fields
- Uses Zoho-oauthtoken header for authentication
- Filters by `status: 'sent'` or `'unpaid'` (configurable)

**`DeliveryLabelGenerator` class** (`server.js` ~ lines 65-150)
- Generates Excel workbooks with precise label formatting
- Label size: **99.1mm × 38.1mm** (Avery 5162 compatible)
- Layout: **2 columns × 7 rows** = 14 labels per A4 sheet
- Methods: `createSheet()`, `addLabel()`, `saveToFile()`

### API Endpoints

- **GET `/api/generate-labels`** - Generates labels for tomorrow's deliveries
  - Returns Excel file download
  - On Vercel: saves to `/tmp` (auto-deleted after response)
  - Locally: saves to `/output` (persistent)

- **GET `/`** - Serves static dashboard (`public/index.html`)

---

## Critical Configuration Points

### 1. Zoho Custom Fields
The system filters by a **custom field called `cf_delivery_date`** in your Zoho Books invoices.
- **If your custom field has a different name:** Update the filter in `getTomorrowDeliveries()` (line ~35)
- **Zoho Field Type:** Should be a date field
- **Format expected:** ISO date (`YYYY-MM-DD`)

### 2. Invoice Status Filter
Current: `status: 'sent'` (can be changed to `'unpaid'`, `'draft'`, etc.)
- Modify in `getTomorrowDeliveries()` if your workflow differs

### 3. Environment Variables
- `ZOHO_ORGANIZATION_ID` - From Zoho Books Settings → Organization Profile
- `ZOHO_ACCESS_TOKEN` - Generated from Zoho API Console (valid 1 hour)
  - ⚠️ **Tokens expire hourly** - See VERCEL-DEPLOYMENT.md for refresh strategy
- `PORT` - Server port (default: 3000)

### 4. Node.js Version
- **Required:** Node.js 24.x (specified in `package.json` engines field)
- Vercel enforces this - projects with older versions will be rejected
- Local development can use any Node 24.x version

---

## Common Pitfalls & Solutions

| Problem | Solution |
|---------|----------|
| "Invalid Zoho credentials" | Run `npm run verify` to diagnose |
| Empty label file (no invoices) | Check: (1) custom field name matches Zoho setup, (2) invoices exist for tomorrow, (3) status filter is correct |
| Labels don't fit on page | Do NOT change `labelsPerRow` or dimensions (99.1mm × 38.1mm) - these are Avery 5162 specs |
| Files disappear after download on Vercel | Expected behavior - Vercel uses `/tmp` which auto-cleans |
| "cf_delivery_date is undefined" | Zoho Books setup missing required custom field |
| Zoho API 401 error | Access token expired - refresh token from API Console |

---

## Code Style & Conventions

- **Classes:** PascalCase (`ZohoBooksAPI`, `DeliveryLabelGenerator`)
- **Methods:** camelCase (`getTomorrowDeliveries()`, `addLabel()`)
- **Constants:** UPPER_SNAKE_CASE (see class properties like `labelsPerRow`)
- **Async patterns:** Use `async/await`, wrap API calls in try/catch
- **Error handling:** Log to console with context, throw meaningful errors
- **Comments:** Technical clarity sections (see `// ============= ... =============`)

---

## Debugging Tips

### 1. Test Zoho Connection
```bash
npm run verify
# Output tells you exactly what's wrong with credentials
```

### 2. Generate Sample Labels (No Zoho Needed)
```bash
npm run test-labels
# Creates `output/test-labels.xlsx` with mock data
# Great for testing label formatting without Zoho setup
```

### 3. Check Dashboard in Browser
```bash
npm run dev
# Open http://localhost:3000
# Dashboard shows real-time UI for generating labels
```

### 4. Inspect Network Requests
- Browser DevTools → Network tab → Watch `/api/generate-labels` calls
- Check response status and timing

### 5. Common Debug Spots in `server.js`
- Line ~35: Zoho API filter (verify custom field name)
- Line ~105: Excel sheet formatting (if labels misaligned)
- Line ~180: File download endpoint (check path handling)

---

## Deployment Notes

### Local Development
- Files saved to `/output` folder (persistent)
- Run `npm run dev` for auto-reload

### Vercel Production
- Files saved to `/tmp` folder (auto-deleted after download)
- Uses Express preset in `vercel.json`
- Environment variables configured in Vercel Dashboard
- See VERCEL-DEPLOYMENT.md for step-by-step

---

## When Modifying Code

### Adding New Fields to Labels
- Edit methods in `DeliveryLabelGenerator` class
- Update Excel column logic in `addLabel()` method
- Reference LABEL-FORMAT-GUIDE.md for field specs

### Changing Zoho Filters
- Modify `params` object in `getTomorrowDeliveries()`
- Test with `npm run verify` first
- Remember: custom field names are case-sensitive in Zoho API

### Deploying Changes
1. Push to GitHub
2. Vercel auto-detects changes
3. Runs `npm run vercel-build`
4. Deploys new version
5. Environment variables remain from dashboard

---

## Useful Documentation in This Repo

- **QUICK-START.md** - Non-technical 5-minute setup
- **LABEL-FORMAT-GUIDE.md** - Label field specifications
- **LABEL-SPECIFICATIONS.md** - Technical measurements
- **VERCEL-DEPLOYMENT.md** - Step-by-step deployment + token refresh strategy
- **ZOHO-SETUP-GUIDE.md** - Zoho Books configuration
- **ARCHITECTURE.txt** - Visual system diagram
- **DEPLOYMENT-CHECKLIST.md** - Go-live verification steps

---

## Questions? Start Here

1. **Is something not working?** → Run `npm run verify` first
2. **Did you change Zoho custom fields?** → Update filter in `getTomorrowDeliveries()`
3. **Deploying to production?** → Follow VERCEL-DEPLOYMENT.md and DEPLOYMENT-CHECKLIST.md
4. **Labels formatting wrong?** → Check LABEL-SPECIFICATIONS.md for exact measurements
