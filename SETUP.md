# 🚀 Sentinel Gateway - Quick Start Guide

## ✅ Phase 1 Complete!

You now have a working Auth0-powered API gateway with:
- ✅ Auth0 JWT validation
- ✅ Request proxying to backend services
- ✅ User identity extraction
- ✅ Health check endpoints
- ✅ 3 mock backend APIs (Free, Premium, Admin tiers)

---

## 🔧 Setup Instructions

### 1. Configure Auth0

1. **Create Auth0 Account**: https://auth0.com (free tier is fine)

2. **Create an API**:
   - Go to Applications → APIs → Create API
   - Name: `Sentinel Gateway API`
   - Identifier: `https://sentinel-gateway-api`
   - Signing Algorithm: RS256

3. **Create an Application** (for testing):
   - Go to Applications → Create Application
   - Name: `Sentinel Test Client`
   - Type: Single Page Application

4. **Create Auth0 Action** (adds custom claims to tokens):
   - Go to Actions → Flows → Login
   - Create Action: "Add User Tier"
   - Code:
   ```javascript
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://sentinel-gateway.io';
     const tier = event.user.app_metadata?.tier || 'free';
     
     api.accessToken.setCustomClaim(`${namespace}/tier`, tier);
     api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
   };
   ```
   - Deploy and add to Login flow

### 2. Configure Environment

Edit `.env` with your Auth0 credentials:
```env
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://sentinel-gateway-api
AUTH0_ISSUER=https://your-tenant.us.auth0.com/
```

### 3. Start Services

Open **4 terminals**:

```bash
# Terminal 1 - Gateway
npm run dev

# Terminal 2 - Free tier backend
npm run backend:v1

# Terminal 3 - Premium tier backend
npm run backend:v2

# Terminal 4 - Admin backend
npm run backend:admin
```

---

## 🧪 Testing

### Get a test token from Auth0:
1. Go to Applications → APIs → Sentinel Gateway API → Test tab
2. Copy the access token

### Test the gateway:
```bash
# Health check (no auth)
curl http://localhost:3000/health

# Protected endpoint (with auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/data
```

---

## 📁 Project Structure

```
├── src/
│   ├── server.js              # Main Express app
│   ├── config/auth0.js        # Configuration
│   ├── middleware/
│   │   ├── auth.js            # JWT validation
│   │   ├── identity.js        # User extraction
│   │   └── error-handler.js   # Error handling
│   ├── routes/
│   │   ├── health.js          # Health checks
│   │   └── proxy.js           # API proxy
│   └── utils/logger.js        # Winston logger
├── mock-backends/
│   ├── api-v1.js              # Free tier
│   ├── api-v2.js              # Premium tier
│   └── admin-api.js           # Admin tier
├── .env                       # Your config
└── README.md                  # Full documentation
```

---

## 🎯 Next: Phase 2 - Smart Routing

Ready to add intelligence? Phase 2 will route users to different backends based on their tier!

Let me know when you're ready to continue! 🚀
