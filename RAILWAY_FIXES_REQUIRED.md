# Railway Deployment - Required Code Fixes

This document provides the exact code changes needed to make VendCash compatible with Railway.

---

## FIX #1: Create Backend Railway Configuration [CRITICAL]

**File to Create:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "startCommand": "node dist/main.js"
  }
}
```

**Why:** Railway needs to know how to build and deploy the backend service.

---

## FIX #2: Update Database Data Source [CRITICAL]

**File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/data-source.ts`

**Replace entire file with:**

```typescript
import 'dotenv/config';
import { DataSource } from 'typeorm';

function parseDatabaseUrl(): { host: string; port: number; username: string; password: string; database: string } | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading /
    };
  } catch {
    console.error('Failed to parse DATABASE_URL');
    return null;
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const dbConfig = parseDatabaseUrl() || {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'vendcash',
  password: process.env.DB_PASSWORD || 'vendcash',
  database: process.env.DB_DATABASE || 'vendcash',
};

const AppDataSource = new DataSource({
  type: 'postgres',
  ...dbConfig,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
```

**Changes:**
- Added `parseDatabaseUrl()` function (same as in configuration.ts)
- Falls back to individual env vars if DATABASE_URL not available
- Added SSL configuration for Railway PostgreSQL
- Properly spreads dbConfig into DataSource

**Why:** Railway's PostgreSQL plugin provides DATABASE_URL. TypeORM CLI needs to parse it for migrations.

---

## FIX #3: Fix Frontend Nginx Backend Proxy [CRITICAL]

**File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/nginx.conf`

**Option A: Using Environment Variables (Recommended)**

Replace the entire `/api/` location block (lines 34-46):

```nginx
location /api/ {
    resolver 8.8.8.8 valid=30s;
    set $backend "${BACKEND_SERVICE_URL}";
    proxy_pass $backend;
    proxy_http_version 1.1;
    proxy_set_header Host ${BACKEND_HOST};
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Cookie $http_cookie;
    proxy_pass_header Set-Cookie;
    proxy_ssl_server_name on;
}
```

Replace the entire `/socket.io/` location block (lines 49-61):

```nginx
location /socket.io/ {
    resolver 8.8.8.8 valid=30s;
    set $backend "${BACKEND_SERVICE_URL}";
    proxy_pass $backend;
    proxy_http_version 1.1;
    proxy_set_header Host ${BACKEND_HOST};
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_ssl_server_name on;
}
```

Then create `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/docker-entrypoint.sh`:

```bash
#!/bin/sh
set -e

# Substitute environment variables in nginx config
export BACKEND_SERVICE_URL="${BACKEND_SERVICE_URL:-http://backend:3000}"
export BACKEND_HOST="${BACKEND_HOST:-backend}"

# Use envsubst to replace variables in the template
envsubst '${BACKEND_SERVICE_URL},${BACKEND_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Execute the main command
exec "$@"
```

Make it executable:
```bash
chmod +x /sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/docker-entrypoint.sh
```

Update `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/Dockerfile`:

Replace the last 6 lines (24-30) with:

```dockerfile
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /usr/local/bin/

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

**Option B: Using Internal Service Name (Simpler for Single Project)**

If all services are in the same Railway project:

```nginx
location /api/ {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
    proxy_pass_header Set-Cookie;
}

location /socket.io/ {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

No changes to Dockerfile needed for Option B.

**Why:** Current hardcoded URL (backend-production-0df0d.up.railway.app) is from a different deployment and won't work.

---

## FIX #4: Update Frontend Dockerfile [MEDIUM - Recommended]

**File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/Dockerfile`

**Current (lines 1-30):**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Production environment variables for Railway
# Use /api to leverage nginx proxy (same-origin for cookies)
ENV VITE_API_URL=/api
ENV VITE_TELEGRAM_BOT_USERNAME=vendhubcashbot

RUN npm run build

# Production stage - nginx
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template (nginx will auto-substitute $PORT)
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Replace with:**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build args with defaults - these can be overridden at build time
ARG VITE_API_URL=/api
ARG VITE_TELEGRAM_BOT_USERNAME=vendhubcashbot

# Use ARG values for build-time env vars
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_TELEGRAM_BOT_USERNAME=${VITE_TELEGRAM_BOT_USERNAME}

RUN npm run build

# Production stage - nginx
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy entrypoint script (only if using Option A from Fix #3)
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

# Uncomment if using Option A (environment variable approach)
# ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# CMD ["nginx", "-g", "daemon off;"]

# Use if Option B (simpler approach)
CMD ["nginx", "-g", "daemon off;"]
```

**Why:** Using ARG allows flexible build-time configuration instead of hardcoding values.

---

## FIX #5: Update Frontend railway.json [MEDIUM - Recommended]

**File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/railway.json`

**Current:**
```json
{
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
        "builder": "DOCKERFILE"
    },
    "deploy": {
        "restartPolicyType": "ON_FAILURE",
        "restartPolicyMaxRetries": 10
    }
}
```

**Replace with:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "startCommand": "nginx -g 'daemon off;'"
  }
}
```

**Why:** Explicit start command and better documentation.

---

## FIX #6: Update Backend railway.json [MEDIUM - Optional]

**File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/railway.toml`

The current toml works, but you can harmonize by adding a JSON version:

**Already exists:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/railway.json`

No changes needed since you're using JSON format.

---

## FIX #7: Environment Variables Configuration [MEDIUM - Configuration]

**In Railway Dashboard, for Backend Service:**

Add these environment variables in the Railway dashboard:

```
NODE_ENV = production
JWT_SECRET = <generate-a-random-32-character-string>
TELEGRAM_BOT_TOKEN = <get-from-@BotFather>
ADMIN_TELEGRAM_ID = <your-telegram-id>
FRONTEND_URL = https://vendcash-frontend.up.railway.app
```

**In Railway Dashboard, for Frontend Service:**

Add these environment variables (optional):

```
VITE_TELEGRAM_BOT_USERNAME = vendhubcashbot
BACKEND_SERVICE_URL = http://backend:3000
BACKEND_HOST = backend
```

The last two are only needed if you choose Option A from Fix #3.

**Why:** These values must be set in Railway's environment configuration, not in code.

---

## FIX #8: Authentication Cookie Settings [LOW - Verification]

**File:** `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/modules/auth/auth.controller.ts`

**Current (lines 23-29) - NO CHANGES NEEDED:**
```typescript
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/',
};
```

**Verification:**
- Ensure `NODE_ENV=production` is set in Railway (Fix #7 above)
- This will make cookies:
  - `secure: true` (HTTPS only)
  - `sameSite: 'none'` (cross-origin allowed)
  - `httpOnly: true` (no JavaScript access)
  - `path: '/'` (all paths)

**Why:** Just a verification - code is already correct.

---

## SUMMARY OF CHANGES

### Files to Create:
1. `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/railway.json` (50 lines)
2. `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/docker-entrypoint.sh` (13 lines) - *Only if using Fix #3 Option A*

### Files to Modify:
1. `/sessions/brave-eloquent-hamilton/mnt/VendCash/backend/src/config/data-source.ts` (complete replacement)
2. `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/nginx.conf` (replace location blocks)
3. `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/Dockerfile` (update CMD/ENTRYPOINT)
4. `/sessions/brave-eloquent-hamilton/mnt/VendCash/frontend/railway.json` (minor update)

### Configuration Changes (Railway Dashboard):
1. Set backend environment variables (see Fix #7)
2. Add PostgreSQL plugin (auto-sets DATABASE_URL)
3. Add Redis plugin (optional, auto-sets REDIS_* vars)
4. Link services together

---

## IMPLEMENTATION ORDER

**Step 1: Code Changes (do these first)**
1. Create backend/railway.json (Fix #1)
2. Update data-source.ts (Fix #2)
3. Fix nginx proxy (Fix #3) - choose Option A or B
4. Update frontend Dockerfile (Fix #4)
5. Update frontend railway.json (Fix #5)

**Step 2: Railway Setup**
1. Create Railway project
2. Add PostgreSQL plugin
3. Add Redis plugin (optional)
4. Create backend service
5. Create frontend service

**Step 3: Configuration**
1. Set environment variables in Railway dashboard (Fix #7)
2. Link services if needed

**Step 4: Deploy & Test**
1. Push code to Git
2. Deploy both services
3. Test health endpoints
4. Test API communication
5. Test authentication

---

## VALIDATION CHECKLIST

After making these changes, verify:

- [ ] `backend/railway.json` exists and contains Dockerfile builder
- [ ] `backend/src/config/data-source.ts` has DATABASE_URL parsing
- [ ] `frontend/nginx.conf` doesn't have hardcoded backend URL
- [ ] `frontend/Dockerfile` doesn't have hardcoded TELEGRAM_BOT_USERNAME
- [ ] `frontend/railway.json` exists with correct configuration
- [ ] Backend service has all required environment variables
- [ ] Frontend service can reach backend via `/api` proxy
- [ ] Health endpoint responds: `GET /api/health/live` → 200 OK
- [ ] Login flow works end-to-end

---

## ROLLBACK

If needed to revert, just restore from git:

```bash
git checkout -- backend/src/config/data-source.ts
git checkout -- frontend/nginx.conf
git checkout -- frontend/Dockerfile
git checkout -- frontend/railway.json
git rm backend/railway.json
git rm frontend/docker-entrypoint.sh
```

