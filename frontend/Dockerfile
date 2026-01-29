# Build stage
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
