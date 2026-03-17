# 🚀 Quick Start Guide - 5 Minute Setup

This guide will get your delivery label system running in 5 minutes.

## What You Need

- ✅ A computer (Windows/Mac/Linux)
- ✅ Zoho Books account with admin access
- ✅ 10 minutes of time

---

## Step 1: Install Node.js (2 minutes)

**Download:** https://nodejs.org/ (choose LTS version)

**Windows:**
1. Run installer
2. Click "Next" through all steps
3. Restart computer

**Mac:**
1. Open downloaded file
2. Follow installer
3. No restart needed

**Verify it worked:**
Open terminal/command prompt and type:
```bash
node --version
```
Should show: `v18.x.x` or higher ✓

---

## Step 2: Get Zoho API Credentials (3 minutes)

### A. Get Access Token

1. Go to: https://api-console.zoho.com/
2. Click **"Add Client"** → **"Self Client"**
3. Give it a name: "Delivery Labels"
4. Click **"Create"**
5. You'll see:
   - Client ID: `1000.ABC123XYZ...`
   - Client Secret: `xyz987abc...`
6. Click **"Generate Token"**
7. In scope field, paste: `ZohoBooks.fullaccess.all`
8. Click **"Create"**
9. Copy the **Access Token** (long string starting with `1000.`)

### B. Get Organization ID

1. Open Zoho Books
2. Click **Settings** (gear icon)
3. Go to **Organization Profile**
4. Copy your **Organization ID** (10-digit number)

---

## Step 3: Setup the System (2 minutes)

### A. Download the code

```bash
# Create a folder
mkdir delivery-labels
cd delivery-labels

# Copy all the files I provided into this folder
```

### B. Install dependencies

```bash
npm install
```

Wait 30-60 seconds for installation...

### C. Configure credentials

1. Rename `.env.example` to `.env`
2. Open `.env` in any text editor (Notepad, TextEdit, etc.)
3. Replace with your values:

```env
ZOHO_ORGANIZATION_ID=1234567890
ZOHO_ACCESS_TOKEN=1000.abc123xyz...
PORT=3000
```

4. Save the file

---

## Step 4: Test Connection (1 minute)

```bash
npm run verify
```

**Should see:**
```
✓ Environment variables configured
✓ Successfully connected to Zoho Books API
✓ CONNECTION SUCCESSFUL
```

**If you see errors:** Double-check your access token and organization ID

---

## Step 5: Generate Test Labels (1 minute)

```bash
npm run test-labels
```

**What happens:**
- Creates `output/TEST_LABELS_14_per_sheet.xlsx`
- Contains 14 sample labels

**Print the test file:**
1. Open the Excel file
2. File → Print
3. Settings:
   - Paper: A4
   - Scaling: 100% (NO fit-to-page)
4. Print ONE page
5. Align with your Avery 5162 label sheet
6. Check if labels fit perfectly

**If alignment is off:**
- Adjust margins in `server.js` (line 100)
- Re-run test

---

## Step 6: Start the System

```bash
npm start
```

**Should see:**
```
╔════════════════════════════════════════════════════════════╗
║     DELIVERY LABEL GENERATOR - RUNNING ON PORT 3000       ║
╚════════════════════════════════════════════════════════════╝

Dashboard: http://localhost:3000
```

**Open browser:** http://localhost:3000

---

## Daily Usage (30 seconds)

### For Warehouse Staff:

1. Open: http://localhost:3000
2. Click: **"Generate Labels"**
3. File downloads automatically
4. Print the Excel file (no scaling)

**That's it!** ✓

---

## Troubleshooting

### "No deliveries scheduled for tomorrow"

**Cause:** Invoices in Zoho Books don't have delivery dates

**Fix:**
1. Zoho Books → Create/edit invoice
2. Find custom field: "Delivery Date"
3. Set to tomorrow's date
4. Save invoice
5. Try generating labels again

### "Failed to connect to Zoho Books"

**Cause:** Access token expired (they last 1 hour)

**Fix:**
1. Go back to https://api-console.zoho.com/
2. Click "Generate Token" again
3. Update `.env` file with new token
4. Restart server: Stop (`Ctrl+C`) then `npm start`

### "Port 3000 is already in use"

**Fix:** Change port in `.env`:
```env
PORT=3001
```
Then access: http://localhost:3001

---

## Keep It Running 24/7

### Option 1: Leave computer on
- Simple
- Free
- Just don't turn off the warehouse PC

### Option 2: Auto-restart on reboot

**Install PM2:**
```bash
npm install -g pm2
pm2 start server.js --name delivery-labels
pm2 save
pm2 startup
```

Now the system auto-starts when computer boots!

### Option 3: Cloud hosting
- See `README.md` for DigitalOcean deployment
- $5/month
- Access from anywhere

---

## Getting Help

**Common issues solved:**
- Run `npm run verify` to test Zoho connection
- Check `.env` file has correct values
- Make sure Node.js is installed: `node --version`
- Verify invoices have delivery_date custom field

**Still stuck?**
- Check `README.md` for detailed docs
- Contact your IT support
- Email: [your-support-email]

---

## What's Next?

Once this is working smoothly:

1. **Phase 2:** Add Shopify orders to labels
2. **Phase 3:** Route optimization by suburb
3. **Phase 4:** Mobile driver app
4. **Phase 5:** Full Zoho-Shopify-Podium ecosystem

But for now... enjoy your automated labels! 🎉

---

**Questions?** See `README.md` for full documentation
