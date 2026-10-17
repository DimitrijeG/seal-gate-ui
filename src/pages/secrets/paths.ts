// Secret paths as seal-gate accepts them: segments of [A-Za-z0-9._-], none
// empty, `.` or `..`; no leading or trailing `/`; at most 256 bytes.
export const MAX_PATH_BYTES = 256
const SEGMENT = /^[A-Za-z0-9._-]+$/

// Why a path would be refused, or null when it is valid.
export function pathProblem(path: string): string | null {
  if (path === '') return 'Enter a path.'
  if (new TextEncoder().encode(path).length > MAX_PATH_BYTES) return `At most ${MAX_PATH_BYTES} bytes.`
  if (path.startsWith('/') || path.endsWith('/')) return 'No leading or trailing slash.'
  for (const segment of path.split('/')) {
    if (segment === '') return 'No empty segment between slashes.'
    if (segment === '.' || segment === '..') return 'No . or .. segment.'
    if (!SEGMENT.test(segment)) return 'Only A–Z a–z 0–9 . _ - and / between segments.'
  }
  return null
}

// What the URL after /secrets/ points at: a folder (ending in `/`, or empty
// for the top), or a secret, shown inside its folder.
export interface Location {
  folder: string
  selected: string | null
}

export function parseLocation(rest: string): Location {
  if (rest === '' || rest.endsWith('/')) return { folder: rest, selected: null }
  const cut = rest.lastIndexOf('/') + 1
  return { folder: rest.slice(0, cut), selected: rest }
}

export interface FolderView {
  folders: { name: string; count: number }[]
  secrets: string[]
}

// The folders and secrets directly inside `folder`, from every path under
// it. A folder's count is how many secrets it holds at any depth. Both are
// sorted by byte order, like the API's lists.
export function folderView(paths: string[], folder: string): FolderView {
  const counts = new Map<string, number>()
  const secrets: string[] = []
  for (const path of paths) {
    if (!path.startsWith(folder)) continue
    const rest = path.slice(folder.length)
    const slash = rest.indexOf('/')
    if (slash === -1) secrets.push(path)
    else {
      const name = rest.slice(0, slash + 1)
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return {
    folders: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => byBytes(a.name, b.name)),
    secrets: secrets.sort(byBytes),
  }
}

// The last segment, as a list row or heading shows it.
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

// "7 days", "1 hour", "90 minutes": the largest unit that divides evenly.
export function formatDuration(seconds: number): string {
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  for (const [size, name] of units) {
    if (seconds % size === 0) {
      const n = seconds / size
      return `${n} ${name}${n === 1 ? '' : 's'}`
    }
  }
  return `${seconds} seconds`
}

// How many bytes a base64 value decodes to.
export function decodedLength(base64: string): number {
  if (base64 === '') return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length / 4) * 3 - padding
}
