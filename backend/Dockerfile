# IINVTY backend API. Runs on any container host (Render, Koyeb, Fly, Cloud Run,
# Railway, a VPS with Docker). Set DATABASE_URL to keep data in Postgres.
#
#   docker build -t iinvty-backend backend
#   docker run -p 5000:5000 --env-file backend/.env iinvty-backend

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# SQLite fallback location (unused when DATABASE_URL is set). Owned by the app user.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
