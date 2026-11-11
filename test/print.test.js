import { test } from 'node:test'
import assert from 'node:assert/strict'
import { printBars, cardTags, PRINT_MAX_BARS } from '../src/domain/format.js'

test('printBars: one bar per sound, capped, same id draws the same', () => {
  const a = printBars('abc', 5)
  assert.equal(a.length, 5)
  assert.deepEqual(a, printBars('abc', 5))
  assert.notDeepEqual(a, printBars('abd', 5))
  assert.ok(a.every((h) => h >= 14 && h <= 56))
  assert.equal(printBars('x', 400).length, PRINT_MAX_BARS)
  assert.equal(printBars('x', 0).length, 1)
})

test('cardTags shows three, then a count', () => {
  assert.deepEqual(cardTags(['a', 'b']), { shown: ['a', 'b'], more: 0 })
  assert.deepEqual(cardTags(['a', 'b', 'c', 'd', 'e']), { shown: ['a', 'b', 'c'], more: 2 })
  assert.deepEqual(cardTags(undefined), { shown: [], more: 0 })
})
