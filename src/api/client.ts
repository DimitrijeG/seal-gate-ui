import createClient from 'openapi-fetch'
import type { paths } from './schema'

// Same origin: the dev server, and the reverse proxy in deployment, forward
// /v1 to seal-gate.
export const api = createClient<paths>({ baseUrl: '/v1' })
