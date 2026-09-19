import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSize, formatDate, plural, parseTags } from '../src/domain/format.js'

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
