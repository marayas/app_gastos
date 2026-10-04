FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/finanzas.db TZ=America/Mexico_City
# tzdata: sin esto Alpine ignora TZ y el "mes actual" cambiaría a medianoche UTC.
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "src/server/index.ts"]
