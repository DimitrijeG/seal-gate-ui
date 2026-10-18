# The console's static build, served by Caddy, which also proxies /v1 to seal-gate.
FROM node:24.22.0-alpine AS console
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Caddy ships without rate limiting; this plugin adds it.
FROM caddy:2.10.2-builder AS caddy
RUN xcaddy build --with github.com/mholt/caddy-ratelimit@v0.1.0

FROM caddy:2.10.2
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=console /src/dist /srv
