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

export const CUT_SECONDS = 15

// A sound's upload size with the cut applied: its real size when the app
// already cut it, else a guess from the whole-file size (Opus is close to
// constant bitrate, so size scales with length).
export function cutBytes(s) {
  if (!Number.isFinite(s.afterBytes)) return null
  if (s.cut || !(s.durationSeconds > 0)) return s.afterBytes
  return Math.round((s.afterBytes * CUT_SECONDS) / s.durationSeconds)
}

// Upload size if the sounds at `cutSet` indexes are cut; null while any
// sound is still compressing.
export function estimateTotal(sounds, cutSet = new Set()) {
  let total = 0
  for (const [i, s] of (Array.isArray(sounds) ? sounds : []).entries()) {
    if (s.freesound) continue
    if (!Number.isFinite(s.afterBytes)) return null
    total += cutSet.has(i) ? cutBytes(s) : s.afterBytes
  }
  return total
}

// One row per sound for the share size list. sounds: the app's
// [{ name, freesound, beforeBytes, afterBytes, durationSeconds, cuttable, cut }].
// When `markHeaviest` is set (the preset was too large), the three biggest
// compressed sounds get heavy: true. `cutSet` holds the indexes the user
// marked "Cut to 15 s"; a row can offer the button once its size is known.
export function sizeRows(sounds, { markHeaviest = false, cutSet = new Set() } = {}) {
  const list = Array.isArray(sounds) ? sounds : []
  const heavy = new Set(
    markHeaviest
      ? list
          .filter((s) => Number.isFinite(s.afterBytes))
          .sort((a, b) => b.afterBytes - a.afterBytes)
          .slice(0, 3)
      : []
  )
  return list.map((s, index) => {
    const marked = cutSet.has(index)
    let detail
    if (s.freesound) detail = 'linked from Freesound'
    else if (!Number.isFinite(s.afterBytes)) detail = `${formatSize(s.beforeBytes)} → …`
    else if (s.cut) detail = `${formatSize(s.beforeBytes)} → ${formatSize(s.afterBytes)} (cut to 15 s)`
    else if (marked) detail = `${formatSize(s.beforeBytes)} → ~${formatSize(cutBytes(s))} (cut to 15 s)`
    else detail = `${formatSize(s.beforeBytes)} → ${formatSize(s.afterBytes)}`
    return {
      index,
      name: s.name,
      detail,
      heavy: heavy.has(s) && !marked,
      canCut: Boolean(s.cuttable) && Number.isFinite(s.afterBytes),
      marked
    }
  })
}
