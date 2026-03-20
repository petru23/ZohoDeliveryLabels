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
    try {
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      
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

      // Filter client-side for tomorrow's deliveries
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

        if (deliveryDate !== tomorrow) {
          return false;
        }

        // Filter to include ONLY deliveries (exclude pickups)
        const deliveryType = (invoice.cf_delivery_pick_up || '').toLowerCase();
        const isDelivery = deliveryType.includes('delivery') || deliveryType === 'd';
        
        return isDelivery;
      });

      console.log(`✓ Found ${deliveries.length} deliveries for tomorrow (${tomorrow})`);
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
    // Label size: 99.1mm x 38.1mm
    this.labelsPerRow = 2;
    this.labelsPerColumn = 7;
    this.labelsPerPage = 14;
    
    // Excel column widths (approximate conversion from mm to Excel units)
    this.labelWidthUnits = 38; // ~99.1mm
    this.labelHeightPoints = 108; // ~38.1mm in points (1mm ≈ 2.83pt)
  }

  async generateLabels(deliveries) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Delivery Labels', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        margins: {
          left: 0.19, // ~5mm
          right: 0.19,
          top: 0.5, // ~13mm
          bottom: 0.5,
          header: 0,
          footer: 0
        }
      }
    });

    // Set column widths (2 columns for labels)
    worksheet.getColumn(1).width = this.labelWidthUnits;
    worksheet.getColumn(2).width = this.labelWidthUnits;

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
        currentRow += 6; // Each label takes ~6 rows of space
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
    
    // Address: Try shipping first, then billing full address
    let street = delivery.shipping_address?.street || delivery.billing_address?.street || '';
    let city = delivery.shipping_address?.city || delivery.billing_address?.city || '';
    let state = delivery.shipping_address?.state || delivery.billing_address?.state || '';
    let zip = delivery.shipping_address?.zip || delivery.billing_address?.zip || '';
    
    // If no structured address, use the "attention" field (single line address)
    if (!street && !city && delivery.billing_address?.attention) {
      const attention = delivery.billing_address.attention;
      // Try to split attention field: "number street, suburb/state"
      street = attention;
    }
    
    // Phone: Try multiple sources
    let phone = delivery.shipping_address?.phone || 
                delivery.billing_address?.phone || 
                (delivery.contactpersons?.[0]?.mobile) ||
                (delivery.contactpersons?.[0]?.phone) ||
                (delivery.contact_persons_associated?.[0]?.mobile) ||
                '';
    
    // Extract items to deliver from invoice_items (not line_items)
    const invoiceItems = delivery.invoice_items || [];
    const itemsList = invoiceItems
      .map(item => {
        const desc = item.description || item.name || 'Item';
        const qty = item.quantity || 1;
        return `• ${desc.split('\n')[0]} (Qty: ${qty})`;
      })
      .join('\n');
    
    // Extract notes
    const notes = delivery.notes || delivery.custom_field_delivery_notes || '';

    // Merge cells for label area
    const endRow = startRow + 7;
    const cell = worksheet.getCell(startRow, startCol);
    worksheet.mergeCells(startRow, startCol, endRow, startCol);

    // Build label content
    const labelContent = [];
    
    // Customer name (bold, larger)
    labelContent.push({ 
      text: customerName + '\n', 
      font: { bold: true, size: 11, name: 'Arial' } 
    });
    
    // Address
    if (street || city || state || zip) {
      if (street) {
        labelContent.push({ 
          text: street + '\n', 
          font: { size: 9, name: 'Arial' } 
        });
      }
      if (city || state || zip) {
        labelContent.push({ 
          text: `${city}${city && state ? ', ' : ''}${state}${(city || state) && zip ? ' ' : ''}${zip}\n`, 
          font: { size: 9, name: 'Arial' } 
        });
      }
    }
    
    // Phone  
    if (phone.trim()) {
      labelContent.push({ 
        text: `Phone: ${phone}\n`, 
        font: { size: 9, name: 'Arial' } 
      });
    }
    
    // Items to deliver
    if (itemsList.trim()) {
      labelContent.push({ 
        text: '\nItems:\n', 
        font: { size: 9, name: 'Arial', bold: true } 
      });
      labelContent.push({ 
        text: itemsList + '\n', 
        font: { size: 8, name: 'Arial' } 
      });
    }
    
    // Notes
    if (notes.trim()) {
      labelContent.push({ 
        text: '\n📝 Notes: ', 
        font: { size: 8, name: 'Arial', bold: true } 
      });
      labelContent.push({ 
        text: notes, 
        font: { size: 8, name: 'Arial', italic: true } 
      });
    }

    cell.value = { richText: labelContent };
    
    // Styling
    cell.alignment = {
      vertical: 'top',
      horizontal: 'left',
      wrapText: true
    };

    // Border
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    worksheet.getRow(startRow).height = this.labelHeightPoints;
  }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

const zohoBooks = new ZohoBooksAPI();
const labelGenerator = new DeliveryLabelGenerator();

// Generate labels endpoint
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
    
    // Get detailed data for each invoice (includes custom fields)
    const detailedDeliveries = await Promise.all(
      invoices.map(inv => zohoBooks.getInvoiceDetails(inv.invoice_id))
    );

    // Filter out any failed fetches
    const validDeliveries = detailedDeliveries.filter(d => d !== null);

    // Generate Excel file
    const result = await labelGenerator.generateLabels(validDeliveries);

    res.json({
      success: true,
      message: `Generated labels for ${validDeliveries.length} deliveries`,
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
