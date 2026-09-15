class Campaign2Home {
  constructor(hub, campaign) {
    this.hub = hub;
    this.campaign = campaign;
    this.root = document.getElementById('campaign2Home');
    this.cache = {};
    this.heroes = (campaign?.fallbackHeroes || []).map(name => ({ name, _category: 'main_characters' }));
    this.activeHeroIndex = -1;
    this.heroLocked = false;
    this.heroSwapTimer = null;
    this.heroCloseTimer = null;
    this.heroHoverPaused = false;
    this.viewTransitionTimer = null;
    this.activeView = null;
    this.homeLoadPromise = null;
    this.built = false;
  }

  async mount() {
    if (!this.root || !this.campaign) return;
    if (!this.built) {
      this.root.innerHTML = this.shellMarkup();
      this.bindShell();
      this.renderRoster();
      this.activeView = this.root.querySelector('#c2HomeView');
      this.built = true;
    }

    if (!this.cache.main_characters || !this.cache.journal_recaps) {
      this.homeLoadPromise ||= this.loadHomeData().finally(() => {
        this.homeLoadPromise = null;
      });
      await this.homeLoadPromise;
    }
  }

  shellMarkup() {
    return `
      <div class="c2-desk">
        <nav class="c2-topbar" aria-label="Campaign navigation">
          <button class="c2-topbar-button" type="button" data-c2-action="nexus">← Nexus</button>
          <button class="c2-campaign-mark" type="button" data-c2-action="home" aria-label="Return to campaign home">
            <strong>${this.esc(this.campaign.name)}</strong>
          </button>
          <div class="c2-topbar-actions">
            <button class="c2-topbar-button" type="button" data-c2-archive="journal">Journal</button>
            <button class="c2-topbar-button" type="button" data-c2-archive="inventory">Inventory</button>
          </div>
        </nav>

        <div class="c2-folio-stack">
        <main class="c2-folio" id="c2HomeView">
          <header class="c2-folio-heading">
            <h1>COMPANY LEDGER</h1>
            <p>property of the Lamplighters</p>
          </header>

          <section class="c2-hero-stage" id="c2HeroStage" aria-labelledby="c2HeroHeading">
            <h2 class="c2-section-label" id="c2HeroHeading"><span>Members</span></h2>
            <div class="c2-roster" id="c2Roster">
              ${Array.from({ length: 5 }, (_, index) => `<div class="c2-portrait-skeleton" style="--delay:${index * 70}ms"></div>`).join('')}
            </div>
            <article class="c2-hero-record" id="c2HeroRecord" aria-live="polite"></article>
          </section>

          <section class="c2-dispatch" aria-labelledby="c2DispatchHeading">
            <div class="c2-dispatch-meta">
              <h2 id="c2DispatchHeading">Latest Dispatch</h2>
              <span class="c2-dispatch-date" id="c2DispatchDate" hidden></span>
            </div>
            <div class="c2-dispatch-title" id="c2LatestDispatchTitle"></div>
            <div class="c2-dispatch-copy" id="c2LatestDispatch">
              <p>Fetching dispatch…</p>
            </div>
            <button class="c2-ink-link" type="button" data-c2-archive="journal">Open full journal →</button>
          </section>

          <nav class="c2-ledger-index" aria-label="Archive">
            <button type="button" data-c2-archive="people"><strong>People</strong><small>Those who travel with the company, cross its path, or stand against it.</small></button>
            <button type="button" data-c2-archive="places"><strong>Places</strong><small>Regions, settlements, and sites that have entered the company record.</small></button>
            <button type="button" data-c2-archive="items"><strong>Items</strong><small>Equipment and recovered objects kept in the company’s charge.</small></button>
            <button type="button" data-c2-archive="world_info"><strong>World Info</strong><small>Intel gathered from across the world.</small></button>
          </nav>
        </main>

        <main class="c2-folio c2-archive-view" id="c2ArchiveView" hidden>
          <header class="c2-archive-heading">
            <button class="c2-ink-link" type="button" data-c2-action="home">← Company Ledger</button>
            <h1 id="c2ArchiveTitle">Archive</h1>
          </header>
          <div id="c2ArchiveContent" class="c2-archive-content"></div>
        </main>
        </div>
      </div>`;
  }

  bindShell() {
    this.root.addEventListener('click', event => {
      const action = event.target.closest('[data-c2-action]')?.dataset.c2Action;
      if (action === 'nexus') this.hub.showWorldSelection();
      if (action === 'home') this.showHome();

      const archive = event.target.closest('[data-c2-archive]')?.dataset.c2Archive;
      if (archive) this.openArchive(archive);

      const heroButton = event.target.closest('[data-c2-hero]');
      if (heroButton) this.activateHero(Number(heroButton.dataset.c2Hero), true);

      if (event.target.closest('[data-c2-close-hero]')) this.closeHero({ pauseHover: true });

      const articleButton = event.target.closest('[data-c2-article]');
      if (articleButton) this.showArticle(Number(articleButton.dataset.c2Article));
    });

    const stage = this.root.querySelector('#c2HeroStage');
    stage.addEventListener('pointerover', event => {
      const button = event.target.closest('[data-c2-hero]');
      if (button && !this.heroLocked && !this.heroHoverPaused) this.activateHero(Number(button.dataset.c2Hero), false);
    });
    stage.addEventListener('focusin', event => {
      const button = event.target.closest('[data-c2-hero]');
      if (button && !this.heroLocked) this.activateHero(Number(button.dataset.c2Hero), false);
    });
    stage.addEventListener('pointerleave', () => {
      this.heroHoverPaused = false;
      if (!this.heroLocked) this.closeHero();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.root.style.display !== 'none') this.closeHero({ pauseHover: true });
    });
  }

  async loadHomeData() {
    try {
      const rows = await this.loadSheets(['main_characters', 'journal_recaps']);
      this.heroes = rows.filter(row => row._category === 'main_characters');
      const recaps = rows.filter(row => row._category === 'journal_recaps');
      this.renderRoster();
      this.renderLatestDispatch(recaps);
    } catch (error) {
      if (!this.heroes.length) {
        this.root.querySelector('#c2Roster').innerHTML = '<p class="c2-empty-record">The members list could not be reached.</p>';
      }
      this.root.querySelector('#c2LatestDispatch').innerHTML = '<p>The journal could not be reached.</p>';
      Config.error('Campaign 2 home failed:', error);
    }
  }

  async loadSheets(sheetNames) {
    const missing = sheetNames.filter(sheet => !(sheet in this.cache));
    if (missing.length) {
      const response = await this.hub.jsonp(Config.getCampaignSheetUrl(this.campaign.id, missing));
      if (!response.success) throw new Error(response.error || 'The archive did not respond.');
      missing.forEach(sheet => { this.cache[sheet] = []; });
      (response.data || []).forEach(row => {
        if (row._category in this.cache) this.cache[row._category].push(row);
      });
    }
    return sheetNames.flatMap(sheet => this.cache[sheet] || []);
  }

  renderRoster() {
    const roster = this.root.querySelector('#c2Roster');
    if (!this.heroes.length) {
      roster.innerHTML = '<p class="c2-empty-record">No members have been entered in the register.</p>';
      return;
    }

    roster.innerHTML = this.heroes.map((hero, index) => `
      <button class="c2-hero-plate" type="button" data-c2-hero="${index}" aria-label="Read ${this.esc(this.displayName(hero.name))}'s entry">
        ${this.portraitMarkup(hero, 'c2-plate-image')}
        <span class="c2-plate-caption">
          <strong>${this.lineMarkup(this.displayName(hero.name))}</strong>
          ${this.heroRole(hero) ? `<small>${this.esc(this.heroRole(hero))}</small>` : ''}
        </span>
      </button>`).join('');
  }

  activateHero(index, lock) {
    const hero = this.heroes[index];
    if (!hero) return;
    const stage = this.root.querySelector('#c2HeroStage');
    const record = this.root.querySelector('#c2HeroRecord');

    window.clearTimeout(this.heroCloseTimer);
    this.heroHoverPaused = false;
    if (lock) this.heroLocked = true;

    // Pointer movement within one rail card must not replace the incoming page mid-fade.
    if (stage.classList.contains('hero-open') && this.activeHeroIndex === index) return;

    const isSideSwap = stage.classList.contains('hero-open') && this.activeHeroIndex !== index;
    this.activeHeroIndex = index;

    if (isSideSwap) {
      window.clearTimeout(this.heroSwapTimer);
      record.querySelectorAll('.c2-record-page:not(.is-active)').forEach(page => page.remove());
      const outgoing = record.querySelector('.c2-record-page.is-active');
      record.insertAdjacentHTML('beforeend', this.heroRecordMarkup(hero, index));
      const incoming = record.lastElementChild;
      void incoming?.offsetWidth;
      requestAnimationFrame(() => {
        outgoing?.classList.remove('is-active');
        incoming?.classList.add('is-active');
      });
      this.heroSwapTimer = window.setTimeout(() => outgoing?.remove(), 800);
      return;
    }

    record.innerHTML = this.heroRecordMarkup(hero, index);
    record.querySelector('.c2-record-page')?.classList.add('is-active');
    stage.classList.add('hero-open');
  }

  heroRecordMarkup(hero, index) {
    return `
      <div class="c2-record-page">
        <div class="c2-record-portrait">${this.portraitMarkup(hero, 'c2-record-image')}</div>
        <div class="c2-record-copy">
          <h3>${this.lineMarkup(this.displayName(hero.name))}</h3>
          ${this.heroMetaMarkup(hero)}
          <div class="c2-record-bio">${this.textMarkup(hero.summary, 'This entry has not yet been written.')}</div>
        </div>
        <nav class="c2-hero-rail" aria-label="Other company members">
          ${this.heroes.map((member, memberIndex) => `
            <button type="button" data-c2-hero="${memberIndex}" class="${memberIndex === index ? 'active' : ''}" aria-label="Read ${this.esc(this.displayName(member.name))}'s entry">
              ${this.portraitMarkup(member, 'c2-rail-image')}
              <span>${this.lineMarkup(this.displayName(member.name))}</span>
            </button>`).join('')}
        </nav>
      </div>`;
  }

  closeHero({ pauseHover = false } = {}) {
    window.clearTimeout(this.heroSwapTimer);
    window.clearTimeout(this.heroCloseTimer);
    this.heroLocked = false;
    this.activeHeroIndex = -1;
    this.heroHoverPaused = this.heroHoverPaused || pauseHover;
    const stage = this.root?.querySelector('#c2HeroStage');
    const record = this.root?.querySelector('#c2HeroRecord');
    stage?.classList.remove('hero-open');
    this.heroCloseTimer = window.setTimeout(() => {
      if (!stage?.classList.contains('hero-open')) record?.replaceChildren();
    }, 430);
  }

  renderLatestDispatch(recaps) {
    const container = this.root.querySelector('#c2LatestDispatch');
    const titleContainer = this.root.querySelector('#c2LatestDispatchTitle');
    const dispatchDate = this.root.querySelector('#c2DispatchDate');
    const latest = recaps[recaps.length - 1];
    if (!latest) {
      dispatchDate.hidden = true;
      titleContainer.replaceChildren();
      container.innerHTML = '<p>No dispatch has been entered yet.</p>';
      return;
    }
    const chapter = String(latest.chapter || '').trim();
    const date = String(latest.recap_date || '').trim();
    dispatchDate.innerHTML = this.lineMarkup(date);
    dispatchDate.hidden = !date;
    titleContainer.innerHTML = chapter ? `<h3 class="c2-journal-title">${this.lineMarkup(chapter)}</h3>` : '';
    container.innerHTML = `<div class="c2-dispatch-preview">${this.textMarkup(latest.entry, 'Entry awaiting transcription.')}</div>`;
  }

  async openArchive(key, writeHash = true) {
    const sheet = this.archiveSheet(key);
    if (!sheet) return;
    this.closeHero();
    this.root.querySelector('#c2ArchiveTitle').textContent = this.archiveTitle(key);
    const content = this.root.querySelector('#c2ArchiveContent');
    content.innerHTML = '<div class="c2-archive-loading">Opening the ledger…</div>';
    this.switchView('c2ArchiveView');
    if (writeHash) this.hub._setHash(`${this.campaign.id}/${key}`);

    try {
      const rows = await this.loadSheets([sheet]);
      this.renderArchive(key, rows.filter(row => row._category === sheet));
    } catch (error) {
      content.innerHTML = `<p class="c2-empty-record">${this.esc(error.message)}</p>`;
    }
  }

  showHome(writeHash = true) {
    this.closeHero();
    this.switchView('c2HomeView');
    if (writeHash) this.hub._setHash(this.campaign.id);
  }

  switchView(targetId) {
    const target = this.root.querySelector(`#${targetId}`);
    const current = this.activeView;
    if (!target || current === target) return;

    window.clearTimeout(this.viewTransitionTimer);
    target.hidden = false;
    target.setAttribute('aria-hidden', 'false');
    target.classList.remove('c2-view-leaving');
    target.classList.add('c2-view-entering');
    current?.setAttribute('aria-hidden', 'true');
    void target.offsetWidth;

    requestAnimationFrame(() => {
      target.classList.remove('c2-view-entering');
      current?.classList.add('c2-view-leaving');
    });

    this.activeView = target;
    this.viewTransitionTimer = window.setTimeout(() => {
      current?.classList.remove('c2-view-leaving');
      if (current) current.hidden = true;
    }, 360);
  }

  renderArchive(key, rows) {
    const content = this.root.querySelector('#c2ArchiveContent');
    this.currentArchiveRows = rows;
    if (!rows.length) {
      content.innerHTML = '<p class="c2-empty-record">No entries have been filed in this section.</p>';
      return;
    }

    if (key === 'journal') {
      content.innerHTML = `<div class="c2-journal-list">${rows.slice().reverse().map(row => `
        <article>
          ${row.chapter ? `<h2 class="c2-journal-title">${this.lineMarkup(row.chapter)}</h2>` : ''}
          ${row.recap_date ? `<span class="c2-journal-date">${this.lineMarkup(row.recap_date)}</span>` : ''}
          ${this.textMarkup(row.entry, 'Entry awaiting transcription.')}
          ${this.recapVoicesMarkup(row)}
        </article>`).join('')}</div>`;
      return;
    }

    const collection = this.campaign.collections?.[key];
    const groups = new Map();
    rows.forEach((row, index) => {
      const group = collection?.groupField
        ? (row[collection.groupField] || 'Unfiled')
        : (this.displayName(row.name).charAt(0).toUpperCase() || '#');
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ row, index });
    });

    content.innerHTML = `
      <div class="c2-archive-index">
        ${[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, entries]) => `
          <section>
            <h2>${this.lineMarkup(group)}</h2>
            <div>${entries.map(({ row, index }) => `<button type="button" data-c2-article="${index}">${this.lineMarkup(this.displayName(row.name || row.item || 'Untitled entry'))}</button>`).join('')}</div>
          </section>`).join('')}
      </div>
      <article class="c2-archive-article" id="c2ArchiveArticle">
        <p>Select an entry from the ledger.</p>
      </article>`;
  }

  showArticle(index) {
    const row = this.currentArchiveRows?.[index];
    const article = this.root.querySelector('#c2ArchiveArticle');
    if (!row || !article) return;
    const title = row.name || row.item || 'Untitled entry';
    const metaFields = this.campaign.collections?.[row._category]?.modalFields || [];
    const meta = metaFields.filter(field => row[field]).map(field => `<span><b>${this.esc(field.replace('_', ' '))}</b>${this.lineMarkup(row[field])}</span>`).join('');
    article.innerHTML = `
      <span class="c2-entry-kicker">Filed entry</span>
      <h2>${this.lineMarkup(this.displayName(title))}</h2>
      ${meta ? `<div class="c2-article-meta">${meta}</div>` : ''}
      <div>${this.textMarkup(row.content || row.summary || row.effect, 'This entry has not yet been written.')}</div>`;
    article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  recapVoicesMarkup(row) {
    const reserved = new Set(['_category', 'recap_date', 'chapter', 'entry']);
    const voices = Object.entries(row).filter(([field, value]) => !reserved.has(field) && String(value || '').trim());
    if (!voices.length) return '';
    return `<div class="c2-recap-voices">${voices.map(([field, value]) => `
      <section>
        <h3>${this.lineMarkup(this.displayName(field.replace(/_/g, ' ')))}</h3>
        ${this.textMarkup(value, '')}
      </section>`).join('')}</div>`;
  }

  archiveSheet(key) {
    const map = {
      journal: this.campaign.sheets.journalRecaps,
      inventory: this.campaign.sheets.inventory,
      people: this.campaign.sheets.people,
      places: this.campaign.sheets.places,
      items: this.campaign.sheets.items,
      world_info: this.campaign.sheets.worldInfo
    };
    return map[key] || null;
  }

  archiveTitle(key) {
    return ({
      journal: 'Journal',
      inventory: 'Inventory',
      people: 'People',
      places: 'Places',
      items: 'Items',
      world_info: 'World Information'
    })[key] || 'Archive';
  }

  portraitMarkup(hero, className) {
    const name = this.displayName(hero.name);
    const imageUrl = this.safeImageUrl(hero.image_url);
    const offset = Math.max(0, Math.min(100, Number.parseFloat(hero.image_offset) || 50));
    if (imageUrl) {
      return `<img class="${className}" src="${this.esc(imageUrl)}" alt="${this.esc(name)}" style="object-position:center ${offset}%">`;
    }
    const initials = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    return `<span class="${className} c2-portrait-empty" aria-hidden="true">${this.esc(initials || '—')}</span>`;
  }

  heroRole(hero) {
    return [hero.class, hero.species].filter(Boolean).join(' · ');
  }

  heroMetaMarkup(hero) {
    const fields = [
      ['Role', hero.class],
      ['People', hero.species],
      ['Age', hero.age]
    ].filter(([, value]) => value);
    if (!fields.length) return '';
    return `<div class="c2-record-meta">${fields.map(([label, value]) => `<span><b>${label}</b>${this.lineMarkup(value)}</span>`).join('')}</div>`;
  }

  textMarkup(value, fallback) {
    const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
    if (!text) return `<p class="c2-unwritten">${this.esc(fallback)}</p>`;
    return text.split(/\n{2,}/).map(paragraph => `<p>${this.esc(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  }

  lineMarkup(value) {
    return this.esc(String(value ?? '').replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
  }

  displayName(value) {
    return String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  safeImageUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
    } catch {
      return '';
    }
  }

  esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.Campaign2Home = Campaign2Home;
