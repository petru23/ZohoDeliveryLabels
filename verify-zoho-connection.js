// verify-zoho-connection.js
// Test your Zoho Books API connection before running the full system

require('dotenv').config();
const axios = require('axios');

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

async function verifyZohoConnection() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 ZOHO BOOKS CONNECTION VERIFICATION');
  console.log('='.repeat(60) + '\n');

  // Check environment variables
  console.log('1️⃣  Checking environment variables...');
  
  const orgId = process.env.ZOHO_ORGANIZATION_ID;
  const accessToken = process.env.ZOHO_ACCESS_TOKEN;

  if (!orgId) {
    console.log(`${COLORS.red}✗ ZOHO_ORGANIZATION_ID not found in .env${COLORS.reset}`);
    console.log(`  → Add your Organization ID to .env file\n`);
    process.exit(1);
  }

  if (!accessToken) {
    console.log(`${COLORS.red}✗ ZOHO_ACCESS_TOKEN not found in .env${COLORS.reset}`);
    console.log(`  → Add your Access Token to .env file\n`);
    process.exit(1);
  }

  console.log(`${COLORS.green}✓ Environment variables configured${COLORS.reset}`);
  console.log(`  Organization ID: ${orgId.substring(0, 8)}...`);
  console.log(`  Access Token: ${accessToken.substring(0, 20)}...\n`);

  // Test API connection
  console.log('2️⃣  Testing Zoho Books API connection...');

  try {
    const response = await axios.get('https://www.zohoapis.com.au/billing/v1/invoices', {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        organization_id: orgId,
        per_page: 1
      }
    });

    console.log(`${COLORS.green}✓ Successfully connected to Zoho Books API${COLORS.reset}\n`);

    // Show invoice count
    const totalInvoices = response.data.page_context?.total || 0;
    console.log(`📊 Total invoices in system: ${totalInvoices}`);

  } catch (error) {
    console.log(`${COLORS.red}✗ Failed to connect to Zoho Books${COLORS.reset}`);
    
    if (error.response?.status === 401) {
      console.log(`\n${COLORS.yellow}Issue: Invalid or expired access token${COLORS.reset}`);
      console.log(`\nTo fix:`);
      console.log(`1. Go to https://api-console.zoho.com/`);
      console.log(`2. Select your client (or create Self Client)`);
      console.log(`3. Click "Generate Token" with scope: ZohoBooks.fullaccess.all`);
      console.log(`4. Copy the new access token to .env file\n`);
    } else {
      console.log(`\nError details:`, error.response?.data || error.message);
    }
    
    process.exit(1);
  }

  // Check for custom field
  console.log('\n3️⃣  Checking for delivery_date custom field...');

  try {
    // Get one invoice to check field structure
    const response = await axios.get('https://www.zohoapis.com.au/billing/v1/invoices', {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        organization_id: orgId,
        per_page: 1
      }
    });

    const invoice = response.data.invoices?.[0];
    
    if (!invoice) {
      console.log(`${COLORS.yellow}⚠ No invoices found - create a test invoice first${COLORS.reset}\n`);
    } else {
      // Check if custom fields exist
      const customFields = invoice.custom_fields || [];
      const deliveryDateField = customFields.find(f => 
        f.label?.toLowerCase().includes('delivery') && 
        f.label?.toLowerCase().includes('date')
      );
      const notesField = customFields.find(f => 
        f.label?.toLowerCase().includes('delivery') && 
        f.label?.toLowerCase().includes('note')
      );

      if (deliveryDateField) {
        console.log(`${COLORS.green}✓ Found delivery date custom field${COLORS.reset}`);
        console.log(`  Field name: ${deliveryDateField.label}`);
        console.log(`  Field ID: ${deliveryDateField.customfield_id}\n`);
      } else {
        console.log(`${COLORS.yellow}⚠ No delivery date custom field found${COLORS.reset}`);
        console.log(`\nTo add custom field:`);
        console.log(`1. Zoho Books → Settings → Invoices → Custom Fields`);
        console.log(`2. Add field: "Delivery Date" (Type: Date)`);
        console.log(`3. Make it visible on invoices\n`);
      }

      if (notesField) {
        console.log(`${COLORS.green}✓ Found delivery notes custom field${COLORS.reset}`);
        console.log(`  Field name: ${notesField.label}`);
        console.log(`  Field ID: ${notesField.customfield_id}\n`);
      } else {
        console.log(`${COLORS.yellow}⚠ No delivery notes custom field found${COLORS.reset}`);
        console.log(`\nRecommended: Add "Delivery Notes" field (Type: Multi-line text)`);
        console.log(`This allows warehouse staff to add special instructions\n`);
      }

      // Check for line items
      const hasLineItems = invoice.line_items && invoice.line_items.length > 0;
      if (hasLineItems) {
        console.log(`${COLORS.green}✓ Invoice has line items${COLORS.reset}`);
        console.log(`  Sample item: ${invoice.line_items[0].name} (Qty: ${invoice.line_items[0].quantity})\n`);
      } else {
        console.log(`${COLORS.yellow}⚠ Invoice has no line items${COLORS.reset}`);
        console.log(`  Make sure invoices include products as line items for label generation\n`);
      }

      // Check for shipping address
      const hasShippingAddress = invoice.shipping_address && invoice.shipping_address.street;
      if (hasShippingAddress) {
        console.log(`${COLORS.green}✓ Shipping address found${COLORS.reset}`);
        console.log(`  ${invoice.shipping_address.street}, ${invoice.shipping_address.city}\n`);
      } else {
        console.log(`${COLORS.yellow}⚠ No shipping address - using billing address${COLORS.reset}`);
        console.log(`  For deliveries, fill the "Shipping Address" on customer records\n`);
      }

      // Check for phone
      const phone = invoice.shipping_address?.phone || invoice.billing_address?.phone;
      if (phone) {
        console.log(`${COLORS.green}✓ Phone number found: ${phone}${COLORS.reset}\n`);
      } else {
        console.log(`${COLORS.yellow}⚠ No phone number found${COLORS.reset}`);
        console.log(`  Add phone to shipping address for delivery contact\n`);
      }
    }

  } catch (error) {
    console.log(`${COLORS.yellow}⚠ Could not verify custom field${COLORS.reset}`);
    console.log(`  (This is normal if you have no invoices yet)\n`);
  }

  // Final summary
  console.log('='.repeat(60));
  console.log(`${COLORS.green}✓ CONNECTION SUCCESSFUL${COLORS.reset}`);
  console.log('='.repeat(60));
  console.log('\n📋 NEXT STEPS:\n');
  console.log('1. Add "Delivery Date" custom field to invoices (if not done)');
  console.log('2. Create test invoices with delivery_date = tomorrow');
  console.log('3. Run: npm start');
  console.log('4. Open: http://localhost:3000');
  console.log('5. Click "Generate Labels"\n');
}

// Run verification
verifyZohoConnection().catch(error => {
  console.error(`\n${COLORS.red}Unexpected error:${COLORS.reset}`, error.message);
  process.exit(1);
});
