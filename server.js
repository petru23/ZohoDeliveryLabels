const express = require('express');
const ExcelJS = require('exceljs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { addDays, format } = require('date-fns');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// CREDENTIAL STORAGE SYSTEM
// ============================================================================
// Stores user credentials in a local credentials.json file
// Allows users to configure the app via web UI without editing .env

class CredentialsManager {
  constructor() {
    this.credentialsFile = path.join(__dirname, 'credentials.json');
    this.loadCredentials();
  }

  loadCredentials() {
    try {
      if (fs.existsSync(this.credentialsFile)) {
        const data = fs.readFileSync(this.credentialsFile, 'utf8');
        this.credentials = JSON.parse(data);
        console.log('✓ Loaded credentials from file');
      } else {
        this.credentials = {};
        console.log('ℹ️  No credentials file found. Setup required.');
      }
    } catch (error) {
      console.error('Error loading credentials:', error.message);
      this.credentials = {};
    }
  }

  saveCredentials(creds) {
    try {
      this.credentials = creds;
      fs.writeFileSync(this.credentialsFile, JSON.stringify(creds, null, 2));
      console.log('✓ Credentials saved to file');
      return true;
    } catch (error) {
      console.error('Error saving credentials:', error.message);
      return false;
    }
  }

  hasCompleteCredentials() {
    // Accept credentials from credentials.json OR env vars. On Vercel the
    // file doesn't exist, but ZOHO_* env vars do — we should still report
    // configured so the dashboard skips the setup form.
    // A refresh token is sufficient on its own; the access token can be
    // regenerated from it on cold start.
    const orgId = this.credentials.organizationId || process.env.ZOHO_ORGANIZATION_ID;
    const clientId = this.credentials.clientId || process.env.ZOHO_CLIENT_ID;
    const clientSecret = this.credentials.clientSecret || process.env.ZOHO_CLIENT_SECRET;
    const hasToken = this.credentials.refreshToken || process.env.ZOHO_REFRESH_TOKEN ||
                     this.credentials.accessToken || process.env.ZOHO_ACCESS_TOKEN;
    return !!(orgId && clientId && clientSecret && hasToken);
  }

  getAll() {
    return this.credentials;
  }
}

const credentialsManager = new CredentialsManager();

// ============================================================================
// ZOHO OAUTH TOKEN MANAGER
// ============================================================================
// Handles automatic token refresh every 50 minutes
// See: https://www.zoho.com/billing/api/v1/oauth/

class TokenManager {
  constructor(credsManager) {
    // Get credentials from credentials.json file OR .env (file takes priority)
    const creds = credsManager.getAll();
    
    this.organizationId = creds.organizationId || process.env.ZOHO_ORGANIZATION_ID;
    this.clientId = creds.clientId || process.env.ZOHO_CLIENT_ID;
    this.clientSecret = creds.clientSecret || process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = creds.refreshToken || process.env.ZOHO_REFRESH_TOKEN || null;
    this.accessToken = creds.accessToken || process.env.ZOHO_ACCESS_TOKEN;
    this.tokenExpiresAt = null;
    this.authBaseUrl = 'https://accounts.zoho.com.au/oauth/v2/token';
    this.refreshInterval = null;
    this.credsManager = credsManager;
    
    // Background interval only on long-running hosts. On Vercel the process
    // is shut down between requests, so refresh is driven per-request via
    // ensureValidToken() instead.
    if (!process.env.VERCEL && this.refreshToken && this.clientId && this.clientSecret) {
      this.startAutoRefresh();
    }
  }

  // Initialize refresh token from current access token (one-time setup)
  async initializeRefreshToken() {
    if (this.refreshToken) {
      console.log('✓ Refresh token already exists');
      return true;
    }

    try {
      console.log('🔄 Generating refresh token from access token...');
      // Note: This requires the initial token to have been generated with offline access
      // For now, we'll assume you manually set ZOHO_REFRESH_TOKEN in .env after first generation
      console.log('⚠️  Please manually generate refresh token:');
      console.log('   1. Go to API Console and generate token with offline access');
      console.log('   2. Save ZOHO_REFRESH_TOKEN to .env');
      return false;
    } catch (error) {
      console.error('Error initializing refresh token:', error.message);
      return false;
    }
  }

  // Get new access token using refresh token
  async refreshAccessToken() {
    if (!this.refreshToken) {
      console.error('❌ No refresh token available. Cannot refresh access token.');
      return false;
    }

    try {
      console.log('🔄 Refreshing access token...');
      
      const params = new URLSearchParams();
      params.append('refresh_token', this.refreshToken);
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post(this.authBaseUrl, params);

      // Zoho's refresh grant returns only access_token + expires_in.
      // The refresh token is long-lived and is NOT rotated — never overwrite it.
      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
      process.env.ZOHO_ACCESS_TOKEN = this.accessToken;

      // credentials.json only persists on writable filesystems (local, not Vercel /tmp).
      if (!process.env.VERCEL) {
        const creds = this.credsManager.getAll();
        creds.accessToken = this.accessToken;
        this.credsManager.saveCredentials(creds);
      }

      console.log(`✓ Access token refreshed. Expires in ${response.data.expires_in} seconds`);
      return true;
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error.response?.data || error.message);
      return false;
    }
  }

  // Automatic refresh every 50 minutes
  startAutoRefresh() {
    // Refresh every 50 minutes (3000000 ms)
    const REFRESH_INTERVAL = 50 * 60 * 1000;

    this.refreshInterval = setInterval(async () => {
      console.log(`\n[${new Date().toISOString()}] Checking token expiry...`);
      await this.refreshAccessToken();
    }, REFRESH_INTERVAL);

    console.log('✓ Token auto-refresh scheduled (every 50 minutes)');
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      console.log('✓ Token auto-refresh stopped');
    }
  }

  // Check if token needs refresh (called before each API request)
  async ensureValidToken() {
    if (!this.refreshToken) return;

    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    // Cold start: no expiry tracked yet. The access token from env may be
    // hours old, so refresh proactively rather than risk a 401.
    if (!this.tokenExpiresAt) {
      console.log('🔄 No token expiry tracked yet — refreshing on cold start');
      await this.refreshAccessToken();
      return;
    }

    const timeUntilExpiry = this.tokenExpiresAt - Date.now();
    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      console.log(`⏰ Token expiring soon (${Math.round(timeUntilExpiry / 1000)}s left). Refreshing...`);
      await this.refreshAccessToken();
    }
  }

  async getAccessToken() {
    // For Vercel: Check and refresh token on every request
    // (since background intervals don't work reliably in serverless)
    if (process.env.VERCEL) {
      await this.ensureValidToken();
    }
    return this.accessToken;
  }
}

// Initialize token manager with credentials manager
const tokenManager = new TokenManager(credentialsManager);

// ============================================================================
// ZOHO BOOKS API CLIENT
// ============================================================================

class ZohoBooksAPI {
  constructor() {
    this.organizationId = process.env.ZOHO_ORGANIZATION_ID;
    this.baseUrl = 'https://www.zohoapis.com.au/billing/v1';
  }

  // Get current access token from token manager (async for Vercel auto-refresh)
  async getHeaders() {
    const token = await tokenManager.getAccessToken();
    return {
      'Authorization': `Zoho-oauthtoken ${token}`
    };
  }

  // Get all invoices for tomorrow's delivery
  async getTomorrowDeliveries() {
    return this.getDeliveriesForDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  }

  // Get all invoices for today's delivery
  async getTodayDeliveries() {
    return this.getDeliveriesForDate(format(new Date(), 'yyyy-MM-dd'));
  }

  // Get deliveries for a specific date
  async getDeliveriesForDate(targetDate) {
    try {
      // Zoho Billing API call - get all invoices with custom fields (sorted by date)
      const response = await axios.get(`${this.baseUrl}/invoices`, {
        headers: await this.getHeaders(),
        params: {
          organization_id: this.organizationId,
          sort_column: 'date',      // IMPORTANT: Sorting by date ensures custom fields are returned
          sort_order: 'D',            // Descending order (most recent first)
          page: 1,
          per_page: 100
        }
      });

      // Filter client-side for target date's deliveries
      const deliveries = (response.data.invoices || []).filter(invoice => {
        // Check if this invoice has a delivery date
        if (!invoice.cf_delivery_date && !invoice.cf_delivery_date_unformatted) {
          return false;
        }

        // Parse the delivery date (could be formatted as "20/03/2026" or "2026-03-20")
        let deliveryDate = null;
        const dateStr = invoice.cf_delivery_date_unformatted || invoice.cf_delivery_date;
        
        if (dateStr) {
          // Try to parse both formats
          if (dateStr.includes('-')) {
            // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
            deliveryDate = dateStr.split('T')[0];
          } else if (dateStr.includes('/')) {
            // DD/MM/YYYY format - convert to YYYY-MM-DD
            const [day, month, year] = dateStr.split('/');
            deliveryDate = `${year}-${month}-${day}`;
          }
        }

        if (deliveryDate !== targetDate) {
          return false;
        }

        // Filter to include ONLY deliveries (exclude pickups)
        const deliveryType = (invoice.cf_delivery_pick_up || '').toLowerCase();
        const isDelivery = deliveryType.includes('delivery') || deliveryType === 'd';
        
        return isDelivery;
      });

      console.log(`✓ Found ${deliveries.length} deliveries for ${targetDate}`);
      return deliveries;
    } catch (error) {
      console.error('Zoho API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch invoices from Zoho Books');
    }
  }

  // Get detailed invoice data (including custom fields)
  async getInvoiceDetails(invoiceId) {
    try {
      const response = await axios.get(`${this.baseUrl}/invoices/${invoiceId}`, {
        headers: await this.getHeaders(),
        params: {
          organization_id: this.organizationId
        }
      });

      return response.data.invoice;
    } catch (error) {
      console.error(`Error fetching invoice ${invoiceId}:`, error.message);
      return null;
    }
  }

  // Get customer/contact details (for address lookup when invoice address is missing)
  async getCustomerDetails(customerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/contacts/${customerId}`, {
        headers: await this.getHeaders(),
        params: {
          organization_id: this.organizationId
        }
      });

      return response.data.contact;
    } catch (error) {
      console.error(`Error fetching customer ${customerId}:`, error.message);
      return null;
    }
  }

  // Enrich deliveries with customer data when address/phone is missing
  async enrichDeliveriesWithCustomerData(deliveries) {
    const enrichedDeliveries = [];
    
    for (const delivery of deliveries) {
      // A street is required to consider an address "present" — city/state
      // alone are useless to a delivery driver, so we still need to fall
      // through to the customer record.
      const hasShippingAddress = !!delivery.shipping_address?.street;
      const hasBillingAddress = !!delivery.billing_address?.street;
      const hasPhone = delivery.shipping_address?.phone || 
                       delivery.billing_address?.phone || 
                       delivery.contactpersons?.[0]?.mobile ||
                       delivery.contact_persons_associated?.[0]?.mobile;
      
      // If address or phone is missing, fetch customer details
      if (!hasShippingAddress && !hasBillingAddress || !hasPhone) {
        console.log(`⚠️  Missing data for ${delivery.customer_name}. Fetching customer details...`);
        
        const customerDetails = await this.getCustomerDetails(delivery.customer_id);
        
        if (customerDetails) {
          // Merge customer data into delivery object
          // Only add if not already present
          if (!hasShippingAddress && !hasBillingAddress) {
            // Use customer's primary billing address
            if (customerDetails.billing_address) {
              delivery.customer_billing_address = customerDetails.billing_address;
              console.log(`  ✓ Added customer billing address for ${delivery.customer_name}`);
            }
            // Or shipping address if available
            if (customerDetails.shipping_address) {
              delivery.customer_shipping_address = customerDetails.shipping_address;
              console.log(`  ✓ Added customer shipping address for ${delivery.customer_name}`);
            }
          }
          
          // Add customer phone/mobile if missing
          if (!hasPhone) {
            if (customerDetails.phone || customerDetails.mobile) {
              delivery.customer_phone = customerDetails.phone || customerDetails.mobile;
              console.log(`  ✓ Added customer phone for ${delivery.customer_name}`);
            }
          }
          
          // Add contact persons if available
          if (customerDetails.contact_persons && customerDetails.contact_persons.length > 0) {
            delivery.customer_contact_persons = customerDetails.contact_persons;
          }
        }
      }
      
      enrichedDeliveries.push(delivery);
    }
    
    return enrichedDeliveries;
  }
}

// ============================================================================
// SHARED ITEM HELPERS (used by labels and SOLD tags)
// ============================================================================

const PAYMENT_KEYWORDS = [
  'tax fee', 'card fee', 'shopify fee', 'payment fee',
  'transaction fee', 'merchant fee', 'processing fee',
  'zip pay', 'zippay', 'zip money', 'zipmoney',
  'afterpay', 'after pay', 'humm', 'klarna',
  'paypal fee', 'stripe fee'
];
const isPaymentLine = (text) =>
  PAYMENT_KEYWORDS.some(kw => text.toLowerCase().includes(kw));

const isServiceLine = (text) => /instal|remov/i.test(text || '');

// Compact common brand names so the line fits a 99mm label or a SOLD tag.
const compactBrand = (line) =>
  (line || '').replace(/Fisher\s*&\s*Paykel/gi, 'F&P');

// Refrigeration product detection. Two signals — explicit keyword OR a
// capacity in litres (washing machines use kg, ovens have wattage, so
// litres is a strong fridge/freezer indicator).
const FRIDGE_RE = /\b(fridge|freezer|refrigerator)\b/i;
const LITRES_RE = /\b\d+(?:\.\d+)?\s*L(?:itres?)?\b/i;
const isFridgeItem = (item) => {
  const text = `${item.name || ''} ${item.description || ''}`;
  return FRIDGE_RE.test(text) || LITRES_RE.test(text);
};

// ============================================================================
// EXCEL LABEL GENERATOR
// ============================================================================

class DeliveryLabelGenerator {
  constructor() {
    // Avery 5162 compatible: 14 labels per A4 sheet
    // Label size: 99.1mm x 38.1mm (2 columns × 7 rows)
    this.labelsPerRow = 2;
    this.labelsPerColumn = 7;
    this.labelsPerPage = 14;
    
    // Excel sizing for Avery 5162:
    // Each cell column: 48 chars ≈ 49mm (99.1mm ÷ 2 ≈ 49.5mm per label)
    // Each row: 29 points ≈ 10.2mm height (for 4 rows per label = 38.1mm)
    this.labelColumnWidth = 48;
    this.labelRowHeight = 29;
  }

  async generateLabels(deliveries) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Delivery Labels', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        margins: {
          left: 0.5, // 12.7mm left margin
          right: 0.5,
          top: 0.5, // 12.7mm top margin
          bottom: 0.5,
          header: 0,
          footer: 0
        }
      }
    });

    // Add top margin row (height 5)
    worksheet.getRow(1).height = 5;

    // Set column widths:
    // Col 1: left margin (width 1)
    // Col 2: first label (width 48)
    // Col 3: middle margin (width 1)
    // Col 4: second label (width 48)
    worksheet.getColumn(1).width = 1;
    worksheet.getColumn(2).width = this.labelColumnWidth;
    worksheet.getColumn(3).width = 1;
    worksheet.getColumn(4).width = this.labelColumnWidth;

    let currentRow = 2;  // Start at row 2 (after top margin)
    let currentCol = 2;  // Start at column 2 (after left margin)

    for (let i = 0; i < deliveries.length; i++) {
      const delivery = deliveries[i];

      // Calculate cell position (currentCol already accounts for margins)
      const cellCol = currentCol;
      const cellRow = currentRow;

      // Format delivery data into label
      this.createLabel(worksheet, delivery, cellRow, cellCol);

      // Move to next label position
      if (currentCol === 2) {
        // First label done, move to second label (skip middle margin)
        currentCol = 4;
      } else {
        // Second label done, wrap to next row
        currentCol = 2;
        currentRow += 4; // Each label is 4 rows tall (38.1mm ÷ 9.5mm per row)
      }
    }

    // Generate filename as tomorrow's date (YYYY-MM-DD.xlsx)
    const tomorrow = addDays(new Date(), 1);
    const filename = `${format(tomorrow, 'yyyy-MM-dd')}.xlsx`;

    // Generate in memory. On Vercel, files in /tmp don't survive across
    // invocations, so a separate /download/:filename request can't see
    // them — we stream the buffer back in the same response instead.
    const buffer = await workbook.xlsx.writeBuffer();

    // Mirror to ./output locally so the file list and dev tooling keep working.
    if (!process.env.VERCEL) {
      const outputDir = path.join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
      fs.writeFileSync(path.join(outputDir, filename), buffer);
    }

    return { filename, buffer };
  }

  createLabel(worksheet, delivery, startRow, startCol) {
    // Extract customer and address info
    const customerName = delivery.customer_name || 'CUSTOMER NAME MISSING';
    
    // Address extraction. An entry is only usable if it has a street —
    // city/state alone don't help the driver, so we keep falling through
    // until we find a record with a real street line.
    const formatAddress = (addr) => {
      if (!addr || !addr.street) return null;
      return [addr.street, addr.street2, addr.city, addr.state]
        .filter(Boolean)
        .join(', ');
    };

    const address =
      formatAddress(delivery.shipping_address) ||
      formatAddress(delivery.billing_address) ||
      formatAddress(delivery.customer_shipping_address) ||
      formatAddress(delivery.customer_billing_address) ||
      delivery.customer_billing_address?.attention ||
      delivery.billing_address?.attention ||
      '';
    
    // Phone extraction with fallback chain
    let phone = delivery.shipping_address?.phone || 
                delivery.billing_address?.phone || 
                (delivery.contactpersons?.[0]?.mobile) ||
                (delivery.contact_persons_associated?.[0]?.mobile) ||
                delivery.customer_phone ||  // From customer record
                (delivery.customer_contact_persons?.[0]?.mobile) ||  // From customer contacts
                '';
    
    // DEBUG: Log entire delivery object structure for this customer
    console.log(`\n================== ${customerName} ==================`);
    console.log('ALL FIELDS IN DELIVERY OBJECT:');
    Object.keys(delivery).forEach(key => {
      const value = delivery[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          console.log(`  ${key}: [Array with ${value.length} items]`);
          value.forEach((item, idx) => {
            if (typeof item === 'object') {
              console.log(`    [${idx}]:`, JSON.stringify(item).substring(0, 100));
            } else {
              console.log(`    [${idx}]: ${item}`);
            }
          });
        } else {
          console.log(`  ${key}:`, JSON.stringify(value).substring(0, 150));
        }
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    console.log(`==========================================\n`);
    
    // Filter line items down to what the driver actually needs:
    //   keep — product name/model, install/removal as service tags
    //   drop — payment fees, BNPL surcharges, condition notes, warranty/marketing
    const invoiceItems = delivery.invoice_items || [];

    const noiseKeywords = [
      // Condition notes — driver doesn't act on these
      'factory second', 'second hand', 'carton damaged', 'damaged',
      'scratched', 'dented',
      // Warranty fluff and marketing copy
      'warranty', 'thanks again for choosing us', 'hope you enjoy',
      'thank you for choosing',
      // Source tags Zoho appends — not product info
      'shopify'
    ];
    const isNoiseLine = (line) =>
      noiseKeywords.some(kw => line.toLowerCase().includes(kw));

    const shouldExcludeLine = (line) => isPaymentLine(line) || isNoiseLine(line);
    
    // Get all products (not just first one) - show full product descriptions
    let products = [];
    let services = [];
    
    for (const item of invoiceItems) {
      // Zoho splits item info inconsistently: sometimes the model lives in
      // `name` and `description` only carries a condition note (e.g.
      // "Factory Second"), sometimes the description holds the full
      // multi-line model+notes block. Read both, dedupe, then filter.
      const name = (item.name || '').trim();
      const description = (item.description || '').trim();

      if ((name && isPaymentLine(name)) || (description && isPaymentLine(description))) {
        continue; // payment/fee line
      }

      const probe = name || description;
      if (isServiceLine(probe)) {
        services.push(compactBrand(probe));
        continue;
      }

      const candidates = [name, ...description.split('\n')]
        .map(l => l.trim())
        .filter(Boolean);

      const seen = new Set();
      const productLines = [];
      for (const line of candidates) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (shouldExcludeLine(line)) continue;
        if (isServiceLine(line)) continue;
        productLines.push(compactBrand(line));
      }

      if (productLines.length > 0) {
        products.push(productLines.join('\n'));
      }
    }
    
    // DEBUG: Log what we found for this customer
    if (products.length > 0 || services.length > 0) {
      console.log(`[${customerName}] Products: ${products.length}, Services: ${services.length}`);
      if (products.length > 0) console.log(`  → Products: ${products.join(' | ')}`);
      if (services.length > 0) console.log(`  → Services: ${services.join(' | ')}`);
    }

    // Merge cells for label area (single column, 4 rows)
    // Each row is 10mm, 4 rows = 40mm ≈ 38.1mm label height
    const endRow = startRow + 3;
    const cell = worksheet.getCell(startRow, startCol);
    worksheet.mergeCells(startRow, startCol, endRow, startCol);

    // Set row heights for the label (4 rows of ~10mm each)
    for (let r = startRow; r <= endRow; r++) {
      worksheet.getRow(r).height = this.labelRowHeight; // ~10mm per row
    }

    // Build label content - compact format
    const labelContent = [];
    
    // Customer name (bold, size 10)
    labelContent.push({ 
      text: customerName + '\n', 
      font: { bold: true, size: 10, name: 'Arial' } 
    });
    
    // Address (size 8)
    if (address) {
      labelContent.push({ 
        text: address + '\n', 
        font: { size: 8, name: 'Arial' } 
      });
    }
    
    // Phone (size 8)
    if (phone.trim()) {
      labelContent.push({ 
        text: `Ph: ${phone}`, 
        font: { size: 8, name: 'Arial' } 
      });
    }
    
    // All products (bold, size 8) - blank line above to separate from contact info, each item on own line
    if (products.length > 0) {
      const hasContactInfo = !!address || phone.trim();
      labelContent.push({
        text: (hasContactInfo ? '\n\n' : '') + products.join('\n'),
        font: { bold: true, size: 8, name: 'Arial' }
      });
    }
    
    // Services/Installation info (bold, size 7)
    if (services.length > 0) {
      labelContent.push({ 
        text: '\n' + services.join(', '), 
        font: { bold: true, size: 7, name: 'Arial' } 
      });
    }

    cell.value = { richText: labelContent };
    
    // Styling
    cell.alignment = {
      vertical: 'top',
      horizontal: 'left',
      wrapText: true
    };

    // Border (light gray)
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
    };
  }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

const zohoBooks = new ZohoBooksAPI();
const labelGenerator = new DeliveryLabelGenerator();

// Root endpoint - serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Stream the .xlsx directly so the file never has to survive between
// invocations on Vercel. Empty days return JSON; the dashboard branches
// on Content-Type.
async function streamLabels(res, deliveries, downloadFilename, emptyMessage) {
  if (deliveries.length === 0) {
    return res.json({ success: true, message: emptyMessage, count: 0 });
  }

  const detailed = (await Promise.all(
    deliveries.map(inv => zohoBooks.getInvoiceDetails(inv.invoice_id))
  )).filter(d => d !== null);
  const enriched = await zohoBooks.enrichDeliveriesWithCustomerData(detailed);

  const { buffer } = await labelGenerator.generateLabels(enriched);

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${downloadFilename}"`,
    'X-Delivery-Count': String(enriched.length),
    'X-Delivery-Filename': downloadFilename,
    'Access-Control-Expose-Headers': 'X-Delivery-Count, X-Delivery-Filename',
  });
  res.send(Buffer.from(buffer));
}

// Generate labels endpoint (for TOMORROW by default)
app.get('/api/generate-labels', async (req, res) => {
  try {
    console.log('Fetching tomorrow\'s deliveries from Zoho Books...');
    const invoices = await zohoBooks.getTomorrowDeliveries();
    const filename = `${format(addDays(new Date(), 1), 'yyyy-MM-dd')}.xlsx`;
    await streamLabels(res, invoices, filename, 'No deliveries scheduled for tomorrow');
  } catch (error) {
    console.error('Label generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate labels for TODAY (alternative endpoint)
app.get('/api/generate-labels-today', async (req, res) => {
  try {
    console.log('Fetching today\'s deliveries from Zoho Books...');
    const invoices = await zohoBooks.getTodayDeliveries();
    const filename = `${format(new Date(), 'yyyy-MM-dd')}-deliveries.xlsx`;
    await streamLabels(res, invoices, filename, 'No deliveries scheduled for today');
  } catch (error) {
    console.error('Label generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download generated file
app.get('/download/:filename', (req, res) => {
  const outputDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'output');
  const filepath = path.join(outputDir, req.params.filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filepath);
});

// List recent label files
app.get('/api/files', (req, res) => {
  const outputDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'output');
  
  if (!fs.existsSync(outputDir)) {
    return res.json({ files: [] });
  }

  const files = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.xlsx'))
    .map(f => ({
      name: f,
      downloadUrl: `/download/${f}`,
      createdAt: fs.statSync(path.join(outputDir, f)).mtime
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10); // Last 10 files

  res.json({ files });
});

// Debug endpoint - show raw invoice data
app.get('/api/debug/invoices', async (req, res) => {
  try {
    const response = await axios.get(`${zohoBooks.baseUrl}/invoices`, {
      headers: await zohoBooks.getHeaders(),
      params: {
        organization_id: zohoBooks.organizationId,
        sort_column: 'customer_name',
        sort_order: 'A',
        page: 1,
        per_page: 10
      }
    });

    const invoices = response.data.invoices || [];
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    
    res.json({
      tomorrow: tomorrow,
      today: format(new Date(), 'yyyy-MM-dd'),
      totalInvoices: invoices.length,
      invoices: invoices.map(inv => ({
        invoiceNumber: inv.invoice_number,
        customer: inv.customer_name,
        cf_delivery_date: inv.cf_delivery_date,
        cf_delivery_date_unformatted: inv.cf_delivery_date_unformatted,
        cf_delivery_pick_up: inv.cf_delivery_pick_up,
        status: inv.status
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// SOLD TAG FORM - Simple form for staff to enter invoice ID
// ============================================================================

app.get('/sold-tag-form', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SOLD Tag Generator</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
          padding: 40px;
        }
        
        h1 {
          font-size: 28px;
          margin-bottom: 10px;
          color: #1a202c;
        }
        
        .subtitle {
          color: #718096;
          margin-bottom: 30px;
          font-size: 14px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: #2d3748;
        }
        
        input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.2s;
        }
        
        input:focus {
          outline: none;
          border-color: #667eea;
        }
        
        .btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        
        .btn:active {
          transform: translateY(0);
        }
        
        .help-text {
          margin-top: 30px;
          padding: 20px;
          background: #f7fafc;
          border-radius: 12px;
          font-size: 14px;
          color: #4a5568;
          line-height: 1.6;
        }
        
        .help-text strong {
          color: #2d3748;
          display: block;
          margin-bottom: 8px;
        }
        
        .example {
          font-family: 'Courier New', monospace;
          background: white;
          padding: 8px;
          border-radius: 4px;
          margin-top: 8px;
          color: #667eea;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🏷️ SOLD Tag Generator</h1>
        <p class="subtitle">Enter Zoho Books invoice ID to generate tag</p>
        
        <form onsubmit="generateTag(event)">
          <div class="form-group">
            <label for="invoiceId">Invoice ID</label>
            <input 
              type="text" 
              id="invoiceId" 
              name="invoiceId" 
              placeholder="e.g., 987654321"
              required
              autofocus
            >
          </div>
          
          <button type="submit" class="btn">
            Generate SOLD Tag
          </button>
        </form>
        
        <div class="help-text">
          <strong>How to find Invoice ID:</strong>
          1. Open invoice in Zoho Books<br>
          2. Look at the URL in your browser<br>
          3. Copy the last number from the URL
          
          <div class="example">
            books.zoho.com/app/123/invoices/<strong>987654321</strong>
          </div>
        </div>
      </div>
      
      <script>
        function generateTag(event) {
          event.preventDefault();
          const invoiceId = document.getElementById('invoiceId').value.trim();
          
          if (invoiceId) {
            // Open in new window
            window.open('/sold-tag?invoice=' + invoiceId, '_blank');
            
            // Clear input for next use
            document.getElementById('invoiceId').value = '';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// ============================================================================
// End of SOLD TAG FORM code
// ============================================================================

// ============================================================================
// SOLD TAG GENERATOR - Add this code to server.js
// ============================================================================

// Display SOLD tag in browser (ready to print)
app.get('/sold-tag', async (req, res) => {
  try {
    const invoiceId = req.query.invoice;
    
    if (!invoiceId) {
      return res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px;">
            <h2>❌ Missing Invoice ID</h2>
            <p>Please open this from Zoho Books with an invoice ID</p>
            <p><strong>Example:</strong> /sold-tag?invoice=123456789</p>
          </body>
        </html>
      `);
    }
    
    console.log(`Generating SOLD tag for invoice: ${invoiceId}`);
    
    // Get invoice details from Zoho
    const invoice = await zohoBooks.getInvoiceDetails(invoiceId);
    
    if (!invoice) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 40px;">
            <h2>❌ Invoice not found</h2>
            <p>Invoice ID: ${invoiceId}</p>
            <p>Check your Zoho Books access token and invoice ID</p>
          </body>
        </html>
      `);
    }
    
    // Extract data
    const suburb = invoice.shipping_address?.city || invoice.billing_address?.city || '';
    
    // Get custom fields
    const customFields = invoice.custom_fields || [];
    
    // DEBUG: Log custom fields
    console.log(`\n=== INVOICE ${invoiceId} ===`);
    console.log('Custom fields:', customFields.map(f => ({ label: f.label, value: f.value })));
    
    // Get delivery date from custom field "Delivery Pickup Date"
    const deliveryDateField = customFields.find(f => 
      f.label?.toLowerCase().includes('delivery') && f.label?.toLowerCase().includes('date')
    )?.value || '';
    
    let deliveryDate = '';
    if (deliveryDateField) {
      // Parse delivery date (could be "2026-04-02" or "02/04/2026")
      if (deliveryDateField.includes('-')) {
        // ISO format: YYYY-MM-DD
        const dateStr = String(deliveryDateField).split('T')[0];
        const [year, month, day] = dateStr.split('-');
        deliveryDate = `${day}/${month}/${year}`;
      } else if (deliveryDateField.includes('/')) {
        // Already in DD/MM/YYYY format
        deliveryDate = String(deliveryDateField);
      } else {
        // Try parsing as timestamp
        const parsed = new Date(deliveryDateField);
        if (!isNaN(parsed.getTime())) {
          deliveryDate = format(parsed, 'dd/MM/yyyy');
        }
      }
    }
    // Fallback to today's date if no delivery date found
    if (!deliveryDate) {
      console.log('⚠️  No delivery date found, using today');
      deliveryDate = format(new Date(), 'dd/MM/yyyy');
    } else {
      console.log(`✓ Delivery date parsed: ${deliveryDate} (from: ${deliveryDateField})`);
    }
    
    // Get custom fields and convert true/false to YES/NO
    const getCustomField = (label) => {
      const field = customFields.find(f => 
        f.label?.toLowerCase().includes(label.toLowerCase())
      );
      const value = field?.value;
      
      // Convert boolean values to YES/NO
      if (value === true || value === 'true') return 'YES';
      if (value === false || value === 'false') return 'NO';
      
      return value || '';
    };
    
    const removalRequired = getCustomField('removal');
    const comboUnit = getCustomField('combo');
    const stairsAccess = getCustomField('stairs');
    const onlineOrder = getCustomField('online') || getCustomField('shopify') || '';
    
    // Build one SOLD tag per physical item. Skip payment fees and
    // services (install/removal aren't things you stick a tag on).
    // The fridge warning is decided per-item, so a mixed order with a
    // fridge and a washer prints one fridge tag (with warning) and one
    // normal tag (without).
    const items = invoice.invoice_items || invoice.line_items || [];
    const tagItems = [];
    for (const item of items) {
      const name = (item.name || '').trim();
      const description = (item.description || '').trim();
      if ((name && isPaymentLine(name)) || (description && isPaymentLine(description))) continue;
      if (isServiceLine(name) || isServiceLine(description)) continue;

      const displayName = compactBrand(name || description.split('\n')[0]);
      if (!displayName) continue;

      const fridge = isFridgeItem(item);
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      for (let i = 0; i < qty; i++) {
        tagItems.push({ isFridge: fridge, displayName });
      }
    }
    // Defensive fallback: if we couldn't identify any physical item, still
    // print one blank tag so the user gets something rather than nothing.
    if (tagItems.length === 0) {
      tagItems.push({ isFridge: false, displayName: '' });
    }
    
    // Generate HTML page (print-ready)
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SOLD Tag - ${invoice.invoice_number}</title>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #e5e5e5;
          }

          .tag {
            width: 186mm;
            height: 273mm;
            padding: 16mm 14mm;
            margin: 12mm auto;
            background: white;
            border: 4px solid #FF0000;
            display: flex;
            flex-direction: column;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
          }

          .tag:last-of-type {
            page-break-after: auto;
            break-after: auto;
            margin-bottom: 0;
          }

          .tag-header {
            text-align: center;
          }

          .tag-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          .tag-footer {
            min-height: 0;
          }

          .take-photo {
            font-size: 16pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 6mm;
            color: #FF0000;
            letter-spacing: 2px;
          }

          .item-name {
            font-size: 22pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 8mm;
            color: #1a202c;
            word-break: break-word;
            line-height: 1.2;
          }

          h1 {
            text-align: center;
            font-size: 130pt;
            margin: 0 0 12mm 0;
            font-weight: 900;
            letter-spacing: 14px;
            color: #FF0000;
            line-height: 1;
          }

          .field {
            font-size: 26pt;
            font-weight: bold;
            margin: 6mm 0;
            display: flex;
            align-items: baseline;
          }

          .field-label {
            min-width: 75mm;
          }

          .field-line {
            flex: 1;
            border-bottom: 3px solid #000;
            margin-left: 6mm;
            height: 10mm;
            position: relative;
          }

          .field-value {
            position: absolute;
            left: 3mm;
            top: -2mm;
            font-weight: normal;
            font-size: 22pt;
          }

          .warning {
            margin-top: 8mm;
            padding: 6mm;
            border: 2px solid #000;
            font-size: 14pt;
            line-height: 1.5;
            text-align: left;
          }

          .warning-title {
            font-weight: bold;
            font-size: 15pt;
            margin-bottom: 4mm;
          }

          .highlight {
            font-weight: bold;
            text-decoration: underline;
          }

          @media screen {
            body {
              transform-origin: top center;
            }
          }

          @media print {
            html, body {
              margin: 0;
              padding: 0;
              background: white;
              width: 210mm;
            }

            .no-print {
              display: none !important;
            }

            .tag {
              width: 186mm;
              height: 273mm;
              margin: 12mm auto;
              padding: 16mm 14mm;
              border: 4px solid #FF0000;
              page-break-after: always;
              page-break-inside: avoid;
              break-after: page;
              break-inside: avoid;
            }

            .tag:last-of-type {
              page-break-after: auto;
              break-after: auto;
            }
          }
          
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 30px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 1000;
          }
          
          .print-button:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 6px 8px rgba(0,0,0,0.15);
          }
          
          .print-button:active {
            transform: translateY(0);
          }
        </style>
      </head>
      <body>
        <button class="print-button no-print" onclick="window.print()">
          🖨️ Print Tag
        </button>
        
        ${tagItems.map(t => `
        <div class="tag">
          <div class="tag-header">
            <div class="take-photo">Take Photo</div>
            ${t.displayName ? `<div class="item-name">${t.displayName}</div>` : ''}
          </div>

          <div class="tag-main">
            <h1>SOLD</h1>

            <div class="field">
              <div class="field-label">SUBURB</div>
              <div class="field-line">
                <div class="field-value">${suburb}</div>
              </div>
            </div>

            <div class="field">
              <div class="field-label">DATE</div>
              <div class="field-line">
                <div class="field-value">${deliveryDate}</div>
              </div>
            </div>

            <div class="field">
              <div class="field-label">REMOVAL</div>
              <div class="field-line">
                <div class="field-value">${removalRequired}</div>
              </div>
            </div>

            <div class="field">
              <div class="field-label">COMBO</div>
              <div class="field-line">
                <div class="field-value">${comboUnit}</div>
              </div>
            </div>

            <div class="field">
              <div class="field-label">STAIRS</div>
              <div class="field-line">
                <div class="field-value">${stairsAccess}</div>
              </div>
            </div>

            <div class="field">
              <div class="field-label">ONLINE ORDER</div>
              <div class="field-line">
                <div class="field-value">${onlineOrder}</div>
              </div>
            </div>
          </div>

          <div class="tag-footer">
            ${t.isFridge ? `
            <div class="warning">
              <div>Please <span class="highlight">Leave Switched Off For 3-4 Hours After Transportation.</span></div>
              <div style="margin-top: 10px;">Please Use <span class="highlight">Surge Protection</span> And <span class="highlight">Allow Up To 24 Hours</span> To Reach Optimum Chilling Temperature Before Putting Food Inside.</div>
            </div>
            ` : ''}
          </div>
        </div>
        `).join('')}
      </body>
      </html>
    `;
    
    res.send(html);
    
  } catch (error) {
    console.error('SOLD tag error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px;">
          <h2>❌ Error generating tag</h2>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Check server logs for details</p>
        </body>
      </html>
    `);
  }
});

// ============================================================================
// End of SOLD TAG code
// ============================================================================

// ============================================================================
// SETUP API ENDPOINTS
// ============================================================================

// Check if credentials are configured
app.get('/api/setup/status', (req, res) => {
  const hasCredentials = credentialsManager.hasCompleteCredentials();
  res.json({
    configured: hasCredentials,
    credentials: hasCredentials ? {
      organizationId: credentialsManager.credentials.organizationId || process.env.ZOHO_ORGANIZATION_ID,
    } : {}
  });
});

// Save credentials from setup form
app.post('/api/setup/save', (req, res) => {
  try {
    const { organizationId, accessToken, clientId, clientSecret, refreshToken } = req.body;

    if (!organizationId || !accessToken || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'Missing required credentials. Please fill in all fields.'
      });
    }

    // Save credentials
    const newCreds = {
      organizationId,
      accessToken,
      clientId,
      clientSecret,
      refreshToken: refreshToken || null
    };

    const saved = credentialsManager.saveCredentials(newCreds);

    if (saved) {
      // Update token manager with new credentials
      tokenManager.organizationId = organizationId;
      tokenManager.accessToken = accessToken;
      tokenManager.clientId = clientId;
      tokenManager.clientSecret = clientSecret;
      tokenManager.refreshToken = refreshToken || null;

      // Restart auto-refresh with new credentials
      if (tokenManager.refreshInterval) {
        clearInterval(tokenManager.refreshInterval);
      }
      if (accessToken && clientId && clientSecret) {
        tokenManager.startAutoRefresh();
      }

      console.log('✓ Credentials updated and saved');
      return res.json({
        success: true,
        message: 'Credentials saved successfully! Auto-refresh enabled.'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to save credentials'
      });
    }
  } catch (error) {
    console.error('Setup error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error saving credentials'
    });
  }
});

// ============================================================================
// SERVER START
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     DELIVERY LABEL GENERATOR - RUNNING ON PORT ${PORT}       ║
╚════════════════════════════════════════════════════════════╝

Dashboard: http://localhost:${PORT}
API Docs:  http://localhost:${PORT}/api/health
  `);
});
