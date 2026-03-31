const axios = require('axios');
require('dotenv').config();
const { format, addDays } = require('date-fns');

const ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID;
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const BASE_URL = 'https://www.zohoapis.com.au/billing/v1';

async function checkInvoiceStructure() {
  try {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    
    // Get list of invoices
    const listResponse = await axios.get(`${BASE_URL}/invoices`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      params: {
        organization_id: ORGANIZATION_ID,
        sort_column: 'date',
        sort_order: 'D',
        page: 1,
        per_page: 100,
      },
    });

    const invoices = listResponse.data.invoices || [];

    // Find tomorrow's delivery
    const tomorrowDelivery = invoices.find((inv) => {
      if (!inv.cf_delivery_date && !inv.cf_delivery_date_unformatted) return false;
      
      let deliveryDate = null;
      const dateStr = inv.cf_delivery_date_unformatted || inv.cf_delivery_date;
      
      if (dateStr.includes('-')) {
        deliveryDate = dateStr.split('T')[0];
      } else if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        deliveryDate = `${year}-${month}-${day}`;
      }
      
      return deliveryDate === tomorrow;
    });

    if (!tomorrowDelivery) {
      console.log('❌ No tomorrow delivery found');
      return;
    }

    console.log(`\n📦 Found tomorrow's delivery: ${tomorrowDelivery.invoice_number}`);
    console.log(`   Invoice ID: ${tomorrowDelivery.invoice_id}\n`);

    // Get detailed invoice
    console.log('📋 Getting detailed invoice data...\n');
    const detailResponse = await axios.get(`${BASE_URL}/invoices/${tomorrowDelivery.invoice_id}`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      params: {
        organization_id: ORGANIZATION_ID,
      },
    });

    const invoice = detailResponse.data.invoice;
    
    console.log('Available fields in detail response:');
    const relevantFields = [
      'invoice_number', 'customer_name', 'customer_id',
      'shipping_address', 'billing_address', 'customer',
      'line_items', 'notes', 'customer_notes',
      'phone', 'email'
    ];
    
    relevantFields.forEach(field => {
      if (field in invoice) {
        console.log(`✓ ${field}:`, JSON.stringify(invoice[field], null, 2));
      } else {
        console.log(`✗ ${field}: NOT FOUND`);
      }
    });

    // Check for custom fields with customer/address info
    console.log('\n🔍 Looking for address/phone in custom fields:');
    Object.keys(invoice).forEach(key => {
      if ((key.includes('address') || key.includes('phone') || key.includes('contact')) && !key.startsWith('_')) {
        console.log(`   ${key}:`, invoice[key]);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

checkInvoiceStructure();
