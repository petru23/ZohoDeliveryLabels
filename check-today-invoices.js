const axios = require('axios');
require('dotenv').config();

const ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID;
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const BASE_URL = 'https://www.zohoapis.com.au/billing/v1';

async function checkTodayInvoices() {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    console.log(`\n📅 Checking invoices created on: ${todayStr}\n`);

    // Query invoices created today
    const response = await axios.get(`${BASE_URL}/invoices`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${ACCESS_TOKEN}`,
        'X-com-zoho-authtoken': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      params: {
        organization_id: ORGANIZATION_ID,
        sort_column: 'created_time',
        sort_order: 'D',
        page: 1,
        per_page: 100,
      },
    });

    const invoices = response.data.invoices || [];
    console.log(`Total invoices in system: ${invoices.length}`);

    if (invoices.length === 0) {
      console.log('No invoices found.');
      return;
    }

    // Filter and display today's invoices
    const todayInvoices = invoices.filter((inv) => {
      let createdDate = null;
      if (inv.created_time && typeof inv.created_time === 'number') {
        createdDate = new Date(inv.created_time * 1000).toISOString().split('T')[0];
      } else if (inv.date) {
        createdDate = inv.date;
      }
      return createdDate === todayStr;
    });

    console.log(`\n✅ Invoices created today: ${todayInvoices.length}\n`);

    if (todayInvoices.length === 0) {
      console.log('No invoices created today.\n');
      return;
    }

    // Display each invoice with delivery info
    todayInvoices.forEach((inv, idx) => {
      const deliveryDate = inv.cf_delivery_date || 'Not set';
      const deliveryType = inv.cf_delivery_pick_up || 'Not specified';
      const deliveryNotes = inv.cf_delivery_notes || 'None';
      const createdTime = inv.created_time && typeof inv.created_time === 'number' 
        ? new Date(inv.created_time * 1000).toLocaleString()
        : 'Unknown';

      console.log(`${idx + 1}. Invoice #${inv.invoice_number}`);
      console.log(`   Customer: ${inv.customer_name}`);
      console.log(`   Status: ${inv.status}`);
      console.log(`   Amount: $${inv.total}`);
      console.log(`   Created: ${createdTime}`);
      console.log(`   📦 Delivery Date: ${deliveryDate}`);
      console.log(`   📦 Type: ${deliveryType}`);
      console.log(`   📝 Notes: ${deliveryNotes}`);
      console.log('');
    });

    // Show delivery summary
    const withDelivery = todayInvoices.filter((inv) => {
      if (!inv.cf_delivery_date) return false;
      try {
        const delivDate = new Date(inv.cf_delivery_date).toISOString().split('T')[0];
        return delivDate === todayStr;
      } catch (e) {
        return false;
      }
    });
    console.log(`\n🚚 Invoices with TODAY's delivery: ${withDelivery.length}`);
    if (withDelivery.length > 0) {
      withDelivery.forEach((inv) => {
        console.log(`   - ${inv.invoice_number}: ${inv.customer_name}`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

checkTodayInvoices();
