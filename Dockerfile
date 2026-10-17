FROM node:22.23.3-bookworm-slim AS build

ARG SERVICE=backend
WORKDIR /app

COPY ${SERVICE}/package.json ${SERVICE}/package-lock.json ./
RUN npm ci --include=dev

COPY ${SERVICE}/ ./
RUN npm run build

FROM node:22.23.3-bookworm-slim AS runtime

ARG SERVICE=backend
ENV SERVICE=${SERVICE}
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app ./

EXPOSE 3000 4000

CMD ["sh", "-c", "if [ \"$SERVICE\" = \"frontend\" ]; then exec npm start; else exec npm run start:prod; fi"]
