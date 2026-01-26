# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Production environment variables for Railway
ENV VITE_API_URL=https://backend-production-0df0d.up.railway.app/api
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
