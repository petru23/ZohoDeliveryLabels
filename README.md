# Delivery Label Generator - Zoho Books Integration

Automated system to generate print-ready delivery labels from Zoho Books invoices.

## What This Does

1. **Connects to Zoho Books** - Fetches tomorrow's scheduled deliveries
2. **Formats into Excel** - Creates perfectly sized labels (99.1mm × 38.1mm)
3. **Print-Ready Output** - 14 labels per A4 sheet (Avery 5162 compatible)
4. **One-Click Operation** - Web dashboard for warehouse staff

---

## Quick Start

### 1. Install Dependencies

```bash
cd delivery-labels
npm install
```

### 2. Configure Zoho Books API

#### Get Zoho API Credentials:

1. Go to https://api-console.zoho.com/
2. Click **"Add Client"** → **"Self Client"**
3. Note your **Client ID** and **Client Secret**
4. Click **"Generate Token"** with scope: `ZohoBooks.fullaccess.all`
5. Copy the **Access Token** (valid for 1 hour)

#### Get Organization ID:

1. Open Zoho Books
2. Go to Settings → Organization Profile
3. Copy your **Organization ID**

#### Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
ZOHO_ORGANIZATION_ID=123456789
ZOHO_ACCESS_TOKEN=1000.abc123xyz...
PORT=3000
```

### 3. Run the Server

```bash
npm start
```

Open browser: **http://localhost:3000**

---

## How It Works

### Data Flow

```
Zoho Books Invoice
    ↓
Check: delivery_date = tomorrow?
    ↓
Extract: Customer, Address, Phone, Order#
    ↓
Format into Excel (ExcelJS)
    ↓
Apply Avery 5162 template (14 labels/page)
    ↓
Download ready-to-print .xlsx file
```

### Zoho Books Setup Required

**Custom Field Needed:**
- Field Name: `cf_delivery_date` (Date field)
- Location: Invoice custom fields
- Purpose: Marks which invoices need delivery tomorrow

**How to Add:**
1. Zoho Books → Settings → Invoices → Custom Fields
2. Add new field: "Delivery Date" (Type: Date)
3. Make it mandatory for all new invoices

### Label Format

Each label includes:
```
CUSTOMER NAME (bold, 11pt)
Street Address
City, State ZIP
Phone: (07) 1234 5678
Order: INV-12345
```

**Dimensions:** 99.1mm × 38.1mm (Avery 5162 / L7163 equivalent)

---

## Usage

### Via Web Dashboard

1. Open http://localhost:3000
2. Click **"Generate Labels"**
3. File auto-downloads
4. Print the Excel file (no scaling, actual size)

### Via API

**Generate Labels:**
```bash
curl http://localhost:3000/api/generate-labels
```

**List Recent Files:**
```bash
curl http://localhost:3000/api/files
```

---

## Customization

### Change Label Layout

Edit `server.js` → `createLabel()` function:

```javascript
// Current format
const labelText = `${customerName}\n${street}\n${city}, ${state} ${zip}\nPhone: ${phone}\nOrder: ${orderRef}`;

// Example: Add special instructions
const specialInstructions = delivery.notes || '';
const labelText = `${customerName}\n${street}\n${city}, ${state} ${zip}\nPhone: ${phone}\nOrder: ${orderRef}\n${specialInstructions}`;
```

### Change Zoho Books Filter

Edit `server.js` → `getTomorrowDeliveries()`:

```javascript
// Current: Filters by delivery_date = tomorrow
params: {
  cf_delivery_date: tomorrow,
  status: 'sent'
}

// Example: Get all unpaid invoices
params: {
  status: 'unpaid',
  date: tomorrow
}
```

### Sort by Suburb (Route Optimization)

```javascript
// In getTomorrowDeliveries()
params: {
  organization_id: this.organizationId,
  cf_delivery_date: tomorrow,
  sort_column: 'billing_address.city', // Sort by suburb
  sort_order: 'A'
}
```

---

## Production Deployment

### Option 1: Run on Local Server (Warehouse PC)

**Requirements:**
- Windows/Mac/Linux PC
- Node.js 18+ installed
- Always-on during warehouse hours

**Setup:**
```bash
# Install as Windows service (using pm2)
npm install -g pm2
pm2 start server.js --name delivery-labels
pm2 save
pm2 startup
```

Access from any device: `http://[PC-IP-ADDRESS]:3000`

### Option 2: Cloud Hosting (24/7 Access)

**Recommended:** DigitalOcean App Platform ($5/month)

**Deploy:**
1. Push code to GitHub
2. Connect DigitalOcean to your repo
3. Add environment variables in dashboard
4. Deploy (auto-updates on git push)

**Access:** https://your-app.ondigitalocean.app

---

## Troubleshooting

### "Failed to fetch invoices from Zoho Books"

**Cause:** Access token expired (Zoho tokens last 1 hour)

**Fix:** Implement refresh token flow (see Production Auth below)

### "No deliveries scheduled for tomorrow"

**Check:**
1. Do invoices have `cf_delivery_date` field filled?
2. Is the date exactly tomorrow's date?
3. Is invoice status "sent" (not draft)?

### "Label formatting looks wrong"

**Printer Settings:**
- Paper: A4 (210mm × 297mm)
- Scaling: 100% (no fit-to-page)
- Margins: Minimum (or as-is)

**Excel Print Setup:**
- File → Print → Page Setup
- Fit to: 1 page wide × 1 page tall
- Margins: Narrow

---

## Production-Ready Auth (Auto-Renewing Tokens)

For 24/7 operation, implement OAuth refresh flow:

**Add to `.env`:**
```env
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
```

**Update `ZohoBooksAPI` class:**

```javascript
class ZohoBooksAPI {
  async refreshAccessToken() {
    const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      }
    });
    
    this.accessToken = response.data.access_token;
    return this.accessToken;
  }

  async getTomorrowDeliveries() {
    try {
      // Try with current token
      return await this._fetchDeliveries();
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, refresh and retry
        await this.refreshAccessToken();
        return await this._fetchDeliveries();
      }
      throw error;
    }
  }
}
```

---

## Next Steps: Full Integration

This label system is Phase 1. Here's the roadmap:

### Phase 2: Add Shopify Orders
- Fetch Shopify orders for tomorrow's pickup
- Merge with Zoho Books deliveries
- Combined label sheet

### Phase 3: Route Optimization
- Group labels by suburb/postcode
- Sort by optimal delivery route
- Add map integration

### Phase 4: Driver App
- Mobile view for drivers
- Check off deliveries
- Collect signatures
- Update Zoho Books on completion

### Phase 5: Full Ecosystem
- Real-time inventory sync (Zoho ↔ Shopify)
- Podium SMS notifications
- Automated follow-ups

---

## Support

**Common Issues:**
- [Zoho Books API Docs](https://www.zoho.com/books/api/v3/)
- [ExcelJS Documentation](https://github.com/exceljs/exceljs)

**Questions?** Open an issue or contact your dev team.

---

## License

Internal use only - Your Company Name

---

**Built with:** Node.js, Express, ExcelJS, Zoho Books API
