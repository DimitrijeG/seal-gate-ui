# TODO

## Design

The API now has everything the design waited on (seal-gate `c58bac2`):
aliases on entities and groups, `[{id, alias}]` lists, `GET /auth/users/{name}`,
`GET /auth/token/self`, and `generated`/`ttl` on a secret read. Update the
design to match: names in lists, no per-row summaries, Secrets list without
Kind and Expiry columns, Rotate only on generated secrets.

## Console

- Design still missing: New secret form, restyled Secrets scope select.
- Later: "Acting as" switcher (log in as another identity alongside root).
  Skipped for now; the design's header select is not built.

## Elsewhere

- Link this repo from the seal-gate README.
- Deploy on Contabo by hand: seal-gate and this console behind Caddy (HTTPS,
  same origin), demo data only, optional basic auth.
