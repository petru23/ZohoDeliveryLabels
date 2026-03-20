require('dotenv').config();
const axios = require('axios');

async function debugZoho() {
  console.log('\n🔍 DETAILED ZOHO DEBUG\n');
  
  const orgId = process.env.ZOHO_ORGANIZATION_ID;
  const token = process.env.ZOHO_ACCESS_TOKEN;

  console.log('=== Environment Variables ===');
  console.log('Organization ID:', orgId);
  console.log('Token (first 50 chars):', token.substring(0, 50));
  console.log('Token length:', token.length);
  console.log('');

  console.log('=== Request Details ===');
  console.log('URL: https://www.zohoapis.com.au/billing/v1/invoices');
  console.log('Authorization Header:', `Zoho-oauthtoken ${token.substring(0, 50)}...`);
  console.log('Organization ID param:', orgId);
  console.log('');

  try {
    console.log('Sending request...\n');
    const response = await axios.get('https://www.zohoapis.com.au/billing/v1/invoices', {
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'User-Agent': 'ZohoDeliveryLabels/1.0'
      },
      params: {
        organization_id: orgId,
        per_page: 1
      }
    });

    console.log('✅ SUCCESS!\n');
    console.log('Response Status:', response.status);
    console.log('Total Invoices:', response.data.page_context?.total || 0);
    
  } catch (error) {
    console.log('❌ ERROR\n');
    
    if (error.response) {
      console.log('Status Code:', error.response.status);
      console.log('Status Text:', error.response.statusText);
      console.log('\nFull Response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('No response received:');
      console.log(error.request);
    } else {
      console.log('Error:', error.message);
    }
  }
}

debugZoho();
