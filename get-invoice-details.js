const axios = require('axios');
require('dotenv').config();

const ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID;
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const BASE_URL = 'https://www.zohoapis.com.au/billing/v1';

async function getInvoiceDetails() {
  try {
    console.log('\n🔍 Fetching invoices and their details...\n');

    // Get invoices to find IDs
    const response = await axios.get(`${BASE_URL}/invoices`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      params: {
        organization_id: ORGANIZATION_ID,
        sort_column: 'customer_name',
        sort_order: 'A',
        page: 1,
        per_page: 20,
      },
    });

    const invoices = response.data.invoices || [];
    console.log(`Found ${invoices.length} invoices in list view\n`);
    
    // Check first 3 invoices for custom fields
    for (let i = 0; i < Math.min(3, invoices.length); i++) {
      const inv = invoices[i];
      console.log(`\n📌 Invoice ${i + 1}: ${inv.invoice_number}`);
      console.log(`   ID: ${inv.invoice_id}`);
      console.log(`   Customer: ${inv.customer_name}`);
      console.log('   Custom Fields in LIST view:');
      
      // Show custom fields from list response
      const customFieldsInList = {};
      Object.keys(inv).forEach(key => {
        if (key.startsWith('cf_')) {
          customFieldsInList[key] = inv[key];
          console.log(`      ${key}: ${inv[key]}`);
        }
      });
      if (Object.keys(customFieldsInList).length === 0) {
        console.log('      (None)');
      }

      try {
        // Get detailed invoice
        const detailResponse = await axios.get(`${BASE_URL}/invoices/${inv.invoice_id}`, {
          headers: {
            'Authorization': `Zoho-oauthtoken ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          params: {
            organization_id: ORGANIZATION_ID,
          },
        });

        const detailInv = detailResponse.data.invoice;
        console.log('   Custom Fields in DETAIL view:');
        
        const customFieldsInDetail = {};
        Object.keys(detailInv).forEach(key => {
          if (key.startsWith('cf_')) {
            customFieldsInDetail[key] = detailInv[key];
            console.log(`      ${key}: ${detailInv[key]}`);
          }
        });
        if (Object.keys(customFieldsInDetail).length === 0) {
          console.log('      (None)');
        }
      } catch (err) {
        console.log(`   ERROR getting detail: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

getInvoiceDetails();
