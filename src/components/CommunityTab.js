// Community - browse, import and share presets made by other users.
//
// The server is a Cloudflare Worker (community/ at the repo root); the main
// process talks to it (src/main/community/client.js) and this tab only goes
// through window.noctivago.community. Importing reuses the Mixer's own
// "Import preset" dialog: the downloaded bundle is analyzed in the main
// process exactly like a local .ncvpreset, then handed to the Mixer with a
// synchronous `noctivago:open-preset-import` event.
//
// Everything that comes from the server is rendered with textContent, never
// innerHTML - preset names, descriptions and tags are user-written.

import { PAGE_SIZE, REPORT_REASONS, formatSize, formatDate, plural, parseTags, sizeRows, estimateTotal, printBars, cardTags } from '../domain/format.js'
import { el } from './el.js'
import { icon } from './icons.js'

export default class CommunityPlugin {
  constructor(app) {
    this.app = app
    this.api = app.noctivago
    this.els = {}
    this.view = 'browse'
    this.page = 0
    this.hasMore = false
    this.loading = false
    this.requestId = 0
    this.pendingImportCard = null
    this.publishing = false
    this.localPresets = []
    // Size list state: the app's last sound report, and the indexes the user
    // marked "Cut to 15 s" (sent with the next Share).
    this.shareSounds = null
    this.shareMarkHeaviest = false
    this.cutSet = new Set()
    this.maxUploadBytes = 50 * 1024 * 1024
  }

  async onload() {
    // No server configured in this build (COMMUNITY_API_URL unset) - skip the
    // tab entirely rather than showing one that can't do anything.
    try {
      if (!(await this.api.community.getProfile()).available) return
    } catch {
      return
    }
    this.onImportFinished = (event) => this.handleImportFinished(event.detail?.result)
    window.addEventListener('noctivago:preset-import-finished', this.onImportFinished)
    this.unregister = this.app.tabs.register({
      id: 'community',
      title: 'Community',
      mount: (container) => this.mount(container)
    })
  }

  async onunload() {
    window.removeEventListener('noctivago:preset-import-finished', this.onImportFinished)
    this.observer?.disconnect()
    this.unregister?.()
  }

  // Desktop 2.0 (step 17): the approved mock's `community`,
  // `community-share` and `community-mine` screens. A Browse / My uploads /
  // Share switch, a search row, and preset cards with the same fingerprint
  // card the Presets gallery uses.
  mount(container) {
    container.innerHTML = `
      <div class="community-tab">
        <div class="cm-tools cm-sub">
          <div class="cm-seg" role="group" aria-label="Community">
            <button type="button" data-view="browse" aria-pressed="true">Browse</button>
            <button type="button" data-view="mine" aria-pressed="false">My uploads</button>
            <button type="button" data-view="share" aria-pressed="false">Share</button>
          </div>
        </div>
        <p id="community-unavailable" class="cm-hint" hidden></p>

        <section id="community-browse" class="cm-view">
          <div class="cm-tools">
            <input id="community-query" class="cm-field cm-grow" type="text" placeholder="rain, cabin, forest night…" autocomplete="off" aria-label="Search presets" />
            <select id="community-sort" class="cm-field" aria-label="Sort">
              <option value="popular">Most downloaded</option>
              <option value="new">Newest</option>
            </select>
            <button id="community-search-btn" class="cm-b cm-pri" type="button">${icon('search')}Search</button>
          </div>
          <p class="cm-hint">Ambiences made by other Noctívago users. Importing adds the preset and its sounds to your library. Sounds from Freesound are downloaded from Freesound; the rest come with the preset.</p>
          <p id="community-status" class="cm-hint" aria-live="polite"></p>
          <div id="community-results" class="cm-tiles"></div>
          <div id="community-sentinel" class="cm-sentinel" hidden></div>
        </section>

        <section id="community-mine" class="cm-view" hidden>
          <p id="community-mine-status" class="cm-hint" aria-live="polite"></p>
          <div id="community-mine-results" class="cm-tiles"></div>
        </section>

        <section id="community-share" class="cm-view" hidden>
          <form id="community-share-form" class="cm-sharef">
            <div class="cm-card">
              <h2 class="cm-gh">Share a preset</h2>
              <p id="community-share-mode" class="cm-hint cm-l" hidden></p>
              <div class="cm-row"><div class="cm-sl"><span>Preset</span></div><div class="cm-trail"><select id="community-share-preset" class="cm-field cm-w224" aria-label="Preset"></select></div></div>
              <label class="cm-fl">Name<input id="community-share-name" class="cm-field" type="text" maxlength="80" /></label>
              <label class="cm-fl">Description<textarea id="community-share-description" class="cm-field cm-ta" maxlength="600" placeholder="What does it sound like? Where does it take you?"></textarea></label>
              <label class="cm-fl">Tags<input id="community-share-tags" class="cm-field" type="text" placeholder="rain, night, cozy" /></label>
              <label class="cm-fl">Your name (shown on the preset)<input id="community-share-author" class="cm-field" type="text" maxlength="40" /></label>
              <label class="cm-row cm-rights"><div class="cm-sl"><span>I made these sounds or have the right to share them</span><small>Sounds imported from Freesound are linked, not re-uploaded.</small></div><div class="cm-trail"><input id="community-share-rights" class="cm-sw" type="checkbox" role="switch" /></div></label>
              <div class="cm-actions">
                <button id="community-share-cancel" class="cm-b cm-ghost" type="button" hidden>Cancel update</button>
                <button id="community-share-submit" class="cm-b cm-pri" type="submit">${icon('upload')}<span>Share</span></button>
              </div>
              <div id="community-share-progress" class="cm-sb" hidden><i></i></div>
              <p id="community-share-status" class="cm-hint" aria-live="polite"></p>
              <ul id="community-share-sizes" class="cm-sizes" hidden></ul>
            </div>
            <p class="cm-hint">Your uploads are public. Only what you share is sent.</p>
          </form>
        </section>
      </div>
    `

    const q = (sel) => container.querySelector(sel)
    this.els = {
      pills: [...container.querySelectorAll('[data-view]')],
      unavailable: q('#community-unavailable'),
      views: { browse: q('#community-browse'), mine: q('#community-mine'), share: q('#community-share') },
      query: q('#community-query'),
      sort: q('#community-sort'),
      searchBtn: q('#community-search-btn'),
      status: q('#community-status'),
      results: q('#community-results'),
      sentinel: q('#community-sentinel'),
      mineStatus: q('#community-mine-status'),
      mineResults: q('#community-mine-results'),
      shareForm: q('#community-share-form'),
      shareMode: q('#community-share-mode'),
      sharePreset: q('#community-share-preset'),
      shareName: q('#community-share-name'),
      shareAuthor: q('#community-share-author'),
      shareDescription: q('#community-share-description'),
      shareTags: q('#community-share-tags'),
      shareRights: q('#community-share-rights'),
      shareCancel: q('#community-share-cancel'),
      shareSubmit: q('#community-share-submit'),
      shareStatus: q('#community-share-status'),
      shareProgress: q('#community-share-progress'),
      shareSizes: q('#community-share-sizes')
    }

    for (const pill of this.els.pills) {
      pill.addEventListener('click', () => this.showView(pill.dataset.view))
    }
    this.els.searchBtn.addEventListener('click', () => this.search())
    this.els.query.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') this.search()
    })
    this.els.sort.addEventListener('change', () => this.search())
    this.els.sharePreset.addEventListener('change', () => {
      const preset = this.localPresets.find((p) => p.id === this.els.sharePreset.value)
      if (preset && !this.shareTarget) this.els.shareName.value = preset.name
      this.cutSet.clear()
      this.showShareSizes(null)
    })
    this.els.shareForm.addEventListener('submit', (evt) => {
      evt.preventDefault()
      this.publish()
    })
    this.els.shareCancel.addEventListener('click', () => this.setShareTarget(null))

    this.observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) this.loadMore()
    })
    this.observer.observe(this.els.sentinel)

    this.init()
  }

  async init() {
    let profile
    try {
      profile = await this.api.community.getProfile()
    } catch {
      profile = { available: false }
    }
    this.available = Boolean(profile.available)
    this.els.shareAuthor.value = profile.authorName || ''
    if (!this.available) {
      this.els.unavailable.textContent = 'Community presets are not available in this build.'
      this.els.unavailable.hidden = false
      for (const btn of [this.els.searchBtn, this.els.shareSubmit]) btn.disabled = true
      return
    }
    this.search()
  }

  showView(view) {
    this.view = view
    for (const pill of this.els.pills) pill.setAttribute('aria-pressed', String(pill.dataset.view === view))
    for (const [key, section] of Object.entries(this.els.views)) section.hidden = key !== view
    if (!this.available) return
    if (view === 'mine') this.loadMine()
    if (view === 'share') this.refreshLocalPresets()
  }

  // --- browse ---------------------------------------------------------------

  async search() {
    if (!this.available) return
    this.page = 0
    this.hasMore = false
    this.requestId += 1
    this.loading = false
    this.els.results.replaceChildren()
    await this.fetchPage()
  }

  loadMore() {
    if (this.loading || !this.hasMore || this.view !== 'browse') return
    this.fetchPage()
  }

  async fetchPage() {
    const requestId = this.requestId
    this.loading = true
    this.els.status.textContent = this.page === 0 ? 'Loading…' : 'Loading more…'
    let result
    try {
      result = await this.api.community.list({
        query: this.els.query.value.trim(),
        sort: this.els.sort.value,
        page: this.page + 1,
        pageSize: PAGE_SIZE
      })
    } catch (err) {
      result = { ok: false, error: err?.message }
    }
    if (requestId !== this.requestId) return
    this.loading = false
    if (!result.ok) {
      this.els.status.textContent = result.error || 'Could not load presets.'
      this.els.sentinel.hidden = true
      return
    }
    this.page += 1
    this.hasMore = result.hasMore
    for (const preset of result.results) this.els.results.appendChild(this.renderCard(preset, { mine: false }))
    const count = this.els.results.children.length
    this.els.status.textContent =
      count === 0
        ? this.els.query.value.trim()
          ? 'No presets match that search.'
          : 'No presets shared yet. Be the first!'
        : plural(count, 'preset')
    this.els.sentinel.hidden = !this.hasMore
  }

  renderCard(preset, { mine }) {
    const card = el('article', 'cm-pcard')
    card.dataset.id = preset.id

    const print = el('div', 'cm-print')
    print.setAttribute('aria-hidden', 'true')
    for (const h of printBars(preset.id, preset.soundCount)) {
      const bar = el('i')
      bar.style.height = h + 'px'
      print.appendChild(bar)
    }
    card.appendChild(print)

    const name = el('div', 'cm-pname', preset.name)
    name.title = preset.name
    card.appendChild(name)

    // The mock's line is author, sounds and downloads; size and date stay
    // on a second line, as the source always showed them.
    const meta = [mine ? null : `by ${preset.author}`, plural(preset.soundCount, 'sound'), plural(preset.downloads ?? 0, 'download')].filter(Boolean)
    const metaEl = el('div', 'cm-meta', meta.join(' · '))
    metaEl.title = metaEl.textContent
    card.appendChild(metaEl)
    const sub = [formatSize(preset.sizeBytes), formatDate(preset.updatedAt || preset.createdAt)].filter(Boolean)
    if (sub.length) card.appendChild(el('div', 'cm-meta', sub.join(' · ')))

    if (preset.description) {
      const desc = el('p', 'cm-desc', preset.description)
      desc.title = preset.description
      card.appendChild(desc)
    }

    const { shown, more } = cardTags(preset.tags)
    const chips = el('div', 'cm-chips')
    if (preset.hidden) chips.appendChild(el('span', 'cm-chip cm-hot', 'Hidden (reported)'))
    for (const tag of shown) chips.appendChild(el('span', 'cm-chip', tag))
    if (more) {
      const moreChip = el('span', 'cm-chip cm-more', `+${more}`)
      moreChip.title = preset.tags.slice(shown.length).join(', ')
      chips.appendChild(moreChip)
    }
    card.appendChild(chips)

    const status = el('div', 'cm-status')
    status.setAttribute('aria-live', 'polite')
    const footer = el('div', 'cm-actions')

    if (mine) {
      const updateBtn = el('button', 'cm-b', 'Update')
      updateBtn.type = 'button'
      updateBtn.title = 'Replace this upload with the current version of one of your presets'
      updateBtn.addEventListener('click', () => {
        this.setShareTarget(preset)
        this.showView('share')
      })
      const deleteBtn = el('button', 'cm-b cm-ghost', 'Delete')
      deleteBtn.type = 'button'
      deleteBtn.addEventListener('click', () => this.deleteUpload(preset, card, status))
      footer.append(updateBtn, deleteBtn)
    } else {
      const importBtn = el('button', 'cm-b')
      importBtn.type = 'button'
      importBtn.innerHTML = icon('download') + '<span>Import</span>'
      importBtn.addEventListener('click', () => this.importPreset(preset, importBtn, status))
      // Not drawn in the mock; kept from the source, quiet beside Import.
      const reportBtn = el('button', 'cm-b cm-ghost', 'Report')
      reportBtn.type = 'button'
      reportBtn.addEventListener('click', () => this.toggleReportForm(card, preset, status))
      footer.append(importBtn, reportBtn)
    }
    card.append(footer, status)
    return card
  }

  async importPreset(preset, button, status) {
    button.disabled = true
    status.textContent = 'Downloading…'
    let analysis
    try {
      analysis = await this.api.community.download(preset.id)
    } catch (err) {
      analysis = { ok: false, error: err?.message }
    }
    if (!analysis.ok) {
      button.disabled = false
      status.textContent = analysis.error || 'Download failed.'
      return
    }
    // Use the listing's name, not whatever the bundle's manifest says - the
    // author may have renamed it when sharing.
    analysis.name = preset.name
    const detail = { analysis, handled: false }
    window.dispatchEvent(new CustomEvent('noctivago:open-preset-import', { detail }))
    if (!detail.handled) {
      button.disabled = false
      status.textContent = 'Could not open the import dialog.'
      return
    }
    this.pendingImportCard = { button, status }
    status.textContent = 'Review the sounds and confirm…'
  }

  handleImportFinished(result) {
    const pending = this.pendingImportCard
    if (!pending) return
    this.pendingImportCard = null
    pending.button.disabled = false
    if (result?.canceled) {
      pending.status.textContent = ''
    } else if (result?.ok) {
      const failed = result.failedCount ? `, ${result.failedCount} couldn't be added` : ''
      pending.status.textContent = `Imported (${plural(result.soundCount, 'sound')}${failed}). Open it from Presets.`
    } else {
      pending.status.textContent = result?.error || 'Import failed.'
    }
  }

  toggleReportForm(card, preset, status) {
    const existing = card.querySelector('.cm-report')
    if (existing) {
      existing.remove()
      return
    }
    const form = el('div', 'cm-report')
    const select = el('select', 'cm-field')
    for (const [value, label] of REPORT_REASONS) {
      const option = el('option', null, label)
      option.value = value
      select.appendChild(option)
    }
    const send = el('button', 'cm-b', 'Send report')
    send.type = 'button'
    send.addEventListener('click', async () => {
      send.disabled = true
      let result
      try {
        result = await this.api.community.report(preset.id, select.value)
      } catch (err) {
        result = { ok: false, error: err?.message }
      }
      form.remove()
      status.textContent = result.ok ? 'Thanks, reported.' : result.error || 'Report failed.'
    })
    form.append(select, send)
    card.appendChild(form)
  }

  // --- my uploads -----------------------------------------------------------

  async loadMine() {
    this.els.mineStatus.textContent = 'Loading…'
    this.els.mineResults.replaceChildren()
    let result
    try {
      result = await this.api.community.listMine()
    } catch (err) {
      result = { ok: false, error: err?.message }
    }
    if (!result.ok) {
      this.els.mineStatus.textContent = result.error || 'Could not load your uploads.'
      return
    }
    this.els.mineStatus.textContent =
      result.results.length === 0
        ? "You haven't shared any presets from this computer yet."
        : `${plural(result.results.length, 'preset')} shared from this computer.`
    for (const preset of result.results) this.els.mineResults.appendChild(this.renderCard(preset, { mine: true }))
  }

  async deleteUpload(preset, card, status) {
    if (!window.confirm(`Delete "${preset.name}" from the community? This can't be undone.`)) return
    status.textContent = 'Deleting…'
    let result
    try {
      result = await this.api.community.delete(preset.id)
    } catch (err) {
      result = { ok: false, error: err?.message }
    }
    if (!result.ok) {
      status.textContent = result.error || 'Delete failed.'
      return
    }
    card.remove()
    this.els.results.querySelector(`[data-id="${preset.id}"]`)?.remove()
    this.els.mineStatus.textContent = 'Deleted.'
  }

  // --- share ----------------------------------------------------------------

  async refreshLocalPresets() {
    try {
      this.localPresets = await this.api.presets.list()
    } catch {
      this.localPresets = []
    }
    const previous = this.els.sharePreset.value
    this.els.sharePreset.replaceChildren()
    for (const preset of this.localPresets) {
      const option = el('option', null, `${preset.name} (${plural(preset.sounds.length, 'sound')})`)
      option.value = preset.id
      this.els.sharePreset.appendChild(option)
    }
    if (this.localPresets.some((p) => p.id === previous)) this.els.sharePreset.value = previous
    if (!this.shareTarget && !this.els.shareName.value) {
      const selected = this.localPresets.find((p) => p.id === this.els.sharePreset.value)
      if (selected) this.els.shareName.value = selected.name
    }
    this.els.shareSubmit.disabled = this.publishing || this.localPresets.length === 0
  }

  // remote: a "My uploads" entry to replace, or null for a new share.
  setShareTarget(remote) {
    this.shareTarget = remote
    this.els.shareMode.hidden = !remote
    this.els.shareCancel.hidden = !remote
    this.els.shareSubmit.querySelector('span').textContent = remote ? 'Update' : 'Share'
    this.els.shareStatus.textContent = ''
    if (remote) {
      this.els.shareMode.textContent = `Updating "${remote.name}" - pick the local preset to upload in its place.`
      this.els.shareName.value = remote.name
      this.els.shareDescription.value = remote.description || ''
      this.els.shareTags.value = (remote.tags || []).join(', ')
    } else {
      this.els.shareName.value = ''
      this.els.shareDescription.value = ''
      this.els.shareTags.value = ''
    }
    this.els.shareRights.checked = false
    this.cutSet.clear()
    this.showShareSizes(null)
  }

  // fraction 0..1, or null to hide the bar.
  showShareProgress(fraction) {
    const bar = this.els.shareProgress
    bar.hidden = fraction === null
    if (fraction !== null) bar.firstElementChild.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`
  }

  // sounds from the app's progress/result, or null to hide the list.
  showShareSizes(sounds, { markHeaviest = false } = {}) {
    this.shareSounds = sounds
    this.shareMarkHeaviest = markHeaviest
    this.renderShareSizes()
  }

  renderShareSizes() {
    const list = this.els.shareSizes
    const rows = sizeRows(this.shareSounds, { markHeaviest: this.shareMarkHeaviest, cutSet: this.cutSet })
    list.hidden = rows.length === 0
    list.replaceChildren(
      ...rows.map((row) => {
        const item = el('li', row.heavy ? 'cm-size heavy' : 'cm-size')
        const name = el('span', 'cm-size-name-wrap')
        name.append(el('span', 'cm-size-name', row.name))
        // Offered only after a too-large attempt, when the sizes are known.
        if (row.canCut && this.shareMarkHeaviest && !this.publishing) {
          const btn = el('button', 'cm-b cm-ghost cm-sm', row.marked ? 'Undo cut' : 'Cut to 15 s')
          btn.type = 'button'
          btn.title = row.marked
            ? 'Upload the whole sound again'
            : 'Upload only 15 seconds from the middle of the part the preset plays. Your own copy stays as it is.'
          btn.addEventListener('click', () => this.toggleCut(row.index))
          name.append(btn)
        }
        item.append(name, el('span', 'cm-size-detail', row.detail))
        return item
      })
    )
  }

  toggleCut(index) {
    if (this.cutSet.has(index)) this.cutSet.delete(index)
    else this.cutSet.add(index)
    this.renderShareSizes()
    const total = estimateTotal(this.shareSounds, this.cutSet)
    if (total === null) return
    const fits = total <= this.maxUploadBytes
    const limit = formatSize(this.maxUploadBytes)
    this.els.shareStatus.textContent = fits
      ? `About ${formatSize(total)} now, under the ${limit} limit. Press ${this.els.shareSubmit.textContent.trim()} to upload.`
      : `About ${formatSize(total)} now; the limit is ${limit}. Cut or remove more sounds.`
  }

  async publish() {
    if (this.publishing) return
    const presetId = this.els.sharePreset.value
    const name = this.els.shareName.value.trim()
    const author = this.els.shareAuthor.value.trim()
    const status = this.els.shareStatus
    if (!presetId) return (status.textContent = 'Pick a preset to share.')
    if (!name) return (status.textContent = 'Give the preset a name.')
    if (!author) return (status.textContent = 'Add your name.')
    if (!this.els.shareRights.checked) return (status.textContent = 'Confirm you have the right to share these sounds.')

    this.publishing = true
    this.els.shareSubmit.disabled = true
    status.textContent = 'Preparing…'
    this.showShareProgress(0)
    this.showShareSizes(null)
    const stopProgress = this.api.community.onPublishProgress((update) => {
      if (update?.message) status.textContent = update.message
      if (Number.isFinite(update?.fraction)) this.showShareProgress(update.fraction)
      if (update?.sounds) this.showShareSizes(update.sounds)
    })
    let result
    try {
      result = await this.api.community.publish({
        presetId,
        remoteId: this.shareTarget?.id ?? null,
        name,
        author,
        description: this.els.shareDescription.value,
        tags: parseTags(this.els.shareTags.value),
        rightsConfirmed: true,
        cutSounds: [...this.cutSet]
      })
    } catch (err) {
      result = { ok: false, error: err?.message }
    } finally {
      stopProgress()
      this.publishing = false
      this.els.shareSubmit.disabled = false
      this.showShareProgress(null)
    }
    if (!result.ok) {
      status.textContent = result.error || 'Sharing failed.'
      if (result.sounds) this.showShareSizes(result.sounds, { markHeaviest: true })
      return
    }
    const wasUpdate = Boolean(this.shareTarget)
    this.cutSet.clear()
    this.setShareTarget(null)
    this.showShareSizes(result.sounds ?? null)
    const linked = result.freesoundCount ? `, ${result.freesoundCount} linked from Freesound` : ''
    status.textContent = `${wasUpdate ? 'Updated' : 'Shared'} "${result.preset.name}" (${plural(result.uploadedAudioCount, 'sound')} uploaded${linked}).`
    this.search()
  }
}
