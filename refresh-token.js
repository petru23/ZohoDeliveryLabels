const axios = require('axios');
require('dotenv').config();

class TokenManager {
  constructor() {
    this.accessToken = process.env.ZOHO_ACCESS_TOKEN;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.accessTokenExpiry = null;
  }

  async refreshAccessToken() {
    try {
      console.log('🔄 Refreshing access token...');
      
      const params = new URLSearchParams();
      params.append('refresh_token', this.refreshToken);
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post('https://accounts.zoho.com.au/oauth/v2/token', params);

      this.accessToken = response.data.access_token;
      this.accessTokenExpiry = Date.now() + response.data.expires_in * 1000;

      console.log('✓ Token refreshed successfully');
      console.log(`✓ New token: ${this.accessToken.substring(0, 30)}...`);
      console.log(`✓ Expires in: ${Math.round(response.data.expires_in / 60)} minutes\n`);

      // Update .env file
      require('fs').writeFileSync('.env', `
ZOHO_ORGANIZATION_ID=${process.env.ZOHO_ORGANIZATION_ID}
ZOHO_ACCESS_TOKEN=${this.accessToken}
ZOHO_CLIENT_ID=${this.clientId}
ZOHO_CLIENT_SECRET=${this.clientSecret}
ZOHO_REFRESH_TOKEN=${this.refreshToken}
PORT=3000
`.trim());

      console.log('✓ Updated .env file with new token');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to refresh token:', error.response?.data || error.message);
      throw error;
    }
  }
}

async function main() {
  const tm = new TokenManager();
  try {
    await tm.refreshAccessToken();
    console.log('\n✓ Ready to use new token');
  } catch (error) {
    process.exit(1);
  }
}

main();
