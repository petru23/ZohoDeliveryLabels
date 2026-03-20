# Zoho Token Refresh Setup Guide

## Overview

Zoho access tokens expire after 1 hour. This application automatically refreshes the access token every 50 minutes to prevent service interruptions.

**Important:** This requires setting up a **Refresh Token** which is permanent and can be used to generate new access tokens indefinitely.

See: [Zoho OAuth Documentation](https://www.zoho.com/billing/api/v1/oauth/)

---

## 🔑 Step 1: Generate Your Initial Refresh Token

The refresh token is a one-time setup. You'll exchange your current access token for a refresh token, then the app uses that refresh token to keep generating new access tokens automatically.

### For Server-based Applications:

1. **Go to API Console:**
   - https://api-console.zoho.com.au/ (for Australia)

2. **Select or Create Your Client:**
   - Click on "Delivery Label Generator" (your server-based application)

3. **Generate Authorization Code:**
   - Navigate to the **"Authorization"** tab
   - Click **"Generate Token"**
   - **Scope:** `ZohoSubscriptions.fullaccess.all`
   - **Access Type:** **OFFLINE** ← ⚠️ IMPORTANT! (This gives you a refresh token)
   - **Duration:** 10 minutes
   - Click **Generate**

4. **Note the Authorization Code:**
   - Copy the `code` value displayed

### Alternative (Recommended for Production):

If you have access to the API Console's token generation:
1. Use OAuth 2.0 flow with `access_type=offline`
2. This will give you both `access_token` AND `refresh_token` in the response

---

## 🔄 Step 2: Exchange Code for Refresh Token

Run this command to exchange your token code for a refresh token:

```bash
curl -X POST https://accounts.zoho.com.au/oauth/v2/token \
  -d 'code=YOUR_CODE_HERE' \
  -d 'client_id=1000.143QGWJQGB5IBLGW09IOPHCNKP8M1C' \
  -d 'client_secret=83657c873156779709a4ff7fde507fc49b3180e12e' \
  -d 'redirect_uri=https://zoho-delivery-labels.vercel.app' \
  -d 'grant_type=authorization_code'
```

**Response:**
```json
{
  "access_token": "1000.0bdda614785d94220...",
  "refresh_token": "1000.8ecdxxxxxxxxxxxxxxxxxxxxxxxx5cb7.463xxxxxxxxxxxxxxxxxxxxxxxxebdc",
  "expires_in": 3600,
  "api_domain": "https://www.zohoapis.com.au",
  "token_type": "Bearer",
  "scope": "ZohoSubscriptions.fullaccess.all"
}
```

---

## 🛠️  Step 3: Update Your `.env` File

Add the refresh token to your `.env` file:

```env
# Zoho Books API Credentials
ZOHO_ORGANIZATION_ID=7005314310
ZOHO_ACCESS_TOKEN=1000.0bdda614785d94220cca670c59fc7118.c7ae19c10ceb

# Client credentials for token refresh
ZOHO_CLIENT_ID=1000.143QGWJQGB5IBLGW09IOPHCNKP8M1C
ZOHO_CLIENT_SECRET=83657c873156779709a4ff7fde507fc49b3180e12e

# **CRITICAL:** Refresh token (permanent, never expires)
ZOHO_REFRESH_TOKEN=1000.8ecdxxxxxxxxxxxxxxxxxxxxxxxx5cb7.463xxxxxxxxxxxxxxxxxxxxxxxxebdc

PORT=3000
```

**⚠️ NEVER commit `.env` file to Git** - it contains secrets!

---

## ⏰ How Automatic Refresh Works

Once configured, the app automatically:

1. **On startup:** Loads the refresh token from `.env`
2. **Every 50 minutes:** Makes a POST request to Zoho to get a new access token
3. **Silently updates:** Replaces the old access token with the new one
4. **Continues working:** All API calls use the latest valid token

```
Timeline:
├─ 00:00 - Startup (load access token + refresh token)
├─ 50:00 - Auto-refresh triggered
│         └─ Gets new access token (valid for 1 hour)
├─ 100:00 - Auto-refresh triggered again
│          └─ Gets another new access token
└─ ... (continues indefinitely)
```

---

## 🚀 Step 4: Test Locally

```bash
npm run dev
```

Watch for this message:
```
✓ Token auto-refresh scheduled (every 50 minutes)
```

---

## 📦 Vercel Deployment

When deploying to Vercel:

1. **Add environment variables in Vercel Dashboard:**
   - Settings → Environment Variables
   - Add ALL of these:
     ```
     ZOHO_ORGANIZATION_ID=7005314310
     ZOHO_ACCESS_TOKEN=1000.0bdda614785d94220...
     ZOHO_CLIENT_ID=1000.143QGWJQGB5IBLGW09...
     ZOHO_CLIENT_SECRET=83657c873156779709...
     ZOHO_REFRESH_TOKEN=1000.8ecdxxxxxxxx...
     PORT=3000
     ```

2. **Redeploy the application**
   - Vercel uses the new environment variables
   - Token refresh continues automatically

**Note:** Vercel's serverless functions are ephemeral. The token refresh interval still works because:
- Each function execution has its own process
- The `setInterval` begins when the server starts
- The token is refreshed and stored in memory for the duration of that function instance

---

## 🔍 Debugging Token Issues

### Check if refresh token is loaded:
```bash
npm run verify
```

### Manual token refresh (for testing):
Edit `server.js` and temporarily uncomment:
```javascript
// Force refresh on startup (for testing)
// await tokenManager.refreshAccessToken();
```

### Monitor refresh events:
Look for logs like:
```
[2026-03-20T10:00:00.000Z] Checking token expiry...
🔄 Refreshing access token...
✓ Access token refreshed. Expires in 3600 seconds
```

---

## ❌ Troubleshooting

### Error: "No refresh token available"
- **Cause:** `ZOHO_REFRESH_TOKEN` not set in `.env`
- **Fix:** Follow Step 2 above to generate refresh token

### Error: "Invalid grant" when refreshing
- **Cause:** Refresh token is expired or invalid
- **Fix:** Generate a new refresh token and update `.env`

### Error: "scope not allowed"
- **Cause:** Refresh token doesn't have `ZohoSubscriptions.fullaccess.all` scope
- **Fix:** Regenerate with correct scope

---

## 🔐 Security Best Practices

1. **Never commit `.env` to Git**
   - Add `.env` to `.gitignore` (already done in this repo)

2. **Cycle refresh tokens periodically**
   - Zoho allows max 20 refresh tokens per user
   - Old ones are auto-deleted when limit reached

3. **Keep Client Secret secret**
   - Only store in `.env` and Vercel dashboard
   - Never share in logs or documentation

4. **Monitor token usage**
   - Check Zoho Billing → API Usage page
   - Ensure refresh requests aren't excessive

---

## ✅ Verification Checklist

- [ ] Generated refresh token from API Console
- [ ] Added `ZOHO_REFRESH_TOKEN` to `.env`
- [ ] Tested locally: `npm run dev`
- [ ] Saw "Token auto-refresh scheduled" message
- [ ] Added all env vars to Vercel Dashboard
- [ ] Redeployed on Vercel
- [ ] Ran `npm run verify` successfully
- [ ] Generated test labels without token errors

---

## 📚 References

- [Zoho OAuth 2.0 Documentation](https://www.zoho.com/billing/api/v1/oauth/)
- [Vercel Environment Variables](https://vercel.com/docs/build-output-api/environment)
- [Token Expiry and Refresh (Step 4 of Zoho Docs)](https://www.zoho.com/billing/api/v1/oauth/#step-4)
