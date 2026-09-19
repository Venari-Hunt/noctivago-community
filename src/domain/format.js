// Text rules for the Community tab: sizes, dates, tag parsing. No DOM.

export const PAGE_SIZE = 24
export const MAX_TAGS_SHOWN = 6
export const REPORT_REASONS = [
  ['copyright', 'Copyrighted audio'],
  ['offensive', 'Offensive content'],
  ['broken', "Doesn't work / broken"],
  ['spam', 'Spam']
]

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function parseTags(text) {
  return String(text ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)
}
