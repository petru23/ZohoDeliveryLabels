require('dotenv').config();
const axios = require('axios');

async function testTokenRefresh() {
  console.log('\n🔍 TESTING TOKEN REFRESH MECHANISM\n');

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const orgId = process.env.ZOHO_ORGANIZATION_ID;

  console.log('=== Environment Check ===');
  console.log('Client ID:', clientId ? `${clientId.substring(0, 20)}...` : '❌ MISSING');
  console.log('Client Secret:', clientSecret ? `${clientSecret.substring(0, 20)}...` : '❌ MISSING');
  console.log('Refresh Token:', refreshToken ? `${refreshToken.substring(0, 20)}...` : '❌ MISSING');
  console.log('Organization ID:', orgId);
  console.log('');

  if (!refreshToken) {
    console.log('❌ REFRESH TOKEN NOT SET\n');
    console.log('To set it:');
    console.log('1. Go to API Console: https://api-console.zoho.com.au/');
    console.log('2. Generate a token with:');
    console.log('   - Scope: ZohoSubscriptions.fullaccess.all');
    console.log('   - Access Type: OFFLINE (important!)');
    console.log('3. You\'ll get: code + refresh_token');
    console.log('4. Add to .env: ZOHO_REFRESH_TOKEN=...');
    return;
  }

  try {
    console.log('🔄 Attempting to refresh access token...\n');

    const params = new URLSearchParams();
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');

    const response = await axios.post('https://accounts.zoho.com.au/oauth/v2/token', params);

    console.log('✅ SUCCESS! New access token generated\n');
    console.log('Response:');
    console.log('  Access Token:', response.data.access_token.substring(0, 30) + '...');
    console.log('  Expires In:', response.data.expires_in, 'seconds');
    console.log('  Token Type:', response.data.token_type);
    console.log('\n✓ Token refresh mechanism is working correctly!');
    console.log('\n📝 To use this new token:');
    console.log('   Update ZOHO_ACCESS_TOKEN in .env with the new access token');
    console.log('   Then restart the app');

  } catch (error) {
    console.log('❌ TOKEN REFRESH FAILED\n');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if refresh token is valid (try generating new one)');
    console.log('2. Verify Client ID and Client Secret are correct');
    console.log('3. Check if refresh token has expired (regenerate if needed)');
  }
}

testTokenRefresh();
