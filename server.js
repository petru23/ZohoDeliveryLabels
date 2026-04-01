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
      
      const params = new URLSearchParams();
      params.append('refresh_token', this.refreshToken);
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post(this.authBaseUrl, params);

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
      // Check if address is missing from invoice
      const hasShippingAddress = delivery.shipping_address?.street || delivery.shipping_address?.city;
      const hasBillingAddress = delivery.billing_address?.street || delivery.billing_address?.city;
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
    
    // Address extraction with fallback chain:
    // 1. Invoice shipping address
    // 2. Invoice billing address  
    // 3. Customer shipping address (from enrichment)
    // 4. Customer billing address (from enrichment)
    // 5. Attention field
    let address = '';
    
    // First try invoice shipping address
    if (delivery.shipping_address) {
      let parts = [];
      if (delivery.shipping_address.street) parts.push(delivery.shipping_address.street);
      if (delivery.shipping_address.street2) parts.push(delivery.shipping_address.street2);
      if (delivery.shipping_address.city) parts.push(delivery.shipping_address.city);
      if (delivery.shipping_address.state) parts.push(delivery.shipping_address.state);
      if (parts.length > 0) {
        address = parts.join(', ');
      }
    }
    
    // Fall back to invoice billing address
    if (!address && delivery.billing_address) {
      let parts = [];
      if (delivery.billing_address.street) parts.push(delivery.billing_address.street);
      if (delivery.billing_address.street2) parts.push(delivery.billing_address.street2);
      if (delivery.billing_address.city) parts.push(delivery.billing_address.city);
      if (delivery.billing_address.state) parts.push(delivery.billing_address.state);
      if (parts.length > 0) {
        address = parts.join(', ');
      }
    }
    
    // Fall back to customer shipping address (from customer record)
    if (!address && delivery.customer_shipping_address) {
      let parts = [];
      if (delivery.customer_shipping_address.street) parts.push(delivery.customer_shipping_address.street);
      if (delivery.customer_shipping_address.street2) parts.push(delivery.customer_shipping_address.street2);
      if (delivery.customer_shipping_address.city) parts.push(delivery.customer_shipping_address.city);
      if (delivery.customer_shipping_address.state) parts.push(delivery.customer_shipping_address.state);
      if (parts.length > 0) {
        address = parts.join(', ');
      }
    }
    
    // Fall back to customer billing address (from customer record)
    if (!address && delivery.customer_billing_address) {
      let parts = [];
      if (delivery.customer_billing_address.street) parts.push(delivery.customer_billing_address.street);
      if (delivery.customer_billing_address.street2) parts.push(delivery.customer_billing_address.street2);
      if (delivery.customer_billing_address.city) parts.push(delivery.customer_billing_address.city);
      if (delivery.customer_billing_address.state) parts.push(delivery.customer_billing_address.state);
      if (parts.length > 0) {
        address = parts.join(', ');
      }
    }
    
    // Try attention field as last resort
    if (!address && delivery.billing_address?.attention) {
      address = delivery.billing_address.attention;
    }
    
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
    
    // Now extract product details and services from invoice_items (filter out fees and condition notes)
    const invoiceItems = delivery.invoice_items || [];
    const feeKeywords = ['card fee', 'shopify fee', 'payment fee', 'transaction fee'];
    const isAFee = (itemName) => feeKeywords.some(fee => itemName.toLowerCase().includes(fee));
    
    // Keywords to exclude from product description (condition notes, damage notes, warranty, thank you messages, etc)
    const excludeKeywords = ['factory second', 'second hand', 'carton damaged', 'damaged', 'scratched', 'dented', 'warranty', 'shopify', 'thanks again for choosing us', 'hope you enjoy', 'thank you for choosing'];
    const shouldExcludeLine = (line) => excludeKeywords.some(keyword => line.toLowerCase().includes(keyword));
    
    // Get all products (not just first one) - show full product descriptions
    let products = [];
    let services = [];
    
    for (const item of invoiceItems) {
      // Get full description (all lines, not just first line)
      const fullDescription = (item.description || item.name || 'Item').trim();
      const itemName = fullDescription.split('\n')[0]; // First line for checking type
      
      if (isAFee(itemName)) {
        continue; // Skip fees
      }
      
      // Check if it's a service (installation/install/instal or removal/remove)
      const isService = /instal|remov/i.test(itemName);
      
      if (isService) {
        services.push(itemName.trim());
      } else {
        // Filter out lines with excluded keywords AND service keywords
        const productLines = fullDescription.split('\n')
          .map(line => line.trim())
          .filter(line => {
            if (line.length === 0) return false;
            if (shouldExcludeLine(line)) return false; // Exclude warranty, damaged, etc
            if (/instal|remov/i.test(line)) return false; // Exclude service lines
            return true;
          });
        
        if (productLines.length > 0) {
          products.push(productLines.join('\n')); // Show remaining product lines only
        }
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
    
    // All products (size 8) - show each on separate line
    if (products.length > 0) {
      labelContent.push({ 
        text: (phone.trim() ? '\n' : '') + products.join('\n'), 
        font: { size: 8, name: 'Arial' } 
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

    // Enrich with customer data if address/phone is missing
    const enrichedDeliveries = await zohoBooks.enrichDeliveriesWithCustomerData(validDeliveries);

    // Generate Excel file
    const tomorrow = addDays(new Date(), 1);
    const filename = `${format(tomorrow, 'yyyy-MM-dd')}.xlsx`;
    const result = await labelGenerator.generateLabels(enrichedDeliveries);

    res.json({
      success: true,
      message: `Generated labels for ${enrichedDeliveries.length} deliveries (tomorrow)`,
      count: enrichedDeliveries.length,
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

    // Enrich with customer data if address/phone is missing
    const enrichedDeliveries = await zohoBooks.enrichDeliveriesWithCustomerData(validDeliveries);

    // Generate Excel file using the label generator
    const result = await labelGenerator.generateLabels(enrichedDeliveries);
    
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
    const saleDate = format(new Date(), 'dd/MM/yyyy');
    
    // Get custom fields
    const customFields = invoice.custom_fields || [];
    const getCustomField = (label) => {
      const field = customFields.find(f => 
        f.label?.toLowerCase().includes(label.toLowerCase())
      );
      return field?.value || '';
    };
    
    const removalRequired = getCustomField('removal');
    const comboUnit = getCustomField('combo');
    const stairsAccess = getCustomField('stairs');
    const onlineOrder = getCustomField('online') || getCustomField('shopify') || '';
    
    // Check if product is fridge/freezer
    const lineItems = invoice.line_items || [];
    const isFridge = lineItems.some(item => {
      const name = (item.name || '').toLowerCase();
      return name.includes('fridge') || 
             name.includes('freezer') || 
             name.includes('refrigerator');
    });
    
    // Generate HTML page (print-ready)
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SOLD Tag - ${invoice.invoice_number}</title>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A5 landscape;
            margin: 10mm;
          }
          
          * {
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #f5f5f5;
          }
          
          .tag {
            border: 3px solid black;
            padding: 20px 30px;
            width: 100%;
            max-width: 500px;
            background: white;
            page-break-after: always;
          }
          
          .take-photo {
            font-size: 11pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 20px;
          }
          
          h1 {
            text-align: center;
            font-size: 60pt;
            margin: 10px 0 30px 0;
            font-weight: bold;
            letter-spacing: 8px;
          }
          
          .field {
            font-size: 18pt;
            font-weight: bold;
            margin: 12px 0;
            display: flex;
            align-items: baseline;
          }
          
          .field-label {
            min-width: 180px;
          }
          
          .field-line {
            flex: 1;
            border-bottom: 2px solid #000;
            margin-left: 10px;
            height: 20px;
            position: relative;
          }
          
          .field-value {
            position: absolute;
            left: 5px;
            top: -5px;
            font-weight: normal;
            font-size: 16pt;
          }
          
          .warning {
            margin-top: 25px;
            padding: 15px;
            border: 2px solid #000;
            font-size: 13pt;
            line-height: 1.6;
            text-align: left;
          }
          
          .warning-title {
            font-weight: bold;
            font-size: 14pt;
            margin-bottom: 10px;
          }
          
          .highlight {
            font-weight: bold;
            text-decoration: underline;
          }
          
          @media print {
            body {
              margin: 0;
              padding: 0;
              background: white;
            }
            
            .no-print {
              display: none;
            }
            
            .tag {
              border: 3px solid black;
              max-width: none;
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
        
        <div class="tag">
          <div class="take-photo">Take Photo</div>
          <div class="take-photo">Take Photo</div>
          
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
              <div class="field-value">${saleDate}</div>
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
          
          ${isFridge ? `
          <div class="warning">
            <div>Please <span class="highlight">Leave Switched Off For 3-4 Hours After Transportation.</span></div>
            <div style="margin-top: 10px;">Please Use <span class="highlight">Surge Protection</span> And <span class="highlight">Allow Up To 24 Hours</span> To Reach Optimum Chilling Temperature Before Putting Food Inside.</div>
          </div>
          ` : ''}
        </div>
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
