const axios = require('axios');
require('dotenv').config();

const ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID;
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const BASE_URL = 'https://www.zohoapis.com.au/billing/v1';

async function checkDeliverySchedule() {
  try {
    // Get today's date in local timezone (AEST)
    const today = new Date();
    // Format as YYYY-MM-DD in local timezone (not UTC)
    const todayStr = today.getFullYear() + '-' + 
                     String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(today.getDate()).padStart(2, '0');
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.getFullYear() + '-' + 
                        String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(tomorrow.getDate()).padStart(2, '0');

    console.log(`\n📅 Delivery Schedule Report`);
    console.log(`   Today: ${todayStr}`);
    console.log(`   Tomorrow: ${tomorrowStr}\n`);

    // Get all invoices
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

    // Check for today's deliveries
    const todayDeliveries = invoices.filter((inv) => {
      if (!inv.cf_delivery_date) return false;
      try {
        const newDate = new Date(inv.cf_delivery_date);
        const delivDate = newDate.toISOString().split('T')[0];
        return delivDate === todayStr;
      } catch (e) {
        return false;
      }
    });

    // Check for tomorrow's deliveries
    const tomorrowDeliveries = invoices.filter((inv) => {
      if (!inv.cf_delivery_date) return false;
      try {
        const delivDate = new Date(inv.cf_delivery_date).toISOString().split('T')[0];
        return delivDate === tomorrowStr;
      } catch (e) {
        return false;
      }
    });

    console.log(`📊 SUMMARY:`);
    console.log(`   Total invoices in system: ${invoices.length}`);
    console.log(`   Invoices created today: 0`);
    console.log(`   Deliveries scheduled for today: ${todayDeliveries.length}`);
    console.log(`   Deliveries scheduled for tomorrow: ${tomorrowDeliveries.length}\n`);

    if (todayDeliveries.length > 0) {
      console.log(`\n🚚 TODAY'S DELIVERIES (${todayStr}):`);
      todayDeliveries.forEach((inv) => {
        console.log(`   • Invoice #${inv.invoice_number}`);
        console.log(`     Customer: ${inv.customer_name}`);
        console.log(`     Type: ${inv.cf_delivery_pick_up || 'Not specified'}`);
        console.log(`     Notes: ${inv.cf_delivery_notes || 'None'}`);
      });
    } else {
      console.log(`✓ No deliveries scheduled for today`);
    }

    if (tomorrowDeliveries.length > 0) {
      console.log(`\n🚚 TOMORROW'S DELIVERIES (${tomorrowStr}):`);
      tomorrowDeliveries.forEach((inv) => {
        console.log(`   • Invoice #${inv.invoice_number}`);
        console.log(`     Customer: ${inv.customer_name}`);
        console.log(`     Type: ${inv.cf_delivery_pick_up || 'Not specified'}`);
        console.log(`     Notes: ${inv.cf_delivery_notes || 'None'}`);
      });
    } else {
      console.log(`✓ No deliveries scheduled for tomorrow`);
    }

    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

checkDeliverySchedule();
