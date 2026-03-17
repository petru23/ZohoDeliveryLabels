# Deployment Checklist

## Pre-Launch Setup

### 1. Zoho Books Configuration

- [ ] Create custom field: `cf_delivery_date` (Date type)
  - Go to: Zoho Books → Settings → Invoices → Custom Fields
  - Add new field: "Delivery Date"
  - Make visible on invoices

- [ ] Test with sample invoices
  - Create 2-3 test invoices with tomorrow's delivery date
  - Verify field shows up correctly

### 2. API Credentials

- [ ] Get Zoho API credentials from https://api-console.zoho.com/
  - Client ID: ________________
  - Client Secret: ________________
  - Access Token: ________________

- [ ] Get Organization ID from Zoho Books
  - Settings → Organization Profile
  - Organization ID: ________________

- [ ] Create `.env` file with credentials (copy from `.env.example`)

### 3. Test Installation

- [ ] Install Node.js 18+ on warehouse PC
- [ ] Run `npm install` in project directory
- [ ] Run test labels: `node test-labels.js`
- [ ] Print test sheet and verify alignment with label paper
- [ ] Adjust margins in `server.js` if needed

### 4. Test Live Connection

- [ ] Start server: `npm start`
- [ ] Open browser: http://localhost:3000
- [ ] Click "Generate Labels" - verify it pulls from Zoho
- [ ] Check Excel file downloads correctly
- [ ] Print one page and verify fit with actual label sheets

## Production Deployment

### Option A: Local Server (Warehouse PC)

- [ ] Install PM2: `npm install -g pm2`
- [ ] Start service: `pm2 start server.js --name ZohoDeliveryLabels`
- [ ] Save process: `pm2 save`
- [ ] Enable startup: `pm2 startup` (run command it provides)
- [ ] Test reboot: Restart PC, verify auto-starts

**Access URL:** http://[PC-IP-ADDRESS]:3000

- [ ] Note PC IP address: ________________
- [ ] Add bookmark on warehouse iPads/phones
- [ ] Test from multiple devices on network

### Option B: Cloud Hosting (24/7)

- [ ] Create GitHub repository
- [ ] Push code: `git push origin main`
- [ ] Connect to DigitalOcean App Platform
- [ ] Add environment variables in dashboard
- [ ] Deploy and verify

**Access URL:** ________________

## Staff Training

- [ ] Demo system to warehouse manager
- [ ] Create quick-start guide (laminate and post near printer)
- [ ] Train 2-3 staff members on process
- [ ] Document troubleshooting steps

## Quick-Start Guide (for staff)

```
DAILY LABEL PRINTING - 3 STEPS

1. Open browser: http://[YOUR-URL]
2. Click "Generate Labels"
3. Print the downloaded Excel file

PRINTER SETTINGS:
✓ Paper: A4
✓ Scaling: 100% (no fit-to-page)
✓ Use label sheets from supply cabinet

TROUBLESHOOTING:
- If no labels appear: Check tomorrow's Zoho invoices have delivery dates
- If alignment is off: Call [IT Contact]
- If website down: Restart server or call [IT Contact]
```

## Monitoring & Maintenance

- [ ] Set up email alerts for server errors (Sentry/LogRocket)
- [ ] Schedule weekly check: Verify system is running
- [ ] Plan token refresh automation (see README Production Auth section)
- [ ] Document who to contact for issues:
  - IT Support: ________________
  - Zoho Admin: ________________

## Phase 2 Planning (Future)

- [ ] Add Shopify order integration
- [ ] Implement route optimization by suburb
- [ ] Build mobile driver app
- [ ] Add delivery confirmation tracking
- [ ] Connect to Podium for customer SMS notifications

## Go-Live Date

Target: ________________
Actual: ________________

## Post-Launch Review (1 Week Later)

- [ ] Survey warehouse staff on ease of use
- [ ] Measure time saved vs old Dymo process
- [ ] Document any issues encountered
- [ ] Plan improvements based on feedback

---

**System Owner:** ________________
**Technical Contact:** ________________
**Last Updated:** ________________
