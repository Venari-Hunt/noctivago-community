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

// One row per sound for the share size list. sounds: the app's
// [{ name, freesound, beforeBytes, afterBytes }]. When `markHeaviest` is set
// (the preset was too large), the three biggest compressed sounds get
// heavy: true.
export function sizeRows(sounds, { markHeaviest = false } = {}) {
  const list = Array.isArray(sounds) ? sounds : []
  const heavy = new Set(
    markHeaviest
      ? list
          .filter((s) => Number.isFinite(s.afterBytes))
          .sort((a, b) => b.afterBytes - a.afterBytes)
          .slice(0, 3)
      : []
  )
  return list.map((s) => {
    let detail
    if (s.freesound) detail = 'linked from Freesound'
    else if (Number.isFinite(s.afterBytes)) detail = `${formatSize(s.beforeBytes)} → ${formatSize(s.afterBytes)}`
    else detail = `${formatSize(s.beforeBytes)} → …`
    return { name: s.name, detail, heavy: heavy.has(s) }
  })
}
