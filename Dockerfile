# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
COPY templates/ templates/
RUN npx tsc

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S embediq && adduser -S embediq -G embediq

COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY package.json ./
COPY templates/ templates/

# Static web assets (not compiled by tsc)
COPY src/web/public/ dist/web/public/

USER embediq

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/web/server.js"]
