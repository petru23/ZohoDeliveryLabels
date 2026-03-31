const axios = require('axios');
require('dotenv').config();

const ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID;
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const BASE_URL = 'https://www.zohoapis.com.au/billing/v1';

async function checkRecentInvoices() {
  try {
    console.log('\n📋 Fetching recent invoices...\n');

    // Get all invoices sorted by date
    const response = await axios.get(`${BASE_URL}/invoices`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      params: {
        organization_id: ORGANIZATION_ID,
        sort_column: 'date',
        sort_order: 'D',
        page: 1,
        per_page: 20,
      },
    });

    const invoices = response.data.invoices || [];
    console.log(`Total recent invoices: ${invoices.length}\n`);

    // Display all recent invoices with delivery info
    invoices.slice(0, 10).forEach((inv, idx) => {
      const invDate = inv.date || 'Unknown';
      const deliveryDate = inv.cf_delivery_date || 'Not set';
      const deliveryType = inv.cf_delivery_pick_up || 'Not specified';

      console.log(`${idx + 1}. Invoice #${inv.invoice_number}`);
      console.log(`   Customer: ${inv.customer_name}`);
      console.log(`   Date: ${invDate}`);
      console.log(`   Status: ${inv.status}`);
      console.log(`   Amount: $${inv.total}`);
      console.log(`   📦 Delivery Date: ${deliveryDate}`);
      console.log(`   📦 Type: ${deliveryType}`);
      
      // Show ALL custom fields
      if (Object.keys(inv).some(k => k.startsWith('cf_'))) {
        console.log(`   Custom Fields:`);
        Object.keys(inv).forEach(key => {
          if (key.startsWith('cf_')) {
            console.log(`     ${key}: ${inv[key]}`);
          }
        });
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

checkRecentInvoices();
