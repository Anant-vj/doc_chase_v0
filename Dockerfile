FROM node:24.14.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
COPY client ./client
RUN npm run build
RUN npm prune --omit=dev

FROM node:24.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --chown=node:node package*.json ./
COPY --chown=node:node server ./server
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/src/server.js"]
