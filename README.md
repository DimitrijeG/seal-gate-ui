# seal-gate-ui

A web console for [seal-gate](https://github.com/DimitrijeG/seal-gate), a secret management
service with Shamir-based unsealing. It shows the API at work: initialize and
unseal, sign in, browse secrets, manage identities and policies, and watch
the requests go by in an optional API trace.

Every screen makes real requests to a seal-gate instance; nothing is mocked.

## Layout

- `api/` — the pinned seal-gate OpenAPI spec and the commit it came from.
- `design/` — the approved screen designs; the source of truth for the UI.
- `src/` — the console: Vite, React and TypeScript. `src/api/schema.d.ts` is
  generated from the spec; never edit it by hand.
- `e2e/` — Playwright tests.

## Running

The console must be served from the same origin as the API, because
seal-gate does not send CORS headers. In development the Vite dev server
proxies `/v1` to a local seal-gate; in deployment a reverse proxy serves
both.

```sh
npm install
npm run dev              # http://localhost:5173, proxies /v1 to 127.0.0.1:8080
SEAL_GATE_URL=http://host:port npm run dev   # proxy somewhere else
```

## Development

```sh
npm run api:types        # regenerate src/api/schema.d.ts after a spec update
npm run build            # type-check and build into dist/
npm run lint
npm test                 # unit tests (vitest)
npx playwright install chromium   # once
npm run test:e2e         # end-to-end tests (Playwright)
```

The end-to-end tests run against real seal-gate instances: they build it
from `../seal-gate` (or `SEAL_GATE_DIR`), which needs Go, and give each spec
file a fresh instance in memory on a free port, with the console on 5174. They
never touch a development server or its data.
