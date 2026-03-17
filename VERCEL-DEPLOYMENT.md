# Vercel Deployment Guide - Step by Step

## 🚀 Deploy to Vercel (5 Minutes)

### Step 1: Push to GitHub

```bash
# Initialize git (if not done)
cd ZohoDeliveryLabels
git init
git add .
git commit -m "Initial commit - ZohoDeliveryLabels"

# Create GitHub repo and push
# (Use GitHub Desktop or command line)
git remote add origin https://github.com/YOUR-USERNAME/ZohoDeliveryLabels.git
git push -u origin main
```

---

### Step 2: Connect Vercel

1. Go to: **https://vercel.com**
2. Sign up with GitHub
3. Click **"Add New Project"**
4. Import your `ZohoDeliveryLabels` repository
5. Click **"Import"**

---

### Step 3: Configure Environment Variables

**CRITICAL:** Add your Zoho credentials

In Vercel dashboard:
1. Go to **Settings** → **Environment Variables**
2. Add these variables:

| Name | Value |
|------|-------|
| `ZOHO_ORGANIZATION_ID` | Your Zoho org ID |
| `ZOHO_ACCESS_TOKEN` | Your Zoho access token |
| `PORT` | 3000 |

3. Click **"Save"**

---

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait 1-2 minutes
3. Done! ✅

**Your URL:** `https://ZohoDeliveryLabels-xyz.vercel.app`

---

## ⚙️ Vercel Configuration Explained

### What's Different from Local?

**Local (Warehouse PC):**
- Files saved to `/output` folder
- Persistent storage
- Files stay forever

**Vercel (Serverless):**
- Files saved to `/tmp` folder
- Temporary storage
- Files deleted after download
- Fresh environment every request

**Impact:** Files auto-delete after session - that's GOOD! Keeps it clean.

---

## 🔄 How It Works on Vercel

1. User clicks "Generate Labels"
2. Vercel spins up container
3. Fetches data from Zoho
4. Generates Excel in `/tmp`
5. Downloads to user
6. Container shuts down
7. `/tmp` files cleared

**Result:** Fresh, fast, no storage bloat

---

## 🔐 Security Notes

### Zoho Access Token

**Problem:** Tokens expire after 1 hour

**Solutions:**

#### Option A: Manual Refresh (Simple)
- Regenerate token when expired
- Update in Vercel dashboard
- Takes 2 minutes

#### Option B: Refresh Token Flow (Production)
Add these to Vercel environment variables:
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`

System auto-renews tokens (see `README.md` for code)

**Recommendation:** Start with Option A

---

## 💰 Vercel Pricing

### Free Tier (Hobby)
- ✅ 100GB bandwidth/month
- ✅ Unlimited deployments
- ✅ Custom domain
- ✅ SSL certificate
- **Cost: $0/month**

**Perfect for your use case:**
- ~50 labels/day = minimal bandwidth
- One deployment, rare updates
- Free SSL (https://)

### Pro Tier ($20/month)
- More bandwidth
- Team features
- Priority support

**You don't need this** - Free tier is plenty

---

## 🌐 Custom Domain (Optional)

Want `labels.yourcompany.com` instead of Vercel subdomain?

1. Buy domain (Namecheap, Google Domains)
2. Vercel dashboard → Settings → Domains
3. Add custom domain
4. Update DNS records (Vercel shows exact values)
5. Done! Free SSL included

**Cost:** ~$10-15/year for domain

---

## 🔄 Updates & Redeployment

### To Update Code:

```bash
# Make changes locally
git add .
git commit -m "Update label format"
git push

# Vercel auto-deploys in 1-2 minutes
```

**Every push = auto-deploy**

---

## 📊 Monitoring

**Vercel Dashboard shows:**
- Request count
- Response times
- Errors (if any)
- Bandwidth usage

**Check weekly** to ensure everything running smooth

---

## 🐛 Troubleshooting

### "Environment variable missing"
→ Add to Vercel dashboard Settings → Environment Variables

### "Cannot connect to Zoho"
→ Check access token hasn't expired

### "File not found after download"
→ Normal! Files delete after download (serverless)

### "Build failed"
→ Check GitHub repo has all files
→ Check `package.json` valid

---

## ✅ Deployment Checklist

Before deploying:

- [ ] Code pushed to GitHub
- [ ] Vercel account created
- [ ] Repository imported to Vercel
- [ ] Environment variables added:
  - [ ] ZOHO_ORGANIZATION_ID
  - [ ] ZOHO_ACCESS_TOKEN
  - [ ] PORT (optional, defaults to 3000)
- [ ] First deployment successful
- [ ] Test URL works: https://your-app.vercel.app
- [ ] Click "Generate Labels" - downloads file ✓
- [ ] Share URL with warehouse team

---

## 🎯 Post-Deployment

### Share with Team

**Warehouse access:**
```
https://ZohoDeliveryLabels-xyz.vercel.app
```

**Mobile-friendly** - works on phones/tablets

### Bookmark Instructions

Tell warehouse staff:
1. Bookmark the Vercel URL
2. Click when ready to print
3. Download file
4. Print

**That's it!**

---

## 🔒 Security Best Practices

1. **Don't commit `.env` file** (already in `.gitignore`)
2. **Use environment variables** in Vercel dashboard
3. **Regenerate tokens monthly** (or use refresh flow)
4. **Monitor usage** in Vercel dashboard
5. **Enable 2FA** on Vercel account

---

## 💡 Pro Tips

### Tip 1: Fast Deployments
- Only push when needed
- Test locally first (`npm start`)
- Commit messages = change log

### Tip 2: Zero Downtime
- Vercel auto-handles traffic
- No maintenance windows needed
- Updates deploy seamlessly

### Tip 3: Logs
- Vercel dashboard → Logs
- See every request
- Debug issues instantly

---

## 🎉 You're Live!

**Benefits of Vercel:**
- ✅ Access from anywhere (home, warehouse, phone)
- ✅ Free SSL (secure https)
- ✅ Auto-scaling (handles traffic spikes)
- ✅ Zero maintenance
- ✅ Free tier covers your needs

**URL to share:**
`https://your-project.vercel.app`

**Cost: $0/month** 🎊

---

## 📞 Need Help?

**Vercel Issues:**
- Vercel docs: https://vercel.com/docs
- Discord: https://vercel.com/discord

**Code Issues:**
- Run locally first: `npm start`
- Check `server.js` logs
- Verify Zoho connection: `npm run verify`

---

**Next:** Share URL with warehouse team and print labels from anywhere! 🚀
