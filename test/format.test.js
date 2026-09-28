import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSize, formatDate, plural, parseTags, sizeRows, cutBytes, estimateTotal } from '../src/domain/format.js'

test('formatSize shows KB under a megabyte, MB above', () => {
  assert.equal(formatSize(100), '1 KB')
  assert.equal(formatSize(5 * 1024), '5 KB')
  assert.equal(formatSize(3.25 * 1024 * 1024), '3.3 MB')
  assert.equal(formatSize(undefined), '')
})

test('formatDate returns empty text for a bad date', () => {
  assert.equal(formatDate('not a date'), '')
  assert.notEqual(formatDate('2026-09-18T00:00:00Z'), '')
})

test('plural', () => {
  assert.equal(plural(1, 'sound'), '1 sound')
  assert.equal(plural(2, 'sound'), '2 sounds')
})

test('parseTags trims, drops empties and keeps at most 8', () => {
  assert.deepEqual(parseTags(' rain, ,forest ,'), ['rain', 'forest'])
  assert.equal(parseTags('a,b,c,d,e,f,g,h,i,j').length, 8)
  assert.deepEqual(parseTags(null), [])
})

test('sizeRows shows before → after, Freesound links, and pending sounds', () => {
  const MB = 1024 * 1024
  const rows = sizeRows([
    { name: 'Rain', freesound: false, beforeBytes: 30 * MB, afterBytes: 2 * MB },
    { name: 'Birds', freesound: true, beforeBytes: null, afterBytes: null },
    { name: 'Fire', freesound: false, beforeBytes: 10 * MB, afterBytes: null }
  ])
  assert.deepEqual(rows, [
    { index: 0, name: 'Rain', detail: '30.0 MB → 2.0 MB', heavy: false, canCut: false, marked: false },
    { index: 1, name: 'Birds', detail: 'linked from Freesound', heavy: false, canCut: false, marked: false },
    { index: 2, name: 'Fire', detail: '10.0 MB → …', heavy: false, canCut: false, marked: false }
  ])
})

test('sizeRows marks the three heaviest when asked', () => {
  const sounds = [1, 5, 3, 9, 2].map((n, i) => ({ name: `s${i}`, beforeBytes: n, afterBytes: n }))
  const heavy = sizeRows(sounds, { markHeaviest: true }).filter((r) => r.heavy).map((r) => r.name)
  assert.deepEqual(heavy, ['s1', 's2', 's3'])
})

test('a marked sound shows its estimated cut size and stops counting as heavy', () => {
  const MB = 1024 * 1024
  const sounds = [
    { name: 'Rain', beforeBytes: 300 * MB, afterBytes: 40 * MB, durationSeconds: 600, cuttable: true },
    { name: 'Fire', beforeBytes: 30 * MB, afterBytes: 20 * MB, durationSeconds: 60, cuttable: true },
    { name: 'Birds', freesound: true }
  ]
  const rows = sizeRows(sounds, { markHeaviest: true, cutSet: new Set([0]) })
  assert.equal(rows[0].marked, true)
  assert.equal(rows[0].heavy, false)
  assert.equal(rows[0].canCut, true)
  assert.equal(rows[0].detail, '300.0 MB → ~1.0 MB (cut to 15 s)')
  assert.equal(rows[1].heavy, true)
  assert.equal(estimateTotal(sounds, new Set([0])), 21 * MB)
  assert.equal(estimateTotal(sounds), 60 * MB)
})

test('cutBytes uses the real size once the app has cut the sound', () => {
  assert.equal(cutBytes({ afterBytes: 500, durationSeconds: 600, cut: true }), 500)
  assert.equal(cutBytes({ afterBytes: 600, durationSeconds: 60 }), 150)
  assert.equal(estimateTotal([{ afterBytes: null }]), null)
})
