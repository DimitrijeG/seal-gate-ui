# Deployment

seal-gate and this console as two containers. Caddy in the console image serves
the console, proxies `/v1` to seal-gate, gets the HTTPS certificate and rate
limits by client address. seal-gate publishes no port to the outside.

Images are built by the `Image` workflow in each repository and pushed to
`ghcr.io/dimitrijeg/seal-gate` and `ghcr.io/dimitrijeg/seal-gate-ui`.

## Locally

Build both images under the names compose expects, then start them:

```sh
docker build -t ghcr.io/dimitrijeg/seal-gate:latest ../seal-gate
docker build -t ghcr.io/dimitrijeg/seal-gate-ui:latest .
docker compose -f deploy/compose.yaml up -d
```

Open <https://localhost>. The certificate comes from Caddy's local CA, so the
browser warns once.

## On the server, the first time

seal-gate answers `init` to whoever calls it first, so it is initialized before
the console makes it public.

1. Install Docker. Open only 22, 80 and 443 in the firewall.
2. Point the domain's DNS at the server.
3. Copy this directory to the server, and `.env.example` to `.env` with
   `SITE_ADDRESS` set to the domain.
4. Start seal-gate alone: `docker compose up -d seal-gate`.
5. From your machine, tunnel to it and initialize:
   `ssh -L 8080:127.0.0.1:8080 <server>`, then
   `curl -X POST localhost:8080/v1/sys/init -H 'Content-Type: application/json' -d '{"shares":3,"threshold":2}'`.
   Keep the shares and the root token somewhere safe, apart.
6. Start the rest: `docker compose up -d`.
7. Unseal from the console's Unseal screen.

## Updating

```sh
docker compose pull && docker compose up -d
```

A restarted seal-gate comes back sealed: unseal it again from the console.
To roll back, set `SEAL_GATE_TAG` or `CONSOLE_TAG` in `.env` to an earlier
`sha-…` tag and run the same command.

## Postgres instead of bolt

Set `POSTGRES_PASSWORD` in `.env` and name both files on every command:

```sh
docker compose -f compose.yaml -f compose.postgres.yaml up -d
```

## Configuration

seal-gate reads `/etc/seal-gate/config.yaml` (bolt) or
`/etc/seal-gate/postgres.yaml`. To change anything else, mount your own file
and pass it with `-config`; the file replaces the built-in one whole.
