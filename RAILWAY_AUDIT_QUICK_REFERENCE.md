# Railway Deployment Audit - Quick Reference

**Generated:** 2026-02-07
**Total Issues Found:** 15 (5 CRITICAL, 7 MEDIUM, 3 LOW)

---

## CRITICAL ISSUES (Must Fix Before Deploy)

### 🔴 1. Missing Backend Railway Configuration
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/railway.json` (MISSING)
- **Impact:** Railway won't know how to deploy the backend service
- **Fix:** Create the file with Dockerfile builder configuration
- **Time to Fix:** 5 minutes

### 🔴 2. Hardcoded Backend URL in Frontend Nginx
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/nginx.conf` (lines 36, 39, 51, 54)
- **Hardcoded Value:** `backend-production-0df0d.up.railway.app`
- **Impact:** 502 Bad Gateway errors on production (wrong backend URL)
- **Fix:** Use environment variables or service linking
- **Time to Fix:** 15-30 minutes

### 🔴 3. Database Data-Source Missing DATABASE_URL Support
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/data-source.ts`
- **Impact:** TypeORM migrations will fail on Railway
- **Fix:** Add DATABASE_URL parsing like in configuration.ts
- **Time to Fix:** 10 minutes

---

## MEDIUM ISSUES (Should Fix Before Deploy)

### 🟠 4. Frontend Railway Config Incomplete
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/railway.json`
- **Issue:** Missing service references and environment variables
- **Fix:** Add backend service reference and env var mapping
- **Time to Fix:** 10 minutes

### 🟠 5. Backend CORS Needs Environment Variable
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/main.ts` (line 57)
- **Issue:** Uses `FRONTEND_URL` env var that won't be set by default
- **Fix:** Set FRONTEND_URL in Railway dashboard
- **Time to Fix:** 5 minutes (configuration, not code)

### 🟠 6. Cookie Settings Depend on NODE_ENV
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/modules/auth/auth.controller.ts` (lines 23-29)
- **Issue:** sameSite:'none' requires secure:true; dependent on NODE_ENV=production
- **Fix:** Ensure NODE_ENV is set to 'production' in Railway
- **Time to Fix:** 5 minutes (configuration)

### 🟠 7. Frontend Dockerfile Has Hardcoded Variables
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/Dockerfile` (line 14)
- **Issue:** `ENV VITE_TELEGRAM_BOT_USERNAME=vendhubcashbot` hardcoded
- **Fix:** Use build ARG instead
- **Time to Fix:** 10 minutes

### 🟠 8. Nginx Requires Environment Variable Substitution
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/Dockerfile`
- **Issue:** Nginx template expects PORT variable substitution
- **Note:** Already configured correctly in Dockerfile
- **Time to Fix:** Already done ✅

---

## LOW ISSUES (Nice to Have)

### 🟡 9. File-based Logging in Stateless Environment
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/logger.config.ts`
- **Issue:** Logs written to filesystem are lost on container restart
- **Current Status:** Console logs captured by Railway, so actually OK
- **Recommendation:** Optional - no action needed
- **Time to Fix:** Not required

### 🟡 10. Health Check Uses Localhost
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/Dockerfile` (line 47)
- **Issue:** `http://localhost:3000/api/health/live`
- **Status:** Works fine, not critical
- **Time to Fix:** Not critical (optional improvement)

### 🟡 11. HSTS Header Very Strict
- **File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/nginx.conf` (line 22)
- **Note:** 1-year HSTS is correct for production
- **Time to Fix:** Not critical

---

## PASSING CHECKS ✅

- ✅ Backend port binding correct (0.0.0.0:3000)
- ✅ DATABASE_URL parsing in configuration.ts
- ✅ TypeORM SSL configuration for Railway PostgreSQL
- ✅ Health check endpoints properly configured
- ✅ Vite API URL configuration
- ✅ Redis configuration with fallback
- ✅ JWT secret validation
- ✅ Telegram token requirement
- ✅ Security headers (helmet, CSP)
- ✅ Graceful shutdown handling
- ✅ Multi-stage Dockerfile build
- ✅ Non-root user in Docker

---

## RAILWAY ENVIRONMENT VARIABLES CHECKLIST

### Backend Service Needs

**CRITICAL (Manual Setup Required):**
```
JWT_SECRET=<your-32-char-minimum-secret>
TELEGRAM_BOT_TOKEN=<get-from-@BotFather>
ADMIN_TELEGRAM_ID=<your-telegram-id>
FRONTEND_URL=https://your-frontend-railway-domain.up.railway.app
NODE_ENV=production
```

**Auto-Provided by Railway PostgreSQL Plugin:**
```
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

**Auto-Provided by Railway Redis Plugin (Optional):**
```
REDIS_HOST=...
REDIS_PORT=6379
REDIS_PASSWORD=...
```

### Frontend Service Needs

**Optional:**
```
VITE_TELEGRAM_BOT_USERNAME=vendhubcashbot
VITE_API_URL=/api
```

---

## DEPLOYMENT STEPS

### Step 1: Code Fixes (30-60 minutes)
- [ ] Create backend/railway.json
- [ ] Fix frontend nginx.conf backend URL
- [ ] Update backend data-source.ts
- [ ] Update frontend Dockerfile (optional but recommended)
- [ ] Update frontend railway.json (optional)

### Step 2: Railway Setup (15 minutes)
- [ ] Create Railway project
- [ ] Create backend service
- [ ] Create frontend service
- [ ] Add PostgreSQL plugin
- [ ] Add Redis plugin (optional)

### Step 3: Environment Configuration (10 minutes)
- [ ] Set JWT_SECRET (backend)
- [ ] Set TELEGRAM_BOT_TOKEN (backend)
- [ ] Set ADMIN_TELEGRAM_ID (backend)
- [ ] Set FRONTEND_URL (backend) - copy from frontend service domain
- [ ] Set NODE_ENV=production (backend)
- [ ] Verify DATABASE_URL is auto-set

### Step 4: Deploy & Test (10 minutes)
- [ ] Deploy both services
- [ ] Check backend health: GET /api/health/live
- [ ] Check frontend loads
- [ ] Test login flow
- [ ] Monitor logs

---

## MOST CRITICAL FIX

**Priority:** 🔴 MUST DO FIRST

The frontend nginx proxy has **hardcoded production URL** that will not work:

```nginx
# WRONG (line 36 in nginx.conf):
set $backend "https://backend-production-0df0d.up.railway.app";

# CORRECT OPTIONS:
# Option A - Use environment variable:
set $backend "${BACKEND_SERVICE_URL}";

# Option B - Use internal service name (if same project):
set $backend "http://backend:3000";
```

This is the #1 reason the deployment will fail with 502 errors.

---

## FILE LOCATIONS

| Component | Path |
|-----------|------|
| Backend Main | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/main.ts` |
| Backend Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/configuration.ts` |
| Backend Railway Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/railway.json` (MISSING) |
| Backend Dockerfile | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/Dockerfile` |
| Database Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/data-source.ts` |
| Frontend Dockerfile | `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/Dockerfile` |
| Frontend Nginx Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/nginx.conf` |
| Frontend Railway Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/railway.json` |
| Frontend Vite Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/vite.config.ts` |
| Auth Controller | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/modules/auth/auth.controller.ts` |
| Health Controller | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/health/health.controller.ts` |
| Logger Config | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/logger.config.ts` |
| Cache Module | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/cache/cache.module.ts` |
| App Module | `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/app.module.ts` |

---

## DETAILED AUDIT REPORT

For complete audit details, see: `RAILWAY_DEPLOYMENT_AUDIT.md`

This document contains:
- Section-by-section analysis of all 15 issues
- Complete code examples for all fixes
- Railway environment variable documentation
- Health check configuration details
- Security analysis
- Performance considerations
- Deployment checklist

