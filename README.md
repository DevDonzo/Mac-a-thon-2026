# 🛡️ Sentinel Gateway - Identity-Aware API Gateway

## 🎯 Elevator Pitch

**Sentinel Gateway** is an intelligent API gateway that doesn't just authenticate users—it *understands* them. By deeply integrating with Auth0, Sentinel dynamically adjusts rate limits, permissions, routes, and security policies based on who you are, what you're doing, and how you're behaving. It's the future of zero-trust API security.

---

## 🔥 Why This Wins the Hackathon

1. **Technical Sophistication**: Multi-layered architecture combining Auth0, real-time analytics, dynamic policy engine, and beautiful visualization
2. **Immediate Value**: Solves real enterprise problems (API abuse, security, cost management)
3. **Visual Impact**: Live dashboard showing requests flowing through the gateway with color-coded security decisions
4. **Auth0 Mastery**: Showcases advanced Auth0 features (RBAC, custom claims, Actions, Management API, Organizations)
5. **Scalability Story**: Built with production-ready patterns (Node.js, Redis, WebSockets)

---

## 🎬 The Demo Flow (5 Minutes to Glory)

### Act 1: The Problem (30 seconds)
Show a traditional API gateway with static rate limits. A "free tier" user hammers the API and gets the same treatment as a "premium" user. No intelligence, no context.

### Act 2: The Magic (3 minutes)
1. **User Login**: Three different users log in via Auth0 (Free, Premium, Admin)
2. **Live Dashboard**: Large screen shows the Sentinel Gateway dashboard with real-time request visualization
3. **Smart Routing**: 
   - Free user → Limited to 10 req/min, routed to cached endpoints
   - Premium user → 1000 req/min, routed to high-performance servers
   - Admin user → Unlimited, gets debug headers and special analytics endpoints
4. **Anomaly Detection**: Free user suddenly spikes traffic → Gateway auto-throttles and sends alert
5. **Dynamic Permissions**: Premium user tries to access admin endpoint → Blocked with helpful upgrade message

### Act 3: The Reveal (90 seconds)
Show the Auth0 dashboard with custom Actions, the policy engine configuration, and explain how this scales to thousands of APIs and millions of users.

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATIONS                      │
│                    (Web, Mobile, CLI, Third-party)              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP Requests + JWT
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SENTINEL GATEWAY (Node.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   Auth0      │  │   Policy     │  │   Analytics         │   │
│  │   Validator  │→ │   Engine     │→ │   Tracker           │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
│         │                  │                      │              │
│         ▼                  ▼                      ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Smart Router & Rate Limiter                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Proxied Requests
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND MICROSERVICES                         │
│         (API v1, API v2, Admin API, Analytics API)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SUPPORTING INFRASTRUCTURE                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   Redis      │  │   Auth0      │  │   WebSocket         │   │
│  │   (Cache)    │  │   (Identity) │  │   (Live Dashboard)  │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Implementation Phases

### **Phase 1: Foundation (Hours 0-2)** ✅ COMPLETE

**Goal**: Basic gateway that validates Auth0 JWTs and proxies requests

#### Deliverables:
- [x] Node.js Express server setup
- [x] Auth0 JWT validation middleware using `express-jwt` and `jwks-rsa`
- [x] Basic proxy functionality to a mock backend API
- [x] Environment configuration (.env with Auth0 domain, audience, etc.)
- [x] Simple test: Authenticated request → Proxied successfully

#### Key Files:
```
src/
├── server.js                 # Express app entry point
├── middleware/
│   └── auth.js              # Auth0 JWT validation
├── routes/
│   └── proxy.js             # Basic proxy logic
└── config/
    └── auth0.js             # Auth0 configuration
```

#### Auth0 Setup:
1. Create Auth0 Application (Single Page Application)
2. Create Auth0 API with custom identifier
3. Configure allowed callback URLs
4. Test with Auth0's test token generator

---

### **Phase 2: Identity-Aware Routing (Hours 2-4)** 🎯 THE DIFFERENTIATOR

**Goal**: Route requests differently based on user identity and roles

#### Deliverables:
- [ ] Extract user metadata from JWT (user_id, email, roles, tier)
- [ ] Implement routing logic based on user tier:
  - `free` → Route to `/api/v1` (limited features)
  - `premium` → Route to `/api/v2` (full features)
  - `admin` → Route to `/api/admin` (management endpoints)
- [ ] Add custom claims to Auth0 tokens using Auth0 Actions
- [ ] Create mock backend services for each tier
- [ ] Test: Same endpoint, different users → Different backends

#### Key Files:
```
src/
├── middleware/
│   └── identity.js          # Extract user context from JWT
├── services/
│   └── router.js            # Smart routing logic
└── policies/
    └── routing-rules.json   # Tier-based routing configuration
```

#### Auth0 Actions (Custom Claims):
```javascript
// Auth0 Action: Add User Tier to Token
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://sentinel-gateway.io';
  const tier = event.user.app_metadata?.tier || 'free';
  
  api.accessToken.setCustomClaim(`${namespace}/tier`, tier);
  api.accessToken.setCustomClaim(`${namespace}/roles`, event.authorization?.roles || []);
};
```

---

### **Phase 3: Dynamic Rate Limiting (Hours 4-6)** ⚡ IMPRESSIVE TECH

**Goal**: Per-user rate limiting based on identity and behavior

#### Deliverables:
- [ ] Redis integration for distributed rate limiting
- [ ] Implement sliding window rate limiter
- [ ] Tier-based rate limits:
  - `free`: 10 requests/minute
  - `premium`: 1000 requests/minute
  - `admin`: Unlimited
- [ ] Return proper HTTP 429 with `Retry-After` header
- [ ] Dashboard endpoint to view current rate limit status
- [ ] Test: Exceed limits → Proper throttling

#### Key Files:
```
src/
├── services/
│   └── rate-limiter.js      # Redis-based rate limiting
├── policies/
│   └── rate-limits.json     # Tier-based limits configuration
└── utils/
    └── redis.js             # Redis connection manager
```

#### Rate Limit Algorithm:
```javascript
// Sliding Window Counter
const key = `rate_limit:${userId}:${window}`;
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, windowSize);
}
return count <= limit;
```

---

### **Phase 4: Live Analytics Dashboard (Hours 6-8)** 📊 VISUAL WOW FACTOR

**Goal**: Real-time visualization of requests flowing through the gateway

#### Deliverables:
- [ ] WebSocket server for real-time updates
- [ ] Beautiful web dashboard (React or vanilla JS)
- [ ] Live metrics:
  - Requests per second (by user, by tier, by endpoint)
  - Rate limit violations
  - Response times
  - Success/error rates
- [ ] Visual request flow animation
- [ ] Color coding: Green (allowed), Yellow (throttled), Red (blocked)
- [ ] User detail panel (click user → see their activity)

#### Key Files:
```
dashboard/
├── index.html               # Dashboard UI
├── css/
│   └── styles.css          # Glassmorphism design
├── js/
│   ├── websocket.js        # WebSocket client
│   ├── charts.js           # Real-time charts (Chart.js)
│   └── animations.js       # Request flow visualization
└── assets/
    └── logo.svg            # Sentinel Gateway logo

src/
└── services/
    └── analytics.js        # Emit events to WebSocket
```

#### Dashboard Features:
- **Live Request Feed**: Scrolling list of requests with user avatars
- **Tier Distribution Pie Chart**: Visual breakdown of traffic by tier
- **Rate Limit Gauge**: Real-time needle showing current usage
- **Geographic Map**: Where requests are coming from (bonus)

---

### **Phase 5: Advanced Security Policies (Hours 8-10)** 🔒 ENTERPRISE READY

**Goal**: Implement sophisticated security rules beyond basic auth

#### Deliverables:
- [ ] Anomaly detection:
  - Sudden traffic spikes → Auto-throttle
  - Unusual access patterns → Flag for review
  - Geographic anomalies → Challenge with MFA
- [ ] Time-based access control (business hours only for certain endpoints)
- [ ] IP allowlist/blocklist per user tier
- [ ] Custom Auth0 Actions for risk scoring
- [ ] Automatic user suspension on suspicious activity
- [ ] Security event logging and alerting

#### Key Files:
```
src/
├── services/
│   ├── anomaly-detector.js  # Behavioral analysis
│   └── security-engine.js   # Policy enforcement
├── policies/
│   ├── security-rules.json  # Declarative security policies
│   └── ip-rules.json        # IP-based access control
└── integrations/
    └── auth0-management.js  # Auth0 Management API client
```

#### Example Security Policy:
```json
{
  "rules": [
    {
      "name": "Spike Detection",
      "condition": "requests_per_minute > (average * 5)",
      "action": "throttle",
      "duration": "5m"
    },
    {
      "name": "Geographic Anomaly",
      "condition": "country != user.usual_country",
      "action": "require_mfa"
    },
    {
      "name": "Business Hours Only",
      "condition": "hour < 9 || hour > 17",
      "endpoints": ["/api/admin/*"],
      "action": "block"
    }
  ]
}
```

---

### **Phase 6: Polish & Presentation (Hours 10-12)** 🎨 HACKATHON READY

**Goal**: Make it demo-ready and visually stunning

#### Deliverables:
- [ ] Professional README with architecture diagrams
- [ ] Demo script with test users pre-configured
- [ ] Seed data for realistic dashboard
- [ ] Error handling and user-friendly messages
- [ ] Logging and debugging tools
- [ ] Docker Compose for one-command setup
- [ ] Video recording of the demo (backup plan)
- [ ] Presentation slides (optional but recommended)

#### Demo Preparation:
1. **Test Users in Auth0**:
   - `alice@free.com` (Free tier)
   - `bob@premium.com` (Premium tier)
   - `admin@sentinel.io` (Admin)

2. **Demo Script**:
   ```bash
   # Terminal 1: Start gateway
   npm run dev
   
   # Terminal 2: Start dashboard
   npm run dashboard
   
   # Terminal 3: Run demo requests
   npm run demo
   ```

3. **Visual Polish**:
   - Custom logo and branding
   - Smooth animations
   - Dark mode (always impressive)
   - Responsive design

---

## 🛠️ Technology Stack

### Core
- **Node.js + Express**: Gateway server
- **Auth0**: Identity and access management
- **Redis**: Distributed caching and rate limiting
- **WebSocket (ws)**: Real-time dashboard updates

### Frontend
- **Vanilla JavaScript** or **React**: Dashboard UI
- **Chart.js**: Real-time analytics visualization
- **CSS3**: Glassmorphism and modern design

### DevOps
- **Docker + Docker Compose**: Containerization
- **dotenv**: Environment configuration
- **Winston**: Structured logging
- **Jest**: Testing (if time permits)

### Auth0 Features Showcased
- ✅ JWT validation
- ✅ Custom Claims (Actions)
- ✅ Role-Based Access Control (RBAC)
- ✅ Organizations (multi-tenancy)
- ✅ Management API (user suspension)
- ✅ Auth0 Actions (risk scoring)

---

## 📋 Project Structure

```
sentinel-gateway/
├── src/
│   ├── server.js                    # Main entry point
│   ├── middleware/
│   │   ├── auth.js                  # Auth0 JWT validation
│   │   ├── identity.js              # User context extraction
│   │   └── error-handler.js         # Global error handling
│   ├── services/
│   │   ├── router.js                # Smart routing logic
│   │   ├── rate-limiter.js          # Redis-based rate limiting
│   │   ├── analytics.js             # Event tracking and emission
│   │   ├── anomaly-detector.js      # Behavioral analysis
│   │   └── security-engine.js       # Policy enforcement
│   ├── routes/
│   │   ├── proxy.js                 # Main proxy routes
│   │   ├── health.js                # Health check endpoints
│   │   └── admin.js                 # Admin management endpoints
│   ├── policies/
│   │   ├── routing-rules.json       # Routing configuration
│   │   ├── rate-limits.json         # Rate limit tiers
│   │   └── security-rules.json      # Security policies
│   ├── config/
│   │   ├── auth0.js                 # Auth0 configuration
│   │   └── redis.js                 # Redis configuration
│   └── utils/
│       ├── logger.js                # Winston logger
│       └── helpers.js               # Utility functions
├── dashboard/
│   ├── index.html                   # Dashboard UI
│   ├── css/
│   │   └── styles.css               # Styling
│   ├── js/
│   │   ├── websocket.js             # WebSocket client
│   │   ├── charts.js                # Chart.js integration
│   │   └── app.js                   # Main dashboard logic
│   └── assets/
│       └── logo.svg                 # Branding
├── mock-backends/
│   ├── api-v1.js                    # Free tier API
│   ├── api-v2.js                    # Premium tier API
│   └── admin-api.js                 # Admin API
├── scripts/
│   ├── seed-users.js                # Create test users in Auth0
│   ├── demo.js                      # Automated demo script
│   └── load-test.js                 # Performance testing
├── docker-compose.yml               # Redis + Gateway + Backends
├── Dockerfile                       # Gateway container
├── .env.example                     # Environment template
├── package.json                     # Dependencies
└── README.md                        # This file
```

---

## 🎯 Success Metrics

### Technical Achievements
- ✅ Sub-10ms authentication overhead
- ✅ 10,000+ requests/second throughput
- ✅ 99.9% uptime during demo
- ✅ Zero security vulnerabilities

### Demo Impact
- ✅ Audible "wow" from judges during live dashboard reveal
- ✅ Questions about production deployment
- ✅ Requests for GitHub repo link
- ✅ Social media shares

---

## 🚧 Future Enhancements (Post-Hackathon)

1. **Machine Learning**: Train models on traffic patterns for smarter anomaly detection
2. **Multi-Region**: Deploy gateway in multiple regions with intelligent routing
3. **GraphQL Support**: Extend beyond REST to GraphQL APIs
4. **Cost Optimization**: Track API costs per user and optimize routing
5. **Marketplace**: Allow third-party policy plugins
6. **Blockchain Integration**: Immutable audit logs on-chain
7. **Mobile SDK**: Native mobile gateway client libraries

---

## 🏆 Why Auth0 is Perfect for This

1. **Enterprise-Grade Auth**: Don't build auth from scratch—focus on innovation
2. **Extensibility**: Actions and Rules let you customize token claims
3. **Management API**: Programmatically manage users and security policies
4. **Organizations**: Built-in multi-tenancy for B2B scenarios
5. **Analytics**: Rich user behavior data to feed the anomaly detector
6. **Compliance**: SOC2, GDPR, HIPAA ready out of the box

---

## 📚 Resources

- [Auth0 Docs](https://auth0.com/docs)
- [Auth0 Actions](https://auth0.com/docs/customize/actions)
- [JWT.io](https://jwt.io) - Decode and verify JWTs
- [Redis Rate Limiting Patterns](https://redis.io/docs/manual/patterns/rate-limiter/)
- [API Gateway Patterns](https://microservices.io/patterns/apigateway.html)

---

## 🎤 Presentation Tips

1. **Start with the problem**: "APIs are dumb. They treat all users the same."
2. **Live demo first**: Show, don't tell. Let the dashboard speak.
3. **Explain the magic**: Dive into Auth0 Actions and policy engine
4. **Scale story**: "This handles 10 requests in the demo, but it's built for 10 million"
5. **Call to action**: "Imagine every API in your company behind Sentinel Gateway"

---

## 🙌 Credits

Built with ❤️ for Mac-a-thon 2026

**Powered by**: Auth0, Node.js, Redis, and way too much coffee ☕

---

**Let's build the future of API security. Let's build Sentinel Gateway.** 🛡️
