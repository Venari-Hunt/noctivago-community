import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shareFailWords } from '../src/components/CommunityTab.js'

test('Share button failure words', () => {
  assert.equal(shareFailWords('This preset is 64.2 MB after compression; the limit is 80 MB. Heaviest: "rain" (30 MB). Cut them.'), 'Too large: 64.2 MB of 80 MB')
  assert.equal(shareFailWords('Network down.'), 'Network down')
  assert.equal(shareFailWords(''), 'Sharing failed')
  assert.equal(shareFailWords('x'.repeat(50)).length, 36)
})
