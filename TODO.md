# TODO

## Design

The API now has everything the design waited on (seal-gate `c58bac2`):
aliases on entities and groups, `[{id, alias}]` lists, `GET /auth/users/{name}`,
`GET /auth/token/self`, and `generated`/`ttl` on a secret read. Update the
design to match: names in lists, no per-row summaries, Secrets list without
Kind and Expiry columns, Rotate only on generated secrets.

## Console

- Design still missing, though the console has a version of each built
  from the design's parts: the New secret form, the Secrets scope select,
  the session menu (signed-in identity, Rotate token, Revoke token,
  Sign out), the New entity and New group panels, the inline rename field
  behind Rename, the inline Change password field, and the inline confirms
  before a delete. Add them to `design/`.
- Identity's group picker lists names only. The design's "brings dev-read,
  dev-write" line under each pickable group needed a read per group and was
  dropped; update the design to match. The dashed pills on an entity still
  say which group a policy comes from.
- A token that may read its own entity but not list entities gets an "Open
  your own entity" link where the list would be. Not in design.
- Policy pills link to the policy on the entity page too; the design links
  them on the group page only.
- Later: "Acting as" (a second identity alongside root). Skipped for now,
  and with it the header switcher, "Act as this token", "Act as someone
  else" on a 403, and the Policies "Try it" panel.

## Elsewhere

- Link this repo from the seal-gate README.
- Deploy on Contabo by hand: seal-gate and this console behind Caddy (HTTPS,
  same origin), demo data only, optional basic auth.

## Testing

- Visual baselines are Windows-Chromium only: Playwright puts the platform
  in the file name, so a run anywhere else regenerates rather than compares.
  A CI on Linux would need its own set, taken there.
- The baselines wait on the web fonts, which load from Google. Offline, the
  fallback face renders and every baseline fails. Self-hosting IBM Plex
  would fix that, and would also drop two external preconnects.
