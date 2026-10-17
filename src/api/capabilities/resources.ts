// The resource each operation is authorized against, as seal-gate names them
// (see its secret, identity, authorization and system services).
export const resources = {
  secret: (path: string) => `secrets/${path}`,
  // Listing checks the prefix itself: `secrets/` for every secret.
  secretList: (prefix = '') => `secrets/${prefix}`,
  entities: 'system/entities',
  entity: (id: string) => `system/entities/${id}`,
  entityTokens: (id: string) => `system/entities/${id}/tokens`,
  groups: 'system/groups',
  group: (id: string) => `system/groups/${id}`,
  users: 'system/users',
  user: (name: string) => `system/users/${name}`,
  policies: 'system/policies',
  policy: (name: string) => `system/policies/${name}`,
  seal: 'system/seal',
} as const
