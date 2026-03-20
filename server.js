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
// ZOHO OAUTH TOKEN MANAGER
// ============================================================================
// Handles automatic token refresh every 50 minutes
// See: https://www.zoho.com/billing/api/v1/oauth/

class TokenManager {
  constructor() {
    this.organizationId = process.env.ZOHO_ORGANIZATION_ID;
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN || null;
    this.accessToken = process.env.ZOHO_ACCESS_TOKEN;
    this.tokenExpiresAt = null;
    this.authBaseUrl = 'https://accounts.zoho.com.au/oauth/v2/token';
    this.refreshInterval = null;
    
    // Start automatic refresh
    this.startAutoRefresh();
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
      const response = await axios.post(this.authBaseUrl, null, {
        params: {
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token'
        }
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token; // Update refresh token (rotates on each refresh)
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
      
      // Update environment variable for reference
      process.env.ZOHO_ACCESS_TOKEN = this.accessToken;
      process.env.ZOHO_REFRESH_TOKEN = this.refreshToken;
      
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
    const now = Date.now();
    const timeUntilExpiry = this.tokenExpiresAt - now;
    
    // If token expires in less than 5 minutes, refresh now
    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    if (this.tokenExpiresAt && timeUntilExpiry < REFRESH_THRESHOLD) {
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

// Initialize token manager
const tokenManager = new TokenManager();

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
}

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
    // Each cell column: 24 units ≈ 50mm (99.1mm ÷ 2 ≈ 50mm per label)
    // Each row: 28.5 points ≈ 10mm height (for 4 rows per label = 40mm ≈ 38.1mm)
    this.labelColumnWidth = 24;
    this.labelRowHeight = 28.5;
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

    // Set column widths (2 columns, each is one label width)
    worksheet.getColumn(1).width = this.labelColumnWidth;
    worksheet.getColumn(2).width = this.labelColumnWidth;

    let currentRow = 1;
    let currentCol = 1;

    for (let i = 0; i < deliveries.length; i++) {
      const delivery = deliveries[i];
      
      // Calculate cell position
      const cellCol = currentCol;
      const cellRow = currentRow;

      // Format delivery data into label
      this.createLabel(worksheet, delivery, cellRow, cellCol);

      // Move to next label position
      currentCol++;
      if (currentCol > this.labelsPerRow) {
        currentCol = 1;
        currentRow += 4; // Each label is 4 rows tall (38.1mm ÷ 9.5mm per row)
      }
    }

    // Generate filename as tomorrow's date (YYYY-MM-DD.xlsx)
    const tomorrow = addDays(new Date(), 1);
    const filename = `${format(tomorrow, 'yyyy-MM-dd')}.xlsx`;
    
    // Vercel uses /tmp for temporary files (serverless environment)
    const outputDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'output');
    const filepath = path.join(outputDir, filename);

    // Ensure output directory exists (local only)
    if (!process.env.VERCEL && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    await workbook.xlsx.writeFile(filepath);
    return { filename, filepath };
  }

  createLabel(worksheet, delivery, startRow, startCol) {
    // Extract customer and address info
    const customerName = delivery.customer_name || 'CUSTOMER NAME MISSING';
    
    // Address: Try shipping first, then billing
    let address = '';
    if (delivery.billing_address?.attention) {
      address = delivery.billing_address.attention; // Single line address
    } else {
      let parts = [];
      if (delivery.shipping_address?.street) parts.push(delivery.shipping_address.street);
      if (delivery.shipping_address?.city) parts.push(delivery.shipping_address.city);
      address = parts.join(', ');
    }
    
    // Phone
    let phone = delivery.shipping_address?.phone || 
                delivery.billing_address?.phone || 
                (delivery.contactpersons?.[0]?.mobile) ||
                (delivery.contact_persons_associated?.[0]?.mobile) ||
                '';
    
    // Extract first item only (to fit in label)
    const invoiceItems = delivery.invoice_items || [];
    const firstItem = invoiceItems[0];
    let itemText = '';
    if (firstItem) {
      const desc = firstItem.description || firstItem.name || 'Item';
      const itemName = desc.split('\n')[0]; // Just first line
      itemText = itemName.substring(0, 50); // Limit to 50 chars
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
        text: `Ph: ${phone} `, 
        font: { size: 8, name: 'Arial' } 
      });
    }
    
    // Item (size 8)
    if (itemText) {
      labelContent.push({ 
        text: `• ${itemText}`, 
        font: { size: 8, name: 'Arial' } 
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

// Generate labels endpoint (for TOMORROW by default)
app.get('/api/generate-labels', async (req, res) => {
  try {
    console.log('Fetching tomorrow\'s deliveries from Zoho Books...');
    
    // Get invoices scheduled for tomorrow
    const invoices = await zohoBooks.getTomorrowDeliveries();
    
    if (invoices.length === 0) {
      return res.json({
        success: true,
        message: 'No deliveries scheduled for tomorrow',
        count: 0
      });
    }

    console.log(`Found ${invoices.length} deliveries. Generating labels...`);
    
    // Get detailed data for each invoice
    const detailedDeliveries = await Promise.all(
      invoices.map(inv => zohoBooks.getInvoiceDetails(inv.invoice_id))
    );

    // Filter out any failed fetches
    const validDeliveries = detailedDeliveries.filter(d => d !== null);

    // Generate Excel file
    const tomorrow = addDays(new Date(), 1);
    const filename = `${format(tomorrow, 'yyyy-MM-dd')}.xlsx`;
    const result = await labelGenerator.generateLabels(validDeliveries);

    res.json({
      success: true,
      message: `Generated labels for ${validDeliveries.length} deliveries (tomorrow)`,
      count: validDeliveries.length,
      filename: result.filename,
      downloadUrl: `/download/${result.filename}`
    });

  } catch (error) {
    console.error('Label generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate labels for TODAY (alternative endpoint)
app.get('/api/generate-labels-today', async (req, res) => {
  try {
    console.log('Fetching today\'s deliveries from Zoho Books...');
    
    // Get invoices scheduled for today
    const invoices = await zohoBooks.getTodayDeliveries();
    
    if (invoices.length === 0) {
      return res.json({
        success: true,
        message: 'No deliveries scheduled for today',
        count: 0
      });
    }

    console.log(`Found ${invoices.length} deliveries. Generating labels...`);
    
    // Get detailed data for each invoice
    const detailedDeliveries = await Promise.all(
      invoices.map(inv => zohoBooks.getInvoiceDetails(inv.invoice_id))
    );

    // Filter out any failed fetches
    const validDeliveries = detailedDeliveries.filter(d => d !== null);

    // Generate Excel file using the label generator
    const result = await labelGenerator.generateLabels(validDeliveries);
    
    // Rename the file to indicate it's today (the generator uses tomorrow's date)
    const today = new Date();
    const todayFilename = `${format(today, 'yyyy-MM-dd')}-deliveries.xlsx`;
    const outputDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'output');
    const oldPath = result.filepath;
    const newPath = path.join(outputDir, todayFilename);
    
    // Rename the generated file (only if it has tomorrow's date in the name)
    if (oldPath.includes(format(addDays(new Date(), 1), 'yyyy-MM-dd'))) {
      fs.renameSync(oldPath, newPath);
    }

    res.json({
      success: true,
      message: `Generated labels for ${validDeliveries.length} deliveries (today)`,
      count: validDeliveries.length,
      filename: todayFilename,
      downloadUrl: `/download/${todayFilename}`
    });

  } catch (error) {
    console.error('Label generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
