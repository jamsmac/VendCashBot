# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time environment variables (overridable via Railway)
ARG VITE_API_URL=/api
ARG VITE_TELEGRAM_BOT_USERNAME=VendCashBot
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_TELEGRAM_BOT_USERNAME=${VITE_TELEGRAM_BOT_USERNAME}

RUN npm run build

# Production stage - nginx
FROM nginx:alpine AS production

# Limit worker processes (auto detects host CPUs, not container limits)
RUN sed -i 's/worker_processes\s*auto/worker_processes 2/' /etc/nginx/nginx.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template (nginx will auto-substitute $PORT)
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
