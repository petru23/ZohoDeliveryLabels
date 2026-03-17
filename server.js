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
// ZOHO BOOKS API CLIENT
// ============================================================================

class ZohoBooksAPI {
  constructor() {
    this.organizationId = process.env.ZOHO_ORGANIZATION_ID;
    this.accessToken = process.env.ZOHO_ACCESS_TOKEN;
    this.baseUrl = 'https://www.zohoapis.com/books/v3';
  }

  // Get all invoices for tomorrow's delivery
  async getTomorrowDeliveries() {
    try {
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      
      // Zoho Books API call - adjust field names to match YOUR custom fields
      const response = await axios.get(`${this.baseUrl}/invoices`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.accessToken}`
        },
        params: {
          organization_id: this.organizationId,
          // Filter by custom field "delivery_date" = tomorrow
          // Adjust this filter based on your Zoho Books setup
          cf_delivery_date: tomorrow,
          status: 'sent', // or 'unpaid' - depends on your workflow
          sort_column: 'customer_name',
          sort_order: 'A'
        }
      });

      return response.data.invoices || [];
    } catch (error) {
      console.error('Zoho API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch invoices from Zoho Books');
    }
  }

  // Get detailed invoice data (including custom fields)
  async getInvoiceDetails(invoiceId) {
    try {
      const response = await axios.get(`${this.baseUrl}/invoices/${invoiceId}`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.accessToken}`
        },
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
    // Extract address components
    const customerName = delivery.customer_name || 'CUSTOMER NAME MISSING';
    const street = delivery.shipping_address?.street || delivery.billing_address?.street || '';
    const city = delivery.shipping_address?.city || delivery.billing_address?.city || '';
    const state = delivery.shipping_address?.state || delivery.billing_address?.state || '';
    const zip = delivery.shipping_address?.zip || delivery.billing_address?.zip || '';
    const phone = delivery.shipping_address?.phone || delivery.customer?.phone || '';
    
    // Extract items to deliver
    const lineItems = delivery.line_items || [];
    const itemsList = lineItems
      .map(item => `• ${item.name} (Qty: ${item.quantity})`)
      .join('\n');
    
    // Extract notes (could be in multiple fields depending on your Zoho setup)
    const notes = delivery.notes || 
                  delivery.custom_field_delivery_notes || 
                  delivery.customer_notes || 
                  '';

    // Merge cells for label area (increased to 8 rows to fit items + notes)
    const endRow = startRow + 7;
    const cell = worksheet.getCell(startRow, startCol);
    worksheet.mergeCells(startRow, startCol, endRow, startCol);

    // Build label with rich text formatting
    const labelContent = [];
    
    // Customer name (bold, larger)
    labelContent.push({ 
      text: customerName + '\n', 
      font: { bold: true, size: 11, name: 'Arial' } 
    });
    
    // Address
    labelContent.push({ 
      text: street + '\n', 
      font: { size: 10, name: 'Arial' } 
    });
    labelContent.push({ 
      text: `${city}, ${state} ${zip}\n`, 
      font: { size: 10, name: 'Arial' } 
    });
    
    // Phone
    labelContent.push({ 
      text: `Phone: ${phone}\n\n`, 
      font: { size: 9, name: 'Arial' } 
    });
    
    // Items to deliver (if any)
    if (itemsList) {
      labelContent.push({ 
        text: 'Items:\n', 
        font: { size: 9, name: 'Arial', bold: true } 
      });
      labelContent.push({ 
        text: itemsList + '\n', 
        font: { size: 8, name: 'Arial' } 
      });
    }
    
    // Notes (if any)
    if (notes) {
      labelContent.push({ 
        text: '\nNotes: ', 
        font: { size: 9, name: 'Arial', bold: true } 
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

    // Border around label (optional - comment out if you don't want borders)
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    // Set row height (increased for more content)
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
