const axios = require('axios');
require('dotenv').config();
const { format, addDays } = require('date-fns');

const ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID;
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const BASE_URL = 'https://www.zohoapis.com.au/billing/v1';

async function checkTodayAndTomorrow() {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    
    console.log(`\n📅 Delivery Schedule Report`);
    console.log(`   Today: ${today}`);
    console.log(`   Tomorrow: ${tomorrow}\n`);

    // Get all invoices
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
        per_page: 100,
      },
    });

    const invoices = response.data.invoices || [];

    // Check for today's deliveries
    const todayDeliveries = invoices.filter((inv) => {
      if (!inv.cf_delivery_date && !inv.cf_delivery_date_unformatted) return false;
      
      let deliveryDate = null;
      const dateStr = inv.cf_delivery_date_unformatted || inv.cf_delivery_date;
      
      if (dateStr.includes('-')) {
        deliveryDate = dateStr.split('T')[0];
      } else if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        deliveryDate = `${year}-${month}-${day}`;
      }
      
      return deliveryDate === today;
    });

    // Check for tomorrow's deliveries
    const tomorrowDeliveries = invoices.filter((inv) => {
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

    console.log(`📊 DELIVERIES FOR TODAY (${today}):`);
    console.log(`   Total: ${todayDeliveries.length}`);
    if (todayDeliveries.length > 0) {
      console.log('   Deliveries:');
      todayDeliveries.forEach((inv, idx) => {
        const type = (inv.cf_delivery_pick_up || '').toLowerCase().includes('delivery') ? '🚚 Delivery' : '📦 Pickup';
        console.log(`     ${idx + 1}. ${inv.invoice_number} - ${inv.customer_name} - $${inv.total} - ${type}`);
      });
    }
    
    console.log(`\n📊 DELIVERIES FOR TOMORROW (${tomorrow}):`);
    console.log(`   Total: ${tomorrowDeliveries.length}`);
    if (tomorrowDeliveries.length > 0) {
      console.log('   Deliveries:');
      tomorrowDeliveries.forEach((inv, idx) => {
        const type = (inv.cf_delivery_pick_up || '').toLowerCase().includes('delivery') ? '🚚 Delivery' : '📦 Pickup';
        console.log(`     ${idx + 1}. ${inv.invoice_number} - ${inv.customer_name} - $${inv.total} - ${type}`);
      });
      console.log(`\n   📥 Excel file: curl -o labels.xlsx http://localhost:3000/download/${tomorrow}.xlsx`);
    }

    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

checkTodayAndTomorrow();
