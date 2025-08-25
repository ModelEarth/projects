class GitHubIssuesManager {
  constructor(containerId = 'issuesWidget', options = {}) {
    this.containerId = containerId;

    const container = document.getElementById(containerId);
    const config = this.parseConfiguration(container, options);

    this.githubToken = localStorage.getItem('github_token') || '';
    this.baseURL = 'https://api.github.com';
    this.owner = config.githubOwner;
    this.detectCurrentFolder = config.detectCurrentFolder;
    this.multiRepoRoots = config.multiRepoRoots;
    this.currentFolder = this.getCurrentFolder();
    this.defaultRepo = this.determineDefaultRepo();

    // pagination / state
    this.perPage = 10;
    this.currentPage = 1;
    this.currentView = 'list';
    this.isFullscreen = false;

    // data
    this.repositories = [];
    this.repositoryIssues = {};      // repo -> issues[]
    this.repositoryIssueCounts = {}; // repo -> {open, closed, total}
    this.allIssues = [];
    this.filteredIssues = [];
    this.assignees = new Set();
    this.labels = new Set();

    // perf + cache
    this.loadedAllRepositories = false;
    this.totalRepositoryCount = null;
    this.lastRefreshTime = null;
    this.rateLimitInfo = { remaining: null, resetTime: null, startTime: null };

    this.cacheConfig = {
      duration: parseInt(localStorage.getItem('github_cache_duration')) || 60, // minutes
      autoRefresh: localStorage.getItem('github_cache_auto_refresh') !== 'false'
    };
    this.cacheExpireTimer = null;

    // UX helpers
    this.searchDebounceTimer = null;
    this.searchDebounceDelay = 300;

    // filters
    this.filters = {
      repo: this.defaultRepo,
      sort: 'updated',
      assignee: 'all',
      state: 'open',
      label: 'all',
      search: ''
    };

    // request management
    this._abortController = null;
    this._autoRefreshTimer = null;

    // small concurrency limiter
    this.limit = (n = 5) => {
      let a = 0; const q = [];
      const run = async (fn) => {
        if (a >= n) await new Promise(r => q.push(r));
        a++;
        try { return await fn(); }
        finally { a--; const r = q.shift(); if (r) r(); }
      };
      return (fn) => run(fn);
    };
    this.repoLimiter = this.limit(6);     
    this.pageLimiter = this.limit(8);     
    this.countLimiter = this.limit(8);    

    this.init();
  }

  // ---------- utils ----------
  $(s, r=document){return r.querySelector(s);}
  $all(s, r=document){return [...r.querySelectorAll(s)];}
  on(el, ev, fn){el && el.addEventListener(ev, fn);}
  debounce(fn, wait=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait);};}

  parseConfiguration(container, options) {
    const config = {
      githubOwner: 'modelearth',
      detectCurrentFolder: true,
      multiRepoRoots: ['webroot', 'modelearth']
    };
    if (container) {
      if (container.dataset.githubOwner) config.githubOwner = container.dataset.githubOwner;
      if (container.dataset.detectCurrentFolder) config.detectCurrentFolder = container.dataset.detectCurrentFolder === 'true';
      if (container.dataset.multiRepoRoots) config.multiRepoRoots = container.dataset.multiRepoRoots.split(',').map(s=>s.trim());
    }
    return { ...config, ...options };
  }

  getCurrentFolder() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  }
  getHubPath() {
    const scripts = document.getElementsByTagName('script');
    for (let s of scripts) {
      if (s.src && s.src.includes('issues.js')) {
        const src = s.getAttribute('src');
        if (src?.startsWith('../js/')) return 'repos.csv';
        if (src === 'js/issues.js') return 'hub/repos.csv';
        break;
      }
    }
    return '../hub/repos.csv';
  }
  determineDefaultRepo() {
    if (!this.detectCurrentFolder) return 'projects';
    if (this.multiRepoRoots.includes(this.currentFolder)) return 'projects';
    return this.currentFolder || 'projects';
  }

  // ---------- UI  ----------
  createWidgetStructure() {
    const c = document.getElementById(this.containerId);
    if (!c) { console.error(`Container with id '${this.containerId}' not found`); return; }
    c.innerHTML = `
      ${this.createHeaderHTML()}
      <div id="rateLimitInfo" class="rate-limit-info" style="display:none;"></div>
      ${this.createLoadingOverlayHTML()}
      ${this.createFiltersHTML()}
      ${this.createIssuesContainerHTML()}
      ${this.createStatsHTML()}
      <div class="cache-status-section"><div id="cacheStatus" class="cache-status"><span class="cache-info">Cache: Loading...</span></div></div>
      ${this.createErrorHTML()}
      ${this.createModalHTML()}
    `;
  }

  createHeaderHTML() {
    return `
    <div class="issues-header">
      <i class="fas fa-expand header-fullscreen-btn" onclick="issuesManager.toggleFullscreen()" title="Toggle Fullscreen"></i>
      <div class="header-content">
        <h1 style="font-size:32px"><i class="fab fa-github"></i> Team Projects</h1>
        <p class="subtitle">
          <a href="#" id="toggleTokenSection" class="token-toggle-link" style="font-size:0.9rem;">Add Your GitHub Token</a>
          <span id="tokenBenefitText" style="font-size:0.9rem;"> to increase API rate limits from 60 to 5,000 requests per hour</span>
          <span id="headerLastRefreshTime" style="font-size:0.9rem;display:none;"> Issue counts last updated: <span id="headerRefreshTime">Never</span>.</span>
          <span id="gitAccountDisplay" style="font-size:0.9rem;display:none;"> GitHub: <a href="#" id="gitAccountLink" onclick="toggleGitIssuesAccount(); return false;"></a></span>
        </p>
        <p class="subtitle" style="margin-top:5px;">
          <input type="text" id="gitIssuesAccount" class="textInput" style="width:150px;font-size:14px;display:none;" placeholder="GitHub Account" onfocus="this.select()" oninput="updateGitIssuesAccount()">
        </p>
      </div>

      <div class="auth-section" id="authSection" style="display:none;">
        <div class="auth-input">
          <input type="password" id="githubToken" placeholder="Enter GitHub Personal Access Token (optional for public repos)">
          <button id="saveToken" class="btn btn-primary"><i class="fas fa-save"></i> Save Token</button>
          <button id="clearToken" class="btn btn-primary" style="display:none;">Clear</button>
        </div>
        <div class="auth-help">
          <i class="fas fa-info-circle"></i>
          <span><strong>Token Benefits:</strong> Access private repositories and higher rate limits.</span>
        </div>
        <div class="auth-instructions">
          <details>
            <summary>
              <span><i class="fas fa-question-circle"></i> How to create a GitHub token?</span>
              <a href="https://github.com/settings/tokens/new?description=ModelEarth+Projects+Hub&scopes=repo,read:org" target="_blank" class="token-link">
                <i class="fas fa-external-link-alt"></i> Get Your Token
              </a>
            </summary>
            <div class="instructions-content">
              <ol><li>Open token page</li><li>Select scopes repo & read:org</li><li>Generate</li><li>Paste & Save</li></ol>
              <p class="note"><i class="fas fa-shield-alt"></i><strong>Security:</strong> Stored locally in your browser only.</p>
            </div>
          </details>
        </div>
      </div>
    </div>`;
  }
  createLoadingOverlayHTML(){return `<div class="loading-overlay" id="loadingOverlay" style="display:none;"><div class="loading-spinner"><div class="spinner"></div><p>Loading GitHub data...</p><div class="loading-progress"><div class="progress-bar" id="progressBar"></div></div><p class="loading-status" id="loadingStatus">Fetching repositories...</p></div></div>`;}
  createFiltersHTML(){return `
    <div class="filters-always-visible">
      <div class="filter-group">
        <select id="repoFilter" class="filter-select">
          <option value="all">All Repositories</option>
        </select>
      </div>

      <div class="filter-group">
        <button id="assigneeButton" class="filter-button"><i class="fas fa-user"></i> Assigned to: All<i class="fas fa-chevron-down"></i></button>
        <div class="dropdown-menu" id="assigneeDropdown">
          <div class="dropdown-item" data-assignee="all"><i class="fas fa-users"></i> All Users</div>
          <div class="dropdown-item" data-assignee="unassigned"><i class="fas fa-user-slash"></i> Unassigned</div>
        </div>
      </div>

      <div class="filter-group">
        <button id="sortButton" class="filter-button"><i class="fas fa-sort"></i> Sort by: Updated<i class="fas fa-chevron-down"></i></button>
        <div class="dropdown-menu" id="sortDropdown">
          <div class="dropdown-item" data-sort="updated"><i class="fas fa-calendar-alt"></i> Updated Date</div>
          <div class="dropdown-item" data-sort="created"><i class="fas fa-plus"></i> Created Date</div>
          <div class="dropdown-item" data-sort="comments"><i class="fas fa-comments"></i> Comment Count</div>
          <div class="dropdown-item" data-sort="title"><i class="fas fa-sort-alpha-down"></i> Title (A–Z)</div>
          <div class="dropdown-item" data-sort="number"><i class="fas fa-hashtag"></i> Issue Number</div>
        </div>
      </div>

      <button id="toggleFiltersBtn" class="toggle-filters-btn" title="Toggle Additional Filters">
        <i class="fas fa-search"></i><span class="toggle-text">More Filters</span>
      </button>
      <button id="clearAllFiltersBtn" class="btn btn-secondary clear-filters-btn" style="display:none;">Clear</button>
    </div>

    <div class="filters-section" id="filtersSection" style="display:none;">
      <div class="filters-row filters-secondary-row additional-filters">
        <div class="filter-group">
          <button id="stateButton" class="filter-button"><i class="fas fa-exclamation-circle"></i> State: Open<i class="fas fa-chevron-down"></i></button>
          <div class="dropdown-menu" id="stateDropdown">
            <div class="dropdown-item" data-state="open"><i class="fas fa-exclamation-circle"></i> Open Issues</div>
            <div class="dropdown-item" data-state="closed"><i class="fas fa-check-circle"></i> Closed Issues</div>
            <div class="dropdown-item" data-state="all"><i class="fas fa-list"></i> All Issues</div>
          </div>
        </div>

        <div class="filter-group">
          <button id="labelButton" class="filter-button"><i class="fas fa-tags"></i> Labels: All<i class="fas fa-chevron-down"></i></button>
          <div class="dropdown-menu" id="labelDropdown">
            <div class="dropdown-item" data-label="all"><i class="fas fa-tags"></i> All Labels</div>
          </div>
        </div>
      </div>

      <div class="filters-row filters-tertiary-row">
        <div class="search-container">
          <div class="search-group">
            <input type="text" id="searchInput" placeholder="Search issues by title, body, or number...">
            <button id="searchButton" class="btn btn-primary"><i class="fas fa-search"></i></button>
            <button id="clearSearch" class="btn btn-clear-search" style="display:none;"><i class="fas fa-times"></i></button>
          </div>
        </div>
      </div>
    </div>`;}
  createIssuesContainerHTML(){return `
    <div class="issues-container" id="issuesContainer" style="display:none;">
      <div class="issues-header-bar">
        <div class="view-controls">
          <div class="view-toggle">
            <button id="listView" class="view-btn active" title="List View"><i class="fas fa-list"></i></button>
            <button id="rowView" class="view-btn" title="Row View"><i class="fas fa-align-justify"></i></button>
            <button id="cardView" class="view-btn" title="Card View"><i class="fas fa-th-large"></i></button>
          </div>
        </div>
      </div>
      <div id="issuesList"></div>
      <div class="pagination-container" id="paginationContainer">
        <div class="pagination-info"><span id="paginationInfo">Showing 0 of 0 issues</span></div>
        <div class="pagination-controls" id="paginationControls"></div>
      </div>
    </div>`;}
  createStatsHTML(){return `
    <div class="stats-section" id="statsSection" style="display:none;">
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-code-branch"></i></div><div class="stat-content"><div class="stat-number" id="repoCount">0</div><div class="stat-label">Repositories</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div><div class="stat-content"><div class="stat-number" id="openIssueCount">0</div><div class="stat-label">Open Issues</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-content"><div class="stat-number" id="closedIssueCount">0</div><div class="stat-label">Closed Issues</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-comments"></i></div><div class="stat-content"><div class="stat-number" id="totalComments">0</div><div class="stat-label">Comments</div></div></div>
    </div>`;}
  createErrorHTML(){return `
    <div class="error-message" id="errorMessage" style="display:none;">
      <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="error-content">
        <h3>Error Loading Issues</h3>
        <p id="errorText">Failed to load GitHub data. Please check your connection and try again.</p>
        <button id="retryButton" class="btn btn-primary"><i class="fas fa-redo"></i> Retry</button>
      </div>
    </div>`;}
  createModalHTML(){return `
    <div class="modal-overlay" id="issueModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modalTitle">Issue Details</h2>
          <button class="modal-close" id="modalClose"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>

    <div class="modal-overlay" id="refreshDialog" style="display:none;">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h2 id="refreshDialogTitle">Refresh Issue</h2>
          <button class="modal-close" id="refreshDialogClose"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p>Do you want to refresh this issue with the latest data from GitHub?</p>
          <div class="refresh-dialog-actions" style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-secondary" id="refreshDialogCancel">Cancel</button>
            <button class="btn btn-primary" id="refreshDialogConfirm"><i class="fas fa-sync-alt"></i> Refresh Issue</button>
          </div>
        </div>
      </div>
    </div>`;}

  // ---------- init & events ----------
  async init() {
    this.createWidgetStructure();
    this.setupEventListeners();
    this.setupMenuClickHandler();
    this.installHeaderHelpers();
    this.loadFromHash();
    this.loadFromCache();
    this.updateTokenUI();
    this.loadViewPreference();
    this.detectOwner();
    this.loadRateLimitFromCache();
    this.startRateLimitTimer();

    await this.loadData();

    if (this.githubToken) this.startAutoRefreshTimer();
  }

  detectOwner() {
    const hostname = window.location.hostname;
    if (hostname.includes('modelearth') || hostname.includes('model.earth')) {
      this.owner = 'modelearth';
    }
  }

  setupEventListeners() {
    this.on(this.$('#toggleTokenSection'), 'click', (e) => { e.preventDefault(); this.toggleTokenSection(); });
    this.on(this.$('#saveToken'), 'click', () => this.saveToken());
    this.on(this.$('#clearToken'), 'click', () => this.clearToken());

    this.on(this.$('#repoFilter'), 'change', async (e) => {
      const v = e.target.value;
      if (v === 'load_all') {
        await this.loadAllRepositories();
        e.target.value = this.filters.repo;
        return;
      }
      if (v === 'all' && !this.githubToken) {
        const remaining = this.rateLimitInfo.remaining || 60;
        const warning = `⚠️ Loading ALL repositories without a token may exhaust your remaining ${remaining} API requests.\n\nAdd a token for 5,000/hr.\n\nProceed?`;
        if (!confirm(warning)) { e.target.value = 'projects'; this.filters.repo = 'projects'; return; }
      }
      this.filters.repo = v;
      this.updateHash();
      this.saveToCache();

      if (this.filters.repo !== 'all' && !this.repositoryIssues[this.filters.repo]) {
        await this.loadIssuesForRepository(this.filters.repo);
        this.updateRepositoryDropdownCounts();
      } else if (this.filters.repo === 'all') {
        const unloaded = this.repositories.filter(r => !this.repositoryIssues[r.name]);
        // Load any unloaded repos, in parallel
        await Promise.all(unloaded.map(r => this.repoLimiter(() => this.loadIssuesForRepository(r.name))));
        this.updateRepositoryDropdownCounts();
      }
      this.filterAndDisplayIssues();
    });

    const setupDropdown = (buttonId, dropdownId, attr, update) => {
      const btn = this.$(`#${buttonId}`), dd = this.$(`#${dropdownId}`);
      this.on(btn, 'click', (e) => { e.stopPropagation(); this.closeAllDropdowns(); dd.classList.toggle('show'); });
      this.on(dd, 'click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        const value = item.getAttribute(attr);
        update(value);
        dd.classList.remove('show');
      });
      document.addEventListener('click', () => dd.classList.remove('show'));
    };

    setupDropdown('sortButton', 'sortDropdown', 'data-sort', (v) => { this.filters.sort = v; this.updateSortButton(); this.syncAndRefresh(); });
    setupDropdown('assigneeButton', 'assigneeDropdown', 'data-assignee', (v) => { this.filters.assignee = v; this.updateAssigneeButton(); this.syncAndRefresh(); });
    setupDropdown('stateButton', 'stateDropdown', 'data-state', (v) => { this.filters.state = v; this.updateStateButton(); this.syncAndRefresh(); });
    setupDropdown('labelButton', 'labelDropdown', 'data-label', (v) => { this.filters.label = v; this.updateLabelButton(); this.syncAndRefresh(); });

    const searchInput = this.$('#searchInput');
    const runSearch = () => { this.performSearch(); };
    this.on(this.$('#searchButton'), 'click', () => { runSearch(); this.loadData(true); });
    this.on(this.$('#clearSearch'), 'click', () => this.clearSearch());
    this.on(searchInput, 'keypress', (e) => { if (e.key === 'Enter') runSearch(); });
    this.on(searchInput, 'input', this.debounce((e) => { this.debouncedSearch(e.target.value); }, this.searchDebounceDelay));

    this.on(this.$('#clearAllFiltersBtn'), 'click', () => this.clearAllFilters());
    this.on(this.$('#toggleFiltersBtn'), 'click', () => this.toggleFilters());

    this.on(this.$('#listView'), 'click', () => this.setView('list'));
    this.on(this.$('#rowView'), 'click', () => this.setView('row'));
    this.on(this.$('#cardView'), 'click', () => this.setView('card'));

    this.on(this.$('#modalClose'), 'click', () => this.closeModal());
    this.on(this.$('#issueModal'), 'click', (e) => { if (e.target === this.$('#issueModal')) this.closeModal(); });

    this.on(this.$('#refreshDialogClose'), 'click', () => this.closeRefreshDialog());
    this.on(this.$('#refreshDialogCancel'), 'click', () => this.closeRefreshDialog());
    this.on(this.$('#refreshDialogConfirm'), 'click', () => this.confirmRefreshDialog?.());
    this.on(this.$('#refreshDialog'), 'click', (e) => { if (e.target === this.$('#refreshDialog')) this.closeRefreshDialog(); });

    this.on(this.$('#retryButton'), 'click', () => this.loadData(true));

    window.addEventListener('hashchange', () => this.loadFromHash());
    window.addEventListener('resize', () => this.updatePagination());
  }

  setupMenuClickHandler() {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.issue-actions-menu')) {
        this.$all('.issue-menu-dropdown').forEach(m => m.classList.remove('show'));
      }
    });
  }

  installHeaderHelpers() {
    window.toggleGitIssuesAccount = () => {
      const input = this.$('#gitIssuesAccount');
      input.style.display = (input.style.display === 'none' || !input.style.display) ? 'inline-block' : 'none';
      if (input.style.display === 'inline-block') input.focus();
    };
    window.updateGitIssuesAccount = () => {
      const val = (this.$('#gitIssuesAccount')?.value || '').trim();
      localStorage.setItem('git_issues_account', val);
      const link = this.$('#gitAccountLink');
      const wrap = this.$('#gitAccountDisplay');
      if (val) {
        wrap.style.display = 'inline';
        link.textContent = val;
        link.href = `https://github.com/${encodeURIComponent(val)}`;
      } else {
        wrap.style.display = 'none';
      }
    };
    const saved = localStorage.getItem('git_issues_account') || '';
    const input = this.$('#gitIssuesAccount');
    if (input) { input.value = saved; }
    window.updateGitIssuesAccount();
  }

  // ---------- Cache ----------
  loadFromCache() {
    try {
      const cached = localStorage.getItem('github_issues_cache');
      if (!cached) return null;
      const data = JSON.parse(cached);
      const maxAge = this.cacheConfig.duration * 60 * 1000;
      const cacheAge = Date.now() - data.timestamp;
      if (cacheAge > maxAge) return null;
      if (data.filters) this.filters = { ...this.filters, ...data.filters };
      if (this.cacheConfig.autoRefresh && this.githubToken) {
        this.setupCacheExpirationTimer(maxAge - cacheAge);
      }
      return data;
    } catch { return null; }
  }
  saveToCache() {
    const cacheData = { filters: this.filters, repositories: this.repositories, issues: this.allIssues, timestamp: Date.now() };
    localStorage.setItem('github_issues_cache', JSON.stringify(cacheData));
    if (this.cacheConfig.autoRefresh && this.githubToken) {
      this.setupCacheExpirationTimer(this.cacheConfig.duration * 60 * 1000);
    }
    this.updateCacheStatusDisplay();
  }
  loadRepositoryFromCache(repoName) {
    try {
      const key = `github_repo_${repoName}_cache`;
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      const data = JSON.parse(cached);
      const maxAge = this.cacheConfig.duration * 60 * 1000;
      const cacheAge = Date.now() - data.timestamp;
      if (cacheAge > maxAge) { localStorage.removeItem(key); return null; }
      return data;
    } catch { return null; }
  }
  saveRepositoryToCache(repoName, issues, meta, apiMeta, etag) {
    const key = `github_repo_${repoName}_cache`;
    localStorage.setItem(key, JSON.stringify({ issues, metadata: meta, apiMetadata: apiMeta, timestamp: Date.now(), etag: etag || null }));
  }
  clearRepositoryCache() {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('github_repo_') && k.endsWith('_cache')) localStorage.removeItem(k);
    });
  }

  // ---------- Rate limit UI ----------
  loadRateLimitFromCache() {
    try {
      const cached = localStorage.getItem('github_rate_limit_info');
      if (cached) {
        this.rateLimitInfo = JSON.parse(cached);
        if (this.rateLimitInfo.resetTime && new Date() > new Date(this.rateLimitInfo.resetTime)) this.clearRateLimit();
      }
    } catch {}
  }
  saveRateLimitToCache(){try{localStorage.setItem('github_rate_limit_info', JSON.stringify(this.rateLimitInfo));}catch{}}
  clearRateLimit(){this.rateLimitInfo={remaining:null,resetTime:null,startTime:null};localStorage.removeItem('github_rate_limit_info');this.updateRateLimitDisplay();}
  startRateLimitTimer(){if (this.rateLimitTimer) clearInterval(this.rateLimitTimer); this.rateLimitTimer=setInterval(()=>this.updateRateLimitDisplay(),60000);}
  updateRateLimitDisplay() {
    const box = this.$('#rateLimitInfo');
    if (!box) return;
    const { remaining, resetTime } = this.rateLimitInfo;
    if (remaining === null) { box.style.display = 'none'; return; }
    const reset = new Date(resetTime);
    const minutes = Math.max(0, Math.ceil((reset - new Date()) / 60000));
    const isLow = remaining < 100;
    const isLimited = remaining === 0 && minutes > 0;
    const showInfo = !this.githubToken && remaining <= 60;

    if ((isLow || isLimited) && minutes > 0) {
      box.innerHTML = `<div class="rate-limit-warning"><i class="fas fa-clock"></i>
        <div class="rate-limit-content"><div class="rate-limit-title">API Rate Limit Warning:</div>
        <div class="rate-limit-details">${remaining} requests remaining. Resets in ${minutes} minutes (${reset.toLocaleTimeString()})</div></div></div>`;
      box.style.display = 'block';
    } else if (showInfo) {
      box.innerHTML = `<div class="rate-limit-info-display"><i class="fas fa-info-circle"></i>
        <div class="rate-limit-content"><div class="rate-limit-title">API Rate Limit:</div>
        <div class="rate-limit-details">${remaining} requests remaining (no token). ${minutes>0?`Resets in ${minutes} minutes (${reset.toLocaleTimeString()})`:'Resets hourly'}</div></div></div>`;
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
    }
    this.updateTokenSectionUI();
  }

  // ---------- Data loading ----------
  async loadData(forceRefresh=false) {
    try {
      this.abortInFlight();                // cancel previous runs
      this._abortController = new AbortController();
      this.showLoading(true);
      this.hideError();

      if (!forceRefresh) {
        const cached = this.loadFromCache();
        if (cached?.repositories?.length && cached?.issues?.length) {
          this.repositories = cached.repositories;
          this.allIssues = cached.issues.map(i => ({ ...i, last_refreshed: i.last_refreshed || new Date().toISOString() }));
          this._rehydrateFacets(this.allIssues);
          this.updateUI();                 // render quickly from cache
          this.showLoading(false);
         // continue to async refresh in background (delay to keep UI snappy)
          setTimeout(() => this.refreshCountsIncrementally(), 5000);
          return;
        }
      }

      this.updateLoadingStatus('Loading repositories…');
      await this.loadRepositoriesToUI();

      // Load currently selected repo (or all) fast with parallelism
      if (this.filters.repo !== 'all') {
        this.updateLoadingStatus(`Loading issues: ${this.filters.repo}…`);
        await this.loadIssuesForRepository(this.filters.repo, false, true); // early render on first page
      } else {
  // Show one repo fast, then load the rest in background
  this.updateLoadingStatus(`Loading issues: ${this.defaultRepo}…`);
  await this.loadIssuesForRepository(this.defaultRepo, false, true); // early render on first page

  // Background load for "all repos" so UI is responsive
  setTimeout(() => this.loadIssuesForAllRepositories(true), 3000);
}

      this.updateUI();
      this.saveToCache();
      this.showLoading(false);

      // Kick off fast counts (open/closed) via Search API
      this.refreshCountsIncrementally();
    } catch (err) {
      console.error('Error loading data:', err);
      try {
        await this.loadRepositoriesToUI();
        this.showFiltersOnError();
      } catch (csvErr) {
        this.showError('Failed to load repository data: ' + csvErr.message);
      }
      this.showLoading(false);
    }
    setTimeout(() => this.refreshCountsIncrementally(), 3000);
  }

  async loadRepositoriesToUI() {
    let apiRepos = null;
    if (this.githubToken) {
      apiRepos = await this.loadRepositoriesFromGitHub(['projects']);
      this.loadedAllRepositories = false;
      try { this.totalRepositoryCount = await this.getRepositoryCount?.(); } catch {}
    } else {
      if (this.rateLimitInfo.remaining === null) {
        this.rateLimitInfo.remaining = 60;
        this.rateLimitInfo.resetTime = new Date(Date.now() + 60*60*1000);
        this.updateRateLimitDisplay();
      }
    }

    if (apiRepos?.length) {
      this.repositories = apiRepos.map(r => ({
        name: r.repo_name, displayName: r.display_name, description: r.description,
        defaultBranch: r.default_branch, openIssueCount: r.open_issues_count,
        totalIssueCount: null, repository_url: r.html_url || `https://github.com/${this.owner}/${r.repo_name}`
      }));
    } else {
      const csv = await this.loadRepositoriesFromCSV();
      if (!this.githubToken) {
        const proj = csv.find(r => r.repo_name === 'projects');
        this.repositories = proj ? [{
          name: proj.repo_name, displayName: proj.display_name, description: proj.description,
          defaultBranch: proj.default_branch, openIssueCount: null, totalIssueCount: null,
          repository_url: `https://github.com/${this.owner}/${proj.repo_name}`
        }] : [];
        this.loadedAllRepositories = false;
      } else {
        this.repositories = csv.map(c => ({
          name: c.repo_name, displayName: c.display_name, description: c.description,
          defaultBranch: c.default_branch, openIssueCount: null, totalIssueCount: null,
          repository_url: `https://github.com/${this.owner}/${c.repo_name}`
        }));
        this.loadedAllRepositories = true;
      }
    }

    // initial placeholder counts; fast Search counts will replace
    this.repositoryIssueCounts = Object.fromEntries(this.repositories.map(r => [r.name, {open: null, closed: null, total: null}]));
    this.populateRepositoryDropdown();
    this.updateHeaderRefreshDisplay();
  }

  async loadRepositoriesFromCSV() {
    try {
      const res = await fetch(this.getHubPath());
      if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
      const csvText = await res.text();
      const [head, ...rows] = csvText.trim().split('\n');
      const headers = head.split(',');
      return rows.map(r => {
        const vals = r.split(',');
        const o = {}; headers.forEach((h, i) => o[h] = vals[i]); return o;
      });
    } catch {
      return [{ repo_name: 'projects', display_name: 'Projects', description: 'Project showcases', default_branch: 'main' }];
    }
  }

  async loadRepositoriesFromGitHub(specific=null) {
    if (!this.githubToken) return null;
    const repos = [];
    if (specific) {
      for (const name of specific) {
        try {
          const repo = await this.apiRequest(`/repos/${this.owner}/${name}`);
          if (repo.has_issues && !repo.archived) {
            repos.push({
              repo_name: repo.name, display_name: repo.name, description: repo.description || '',
              default_branch: repo.default_branch || 'main', open_issues_count: repo.open_issues_count, html_url: repo.html_url
            });
          }
        } catch {}
      }
      return repos;
    }
    return null;
  }

  // ---------- Fast counts via Search API (total_count) ----------
  async refreshCountsIncrementally() {
    const now = Date.now();
    const cached = localStorage.getItem('repo_issue_counts');
    const cacheTime = localStorage.getItem('repo_issue_counts_time');
    if (cached && cacheTime && (now - parseInt(cacheTime)) < 5*60*1000) {
      // fresh enough
      this.repositoryIssueCounts = JSON.parse(cached);
      this.lastRefreshTime = new Date(parseInt(cacheTime));
      this.populateRepositoryDropdown();
      this.updateHeaderRefreshDisplay();
      this.updateStats();
      return;
    }

    const tasks = this.repositories.map(r => this.countLimiter(async () => {
      const [open, closed] = await Promise.all([
        this.getRepoIssueCountFast(r.name, 'open'),
        this.getRepoIssueCountFast(r.name, 'closed'),
      ]);
      this.repositoryIssueCounts[r.name] = { open, closed, total: open + closed };
      // update dropdown label incrementally
      this.updateRepositoryDropdownCounts();
    }));
    await Promise.all(tasks);
    this.lastRefreshTime = new Date();
    localStorage.setItem('repo_issue_counts', JSON.stringify(this.repositoryIssueCounts));
    localStorage.setItem('repo_issue_counts_time', Date.now().toString());
    this.updateHeaderRefreshDisplay();
  }

  async getRepoIssueCountFast(repoName, state='open') {
    // GitHub Search API: /search/issues?q=repo:owner/repo+type:issue+state:open
    try {
      const url = `${this.baseURL}/search/issues?q=repo:${encodeURIComponent(this.owner)}/${encodeURIComponent(repoName)}+type:issue+state:${encodeURIComponent(state)}&per_page=1`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json', ...(this.githubToken && { 'Authorization': `token ${this.githubToken}` }) },
        signal: this._abortController?.signal
      });
      if (!res.ok) return 0;
      const json = await res.json();
      return Math.max(0, parseInt(json.total_count || 0, 10));
    } catch { return 0; }
  }

  // ---------- Issues loading ----------
  async loadIssuesForAllRepositories(earlyRender=false) {
    // parallel per repo
    const tasks = this.repositories.map(r => this.repoLimiter(() => this.loadIssuesForRepository(r.name, false, earlyRender)));
    await Promise.all(tasks);
  }

  async loadIssuesForRepository(repoName, forceRefresh=false, earlyRender=false) {
    if (!forceRefresh && this.repositoryIssues[repoName]?.length) return this.repositoryIssues[repoName];

    // try cached bundle (with ETag)
    const cached = this.loadRepositoryFromCache(repoName);
    const etag = cached?.etag || null;

    try {
      const { issues, apiResponse, newEtag } = await this.fetchRepositoryIssuesPaged(repoName, etag, earlyRender);

      // merge into global lists
      this.repositoryIssues[repoName] = issues;
      const existingIds = new Set(this.allIssues.map(i => i.id));
      const fresh = issues.filter(i => !existingIds.has(i.id));
      fresh.forEach(i => { if (!i.last_refreshed) i.last_refreshed = new Date().toISOString(); });
      this.allIssues.push(...fresh);

      // facets
      this._rehydrateFacets(issues);
      this.populateAssigneeFilter();
      this.populateLabelFilter();

      // counts (fallback if search counts not done yet)
      const repoObj = this.repositories.find(r => r.name === repoName);
if (repoObj) {
  const openCount = issues.filter(i => i.state === 'open').length;
  const closedCount = issues.filter(i => i.state === 'closed').length;

  // keep per-repo object up to date
  repoObj.openIssueCount = openCount;
  repoObj.totalIssueCount = issues.length;

  // NEW: also fill the dropdown counts source immediately
  this.repositoryIssueCounts[repoName] = {
    open: openCount,
    closed: closedCount,
    total: openCount + closedCount
  };

  // Update the dropdown text right away
  this.updateRepositoryDropdownCounts();
}

      // cache
      this.saveRepositoryToCache(repoName, issues, {
        openIssueCount: repoObj ? repoObj.openIssueCount : 0,
        totalIssueCount: repoObj ? repoObj.totalIssueCount : 0
      }, apiResponse, newEtag);

      // update selection if viewing this repo
      if (this.filters.repo === repoName || this.filters.repo === 'all') {
        if (earlyRender) this.filterAndDisplayIssues(); // incremental UI
      }

      return issues;
    } catch (e) {
      if (e.name === 'AbortError') return [];
      console.error(`Failed to load issues for ${repoName}:`, e);
      this.showNotification(`Failed to load issues for ${repoName}`, 'error');
      // fall back to cache if available
      if (cached?.issues?.length) {
        this.repositoryIssues[repoName] = cached.issues;
        this._rehydrateFacets(cached.issues);
        return cached.issues;
      }
      return [];
    }
  }

  async fetchRepositoryIssuesPaged(repoName, etag=null, earlyRender=false) {
    // Pull pages in parallel with a rolling window until <100 items returned
    const issues = [];
    let page = 1;
    let keepGoing = true;
    let lastMeta = null;
    let newEtag = null;

    // First hit to check 304 w/ ETag
    const first = await this.apiRequestWithMetadata(`/repos/${this.owner}/${repoName}/issues?state=all&per_page=100&page=${page}`, etag);
    lastMeta = first.metadata;
    newEtag = first.etag || null;

    if (first.status === 304) {
      // Use cache; our caller already has it
      return { issues: this.loadRepositoryFromCache(repoName)?.issues || [], apiResponse: lastMeta, newEtag };
    }

    const firstBatch = (first.data || []).filter(i => !i.pull_request).map(i => this._normalizeIssue(i, repoName));
    issues.push(...firstBatch);

    if (earlyRender && issues.length && (this.filters.repo === repoName || this.filters.repo === 'all')) {
      // show something fast
      const before = this.filteredIssues.length;
      this.allIssues.push(...firstBatch);
      this._rehydrateFacets(firstBatch);
      this.filterAndDisplayIssues();
      if (this.filteredIssues.length !== before) this.updatePagination();
    }

    if (firstBatch.length < 100) keepGoing = false;
    page++;

    // Queue more pages with a concurrency limiter
    const runners = [];
    while (keepGoing) {
      const p = page;
      runners.push(this.pageLimiter(async () => {
        const res = await this.apiRequestWithMetadata(`/repos/${this.owner}/${repoName}/issues?state=all&per_page=100&page=${p}`);
        lastMeta = res.metadata;
        const batch = (res.data || []).filter(i => !i.pull_request).map(i => this._normalizeIssue(i, repoName));
        issues.push(...batch);
        if (batch.length < 100) keepGoing = false;
      }));
      page++;
      // stop scheduling too far ahead if keepGoing flips to false
      if (!keepGoing) break;
      if (runners.length >= 4) { // rolling window of 4 pages at a time
        await Promise.all(runners.splice(0, runners.length));
      }
    }
    if (runners.length) await Promise.all(runners);
    return { issues, apiResponse: lastMeta, newEtag };
  }

  _normalizeIssue(i, repoName) {
    i.repository = repoName;
    i.repository_url = `https://github.com/${this.owner}/${repoName}`;
    i.last_refreshed = new Date().toISOString();
    return i;
  }
  _rehydrateFacets(list) {
    list.forEach(issue => {
      issue.assignees?.forEach(a => this.assignees.add(a.login));
      issue.labels?.forEach(l => this.labels.add(l.name));
    });
  }

  async apiRequest(path) {
    const res = await fetch(`${this.baseURL}${path}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', ...(this.githubToken && { 'Authorization': `token ${this.githubToken}` }) },
      signal: this._abortController?.signal
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    this._recordRateLimit(res);
    return res.json();
  }

  async apiRequestWithMetadata(path, etag=null) {
    const res = await fetch(`${this.baseURL}${path}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(etag ? { 'If-None-Match': etag } : {}),
        ...(this.githubToken && { 'Authorization': `token ${this.githubToken}` })
      },
      signal: this._abortController?.signal
    });
    if (res.status === 304) {
      this._recordRateLimit(res);
      return { data: null, metadata: this._extractMeta(res), status: 304, etag: etag || null };
    }
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    this._recordRateLimit(res);
    return { data, metadata: this._extractMeta(res), status: res.status, etag: res.headers.get('ETag') };
  }

  _extractMeta(res) {
    return {
      remaining: parseInt(res.headers.get('X-RateLimit-Remaining') || '0', 10),
      reset: res.headers.get('X-RateLimit-Reset') ? new Date(parseInt(res.headers.get('X-RateLimit-Reset'), 10) * 1000) : null
    };
  }
  _recordRateLimit(res) {
    const remaining = res.headers.get('X-RateLimit-Remaining');
    const reset = res.headers.get('X-RateLimit-Reset');
    if (remaining !== null) {
      this.rateLimitInfo.remaining = parseInt(remaining, 10);
      if (reset) this.rateLimitInfo.resetTime = new Date(parseInt(reset, 10) * 1000);
      this.saveRateLimitToCache();
      this.updateRateLimitDisplay();
    }
  }

  abortInFlight() {
    try { this._abortController?.abort(); } catch {}
  }

  // ---------- UI helpers ----------
  showLoading(show) {
    const container = this.$('#issuesContainer');
    const list = this.$('#issuesList');
    const overlay = this.$('#loadingOverlay');
    if (show) {
      container.style.display = 'block';
      list.innerHTML = `
        <div class="loading-content">
          <div class="spinner"></div>
          <p>Loading GitHub data.</p>
          <div class="loading-progress"><div class="progress-bar" id="progressBar" style="width:0%;"></div></div>
          <p class="loading-status" id="loadingStatus">Fetching repositories.</p>
        </div>`;
      overlay.style.display = 'none';
    } else {
      overlay.style.display = 'none';
    }
  }
  updateLoadingStatus(status){const el=this.$('#loadingStatus'); if(el) el.textContent=status;}
  showError(message){
    this.$('#errorMessage').style.display='block';
    this.$('#errorText').textContent=message;
    this.$('#filtersSection').style.display='none';
    this.$('#statsSection').style.display='none';
    this.$('#issuesContainer').style.display='none';
  }
  hideError(){this.$('#errorMessage').style.display='none';}

  showNotification(message, type='info'){
    const isLoading = message.toLowerCase().includes('loading');
    if (isLoading) this.showInlineNotification(message, type);
    else this.showFloatingNotification(message, type);
  }
  showInlineNotification(message, type='info'){
    const container=this.$('#issuesContainer'); const list=this.$('#issuesList');
    if(!container||!list) return;
    container.style.display='block';
    const box=document.createElement('div'); box.className=`inline-notification ${type}`;
    const isLoading=message.toLowerCase().includes('loading');
    const icon=isLoading?'<div class="spinner tiny"></div>':'<i class="fas fa-info-circle"></i>';
    box.innerHTML=`${icon}<span>${message}</span>`;
    list.prepend(box);
    setTimeout(()=>box.remove(), isLoading?1200:2500);
  }
  showFloatingNotification(message, type='info'){
    let host=this.$('.floating-notify-host');
    if(!host){host=document.createElement('div'); host.className='floating-notify-host'; document.body.appendChild(host);}
    const n=document.createElement('div'); n.className=`toast ${type}`; n.innerHTML=`<span>${message}</span>`;
    host.appendChild(n); setTimeout(()=>n.remove(),2500);
  }

  updateCacheStatusDisplay(){
    const el=this.$('#cacheStatus'); if(!el) return;
    const cached=localStorage.getItem('github_issues_cache');
    if(!cached){el.innerHTML='<span class="cache-info">Cache: Empty</span>'; return;}
    try{
      const data=JSON.parse(cached);
      const ageMin=Math.round((Date.now()-data.timestamp)/60000);
      const remain=Math.max(0,this.cacheConfig.duration-ageMin);
      el.innerHTML=`<span class="cache-info">Cache: ${ageMin}m old, expires in ${remain}m (${this.cacheConfig.duration}m duration) ${this.cacheConfig.autoRefresh ? '• Auto-refresh enabled' : '• Auto-refresh disabled'}</span>`;
    }catch{el.innerHTML='<span class="cache-info">Cache: Invalid</span>';}
  }

  setupCacheExpirationTimer(ms){
    if(!this.githubToken) return;
    if(this.cacheExpireTimer) clearTimeout(this.cacheExpireTimer);
    this.cacheExpireTimer=setTimeout(()=>this.loadData(true), ms);
  }

  updateTokenUI(){
    const input=this.$('#githubToken'); const clearBtn=this.$('#clearToken');
    if(this.githubToken){ input.value='••••••••••••••••'; clearBtn.style.display='inline-block'; }
    else { input.value=''; clearBtn.style.display='none'; }
  }
  toggleTokenSection(){
    const sec=this.$('#authSection');
    sec.style.display=(sec.style.display==='none'||!sec.style.display)?'block':'none';
  }
  updateTokenSectionUI(){
    const link=this.$('#toggleTokenSection');
    const benefit=this.$('#tokenBenefitText');
    const headerRefresh=this.$('#headerLastRefreshTime');
    if(this.githubToken){
      link.textContent='Change or Remove your Github Token';
      let text=' The token has increased your API rate limits from 60 to 5,000 requests per hour';
      if(this.rateLimitInfo.remaining!==null && this.rateLimitInfo.resetTime){
        const t=new Date(this.rateLimitInfo.resetTime).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true});
        text += `. ${this.rateLimitInfo.remaining} requests remaining before ${t}`;
      } else if(this.rateLimitInfo.remaining!==null){
        text += `. ${this.rateLimitInfo.remaining} requests remaining`;
      }
      benefit.textContent=text;
      if(headerRefresh) headerRefresh.style.display='inline';
    } else {
      link.textContent='Add Your GitHub Token';
      benefit.textContent=' to increase API rate limits from 60 to 5,000 requests per hour';
      if(headerRefresh) headerRefresh.style.display='none';
    }
    this.updateHeaderRefreshDisplay();
  }

  async saveToken(){
    const tokenInput=this.$('#githubToken');
    const token=tokenInput.value.trim();
    if(token && token!=='••••••••••••••••'){
      this.githubToken=token;
      localStorage.setItem('github_token', token);
      localStorage.removeItem('github_issues_cache');
      localStorage.removeItem('github_all_repos');
      localStorage.removeItem('github_all_repos_time');
      this.clearRepositoryCache();
      this.clearRateLimit();
      this.showNotification('Token saved successfully','success');
      await this.refreshIssuesAfterTokenSave();
      try { await this.loadRepositoriesToUI(); this.populateRepositoryDropdown(); } catch {}
    }
    this.updateTokenUI();
    this.updateTokenSectionUI();
    this.$('#authSection').style.display='none';
  }

  async refreshIssuesAfterTokenSave(){
    try{
      const issuesList=this.$('#issuesList');
      const errorMsg=this.$('#errorMessage');
      const hasErrorDisplay=errorMsg && errorMsg.style.display!=='none';
      const hasRateLimitError=issuesList?.innerHTML?.match(/rate limit|no-issues|API Rate Limit/i) || hasErrorDisplay || this.allIssues.length===0;
      const wasRateLimited=this.rateLimitInfo.remaining===0 || localStorage.getItem('github_rate_limit_exceeded')==='true';
      const hasNoRepoData=this.repositories.length===0;
      if(hasRateLimitError || wasRateLimited || hasNoRepoData){
        this.showNotification('Refreshing issues with new token…','info');
        localStorage.removeItem('github_rate_limit_exceeded');
        await this.loadData(true);
        this.showNotification('Issues refreshed successfully!','success');
      }
    }catch{
      this.showNotification('Issues refreshed, but some data may still be loading','warning');
    }
  }

  clearToken(){
    if(!confirm('Clear your GitHub token? This will reduce API rate limits to 60/hr and clear cached issue data.')) return;
    this.githubToken='';
    localStorage.removeItem('github_token');
    localStorage.removeItem('github_issues_cache');
    this.clearRepositoryCache();
    this.updateTokenUI();
    this.updateTokenSectionUI();
    this.showNotification('GitHub token cleared successfully','info');
    this.$('#authSection').style.display='none';
  }

  // ---------- Filters / Search / View ----------
  setView(viewType, savePreference=true){
    this.currentView=viewType;
    this.$all('.view-btn').forEach(b=>b.classList.remove('active'));
    const btn=this.$(`#${viewType}View`); if(btn) btn.classList.add('active');
    const list=this.$('#issuesList'); if(list) list.className=`issues-list ${viewType}-view`;
    if(savePreference) this.saveViewPreference();
    this.updateHash();
  }
  saveViewPreference(){localStorage.setItem('github_issues_view', this.currentView);}
  loadViewPreference(){
    const v=localStorage.getItem('github_issues_view');
    if(v && (v==='list'||v==='card'||v==='row')) this.setView(v,false);
  }
  toggleFullscreen(){
    const c=document.getElementById(this.containerId); if(!c) return;
    this.isFullscreen=!this.isFullscreen;
    if(this.isFullscreen){
      c.classList.add('widget-fullscreen'); document.body.classList.add('widget-fullscreen-active');
      const header=this.$('.issues-header');
      if(header && !header.querySelector('.minimize-btn')){
        const b=document.createElement('button'); b.className='minimize-btn'; b.innerHTML='<i class="fas fa-compress"></i>'; b.title='Exit Fullscreen';
        b.onclick=()=>this.toggleFullscreen(); header.appendChild(b);
      }
    } else {
      c.classList.remove('widget-fullscreen'); document.body.classList.remove('widget-fullscreen-active');
      const b=this.$('.minimize-btn'); if(b) b.remove();
    }
    this.updatePagination();
  }
  toggleFilters(){
    const sec=this.$('#filtersSection');
    const btn=this.$('.toggle-filters-btn');
    const label=this.$('.toggle-text');
    if(!sec) return;
    const isHidden=!sec.classList.contains('show-filters');
    if(isHidden){ sec.classList.add('show-filters'); btn?.classList.add('active'); if(label) label.textContent='Hide Filters'; sec.style.display='block'; }
    else { sec.classList.remove('show-filters'); btn?.classList.remove('active'); if(label) label.textContent='More Filters'; sec.style.display='none'; }
  }

  updateSortButton(){
    const b=this.$('#sortButton');
    const map={updated:'Updated', created:'Created', comments:'Comments', title:'Title (A–Z)', number:'Issue Number'};
    if(b) b.innerHTML=`<i class="fas fa-sort"></i> Sort by: ${map[this.filters.sort]||'Updated'} <i class="fas fa-chevron-down"></i>`;
  }
  updateAssigneeButton(){
    const b=this.$('#assigneeButton');
    const text=this.filters.assignee==='all'?'All':(this.filters.assignee==='unassigned'?'Unassigned':this.filters.assignee);
    if(b) b.innerHTML=`<i class="fas fa-user"></i> Assigned to: ${text} <i class="fas fa-chevron-down"></i>`;
  }
  updateStateButton(){
    const b=this.$('#stateButton');
    const map={open:'Open', closed:'Closed', all:'All'};
    if(b) b.innerHTML=`<i class="fas fa-exclamation-circle"></i> State: ${map[this.filters.state]||'Open'} <i class="fas fa-chevron-down"></i>`;
  }
  updateLabelButton(){
    const b=this.$('#labelButton');
    const text=this.filters.label==='all'?'All':this.filters.label;
    if(b) b.innerHTML=`<i class="fas fa-tags"></i> Labels: ${text} <i class="fas fa-chevron-down"></i>`;
  }

  clearAllFilters(){
    if(this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.filters.sort='updated';
    this.filters.assignee='all';
    this.filters.state='open';
    this.filters.label='all';
    this.updateSortButton(); this.updateAssigneeButton(); this.updateStateButton(); this.updateLabelButton();
    this.currentPage=1; this.updateHash(); this.saveToCache(); this.filterAndDisplayIssues();
    this.showNotification('Filter buttons cleared','info');
    this.updateClearAllFiltersVisibility();
  }
  updateClearAllFiltersVisibility(){
    const btn=this.$('#clearAllFiltersBtn'); if(!btn) return;
    const defaults={sort:'updated', assignee:'all', state:'open', label:'all'};
    const changed=Object.keys(defaults).some(k=>this.filters[k]!==defaults[k]);
    btn.style.display=changed?'inline-block':'none';
  }

  performSearch(){
    const v=this.$('#searchInput')?.value?.trim()||'';
    this.filters.search=v;
    this.currentPage=1;
    this.updateHash();
    this.saveToCache();
    this.filterAndDisplayIssues();
    this.$('#clearSearch').style.display=v?'inline-block':'none';
  }
  debouncedSearch(v){
    this.filters.search=v.trim();
    this.currentPage=1;
    this.updateHash();
    this.saveToCache();
    this.filterAndDisplayIssues();
    this.$('#clearSearch').style.display=v?'inline-block':'none';
  }
  clearSearch(){
    const input=this.$('#searchInput'); if(input) input.value='';
    this.filters.search='';
    this.currentPage=1;
    this.updateHash();
    this.saveToCache();
    this.filterAndDisplayIssues();
    this.$('#clearSearch').style.display='none';
  }

  // ---------- URL hash sync ----------
  loadFromHash() {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const get = (k, d) => params.get(k) ?? d;

    this.filters.repo = get('repo', this.filters.repo);
    this.filters.state = get('state', this.filters.state);
    this.filters.sort = get('sort', this.filters.sort);
    this.filters.assignee = get('assignee', this.filters.assignee);
    this.filters.label = get('label', this.filters.label);
    this.filters.search = get('q', this.filters.search);
    this.currentPage = parseInt(get('page', String(this.currentPage)), 10) || 1;
    const view = get('view', this.currentView);

    const repoSel = this.$('#repoFilter'); if (repoSel) repoSel.value = this.filters.repo;
    const searchInput = this.$('#searchInput'); if (searchInput) searchInput.value = this.filters.search;
    this.updateSortButton(); this.updateAssigneeButton(); this.updateStateButton(); this.updateLabelButton();
    this.setView(view, false);
  }

  updateHash() {
    const p = new URLSearchParams();
    p.set('repo', this.filters.repo);
    if (this.filters.state !== 'open') p.set('state', this.filters.state);
    if (this.filters.sort !== 'updated') p.set('sort', this.filters.sort);
    if (this.filters.assignee !== 'all') p.set('assignee', this.filters.assignee);
    if (this.filters.label !== 'all') p.set('label', this.filters.label);
    if (this.filters.search) p.set('q', this.filters.search);
    if (this.currentPage > 1) p.set('page', String(this.currentPage));
    if (this.currentView !== 'list') p.set('view', this.currentView);
    const s = p.toString();
    const newHash = s ? `#${s}` : '';
    if (newHash !== window.location.hash) window.history.replaceState(null, '', newHash);
  }

  // ---------- Rendering ----------
  updateUI() {
    this.populateRepositoryDropdown();
    this.populateAssigneeFilter();
    this.populateLabelFilter();
    this.filterAndDisplayIssues();
    this.updateClearAllFiltersVisibility();
    this.$('#issuesContainer').style.display = 'block';
    this.updateStats();
  }

  // Back-compat alias
  updateRepositoryDropdown(){ this.populateRepositoryDropdown(); }

  populateRepositoryDropdown() {
    const select = this.$('#repoFilter'); if (!select) return;
    const current = this.filters.repo || 'projects';
    select.innerHTML = `<option value="all">All Repositories</option>`;
    for (const r of this.repositories) {
      const opt = document.createElement('option');
      opt.value = r.name; opt.textContent = r.displayName || r.name;
      select.appendChild(opt);
    }
    if (this.githubToken && !this.loadedAllRepositories) {
      const opt = document.createElement('option'); opt.value = 'load_all'; opt.textContent = 'Load All Repos…'; select.appendChild(opt);
    }
    select.value = current;
    this.updateRepositoryDropdownCounts();
  }

  updateRepositoryDropdownCounts() {
  const select = this.$('#repoFilter');
  if (!select) return;

  this.$all('option', select).forEach(o => {
    const repoName = o.value;
    if (repoName === 'all' || repoName === 'load_all') return;

    const repo = this.repositories.find(r => r.name === repoName);
    const display = repo?.displayName || repo?.name || repoName;
    const cnt = this.repositoryIssueCounts[repoName];

    // Prefer Search API counts if present, otherwise fall back to per-repo openIssueCount
    if (cnt && cnt.open != null) {
      o.textContent = `${display} (${cnt.open})`;
      o.title = `Open: ${cnt.open}${cnt.closed != null ? ` • Closed: ${cnt.closed}` : ''}`;
    } else if (repo && repo.openIssueCount != null) {
      o.textContent = `${display} (${repo.openIssueCount})`;
      o.title = `Open (from loaded issues): ${repo.openIssueCount}${repo.totalIssueCount != null ? ` • Total: ${repo.totalIssueCount}` : ''}`;
    } else if (repoName === 'projects') {
      o.textContent = `${display} (?)`;
      o.title = 'Issue count unknown yet';
    } else {
      o.textContent = display; // no info yet
      o.title = 'Counting…';
    }
  });
}


  async loadAllRepositories() {
    try {
      const csv = await this.loadRepositoriesFromCSV();
      this.repositories = csv.map(c => ({
        name: c.repo_name, displayName: c.display_name, description: c.description,
        defaultBranch: c.default_branch, openIssueCount: null, totalIssueCount: null,
        repository_url: `https://github.com/${this.owner}/${c.repo_name}`
      }));
      this.loadedAllRepositories = true;
      this.populateRepositoryDropdown();
      this.refreshCountsIncrementally();
      this.showNotification('Loaded all repositories list', 'success');
    } catch (e) {
      console.error(e);
      this.showNotification('Failed to load full repository list', 'error');
    }
  }

  populateAssigneeFilter() {
    const menu = this.$('#assigneeDropdown'); if (!menu) return;
    menu.querySelectorAll('.dropdown-item[data-user]').forEach(n => n.remove());
    [...this.assignees].sort().forEach(name => {
      const d = document.createElement('div');
      d.className = 'dropdown-item'; d.setAttribute('data-assignee', name); d.setAttribute('data-user', '1');
      d.innerHTML = `<i class="fas fa-user"></i> ${name}`;
      menu.appendChild(d);
    });
  }

  populateLabelFilter() {
    const menu = this.$('#labelDropdown'); if (!menu) return;
    menu.querySelectorAll('.dropdown-item[data-dynamic-label]').forEach(n => n.remove());
    [...this.labels].sort().forEach(l => {
      const d = document.createElement('div');
      d.className = 'dropdown-item'; d.setAttribute('data-label', l); d.setAttribute('data-dynamic-label', '1');
      d.innerHTML = `<i class="fas fa-tag"></i> ${l}`;
      menu.appendChild(d);
    });
  }

  filterAndDisplayIssues() {
    const repo = this.filters.repo;
    const all = (repo === 'all') ? this.allIssues : (this.repositoryIssues[repo] || []);
    let items = all;

    if (this.filters.state !== 'all') items = items.filter(i => i.state === this.filters.state);
    if (this.filters.assignee === 'unassigned') items = items.filter(i => !i.assignees?.length);
    else if (this.filters.assignee !== 'all') items = items.filter(i => i.assignees?.some(a => a.login === this.filters.assignee));
    if (this.filters.label !== 'all') items = items.filter(i => i.labels?.some(l => l.name === this.filters.label));

    const q = (this.filters.search || '').toLowerCase();
    if (q) {
      items = items.filter(i => {
        const title = (i.title || '').toLowerCase();
        const body = (i.body || '').toLowerCase();
        const number = String(i.number || '');
        return title.includes(q) || body.includes(q) || number.includes(q);
      });
    }

    const sortKey = this.filters.sort;
    items = [...items].sort((a, b) => {
      switch (sortKey) {
        case 'created': return new Date(b.created_at) - new Date(a.created_at);
        case 'updated': return new Date(b.updated_at) - new Date(a.updated_at);
        case 'comments': return (b.comments || 0) - (a.comments || 0);
        case 'title': return (a.title || '').localeCompare(b.title || '');
        case 'number': return (b.number || 0) - (a.number || 0);
        default: return new Date(b.updated_at) - new Date(a.updated_at);
      }
    });

    this.filteredIssues = items;
    this.renderIssues();
    this.updatePagination();
    this.updateHash();
    this.updateStats();
  }
  updateStats() {
    const repoCount = this.repositories ? this.repositories.length : 1; // Assuming single repo if no array
    const openIssues = this.filteredIssues.filter(issue => issue.state === 'open').length;
    const closedIssues = this.filteredIssues.filter(issue => issue.state === 'closed').length;
    const totalComments = this.filteredIssues.reduce((sum, issue) => sum + (issue.comments || 0), 0);

    document.getElementById('repoCount').textContent = repoCount;
    document.getElementById('openIssueCount').textContent = openIssues;
    document.getElementById('closedIssueCount').textContent = closedIssues;
    document.getElementById('totalComments').textContent = totalComments;

    // Show stats section
    document.getElementById('statsSection').style.display = 'flex';
}

  renderIssues() {
    const list = this.$('#issuesList'); if (!list) return;
    list.innerHTML = '';

    const start = (this.currentPage - 1) * this.perPage;
    const pageItems = this.filteredIssues.slice(start, start + this.perPage);

    if (!pageItems.length) {
      list.innerHTML = `<p class="no-issues">No issues found.</p>`;
      return;
    }

    const view = this.currentView;
    const frag = document.createDocumentFragment();

    for (const issue of pageItems) {
      const el = document.createElement('div');
      el.className = `issue-item view-${view}`;

      const labelHtml = (issue.labels || [])
        .map(l => `<span class="label" style="background-color:#${(l.color || '999')}">${l.name}</span>`)
        .join(' ');

      el.innerHTML = `
        <div class="issue-title">
          <strong>#${issue.number}</strong>
          <a href="${issue.html_url}" target="_blank" rel="noopener">${issue.title}</a>
        </div>

        <div class="issue-meta">
          <span>${issue.state}</span>
          <span>Updated: ${new Date(issue.updated_at).toLocaleString()}</span>
          <span>Repo: ${issue.repository}</span>
        </div>

        <div class="issue-labels">${labelHtml}</div>
        <div class="issue-body">${this.truncateAndLinkify(issue.body, 220).replace(/\n/g, '<br>')}</div>

        <div class="issue-actions" style="margin-top:.5rem; display:flex; gap:.5rem;">
          <button class="btn btn-secondary btn-details">Details</button>
          <a class="btn btn-outline" href="${issue.html_url}" target="_blank" rel="noopener">Open in GitHub</a>
        </div>
      `;

      el.querySelector('.btn-details').addEventListener('click', () => {
        this.openIssueDetail(issue);
      });

      frag.appendChild(el);
    }
    list.appendChild(frag);
  }

  openIssueDetail(issue) {
    const title = `${issue.title} #${issue.number}`;
    const bodyHtml = this.buildIssueDetailHtml(issue);
    this.openModal(title, bodyHtml);
  }

  buildIssueDetailHtml(issue) {
    const repo = issue.repository || '';
    const labels = (issue.labels || [])
      .map(l => `<span class="label" style="background-color:#${l.color || '999'}">${l.name}</span>`)
      .join(' ');

    const assignees = (issue.assignees || []).map(a => `
      <div class="assignee-detail">
        <img class="comment-avatar" src="${a.avatar_url}" alt="${a.login}">
        <a href="https://github.com/${a.login}" target="_blank" rel="noopener">@${a.login}</a>
      </div>`).join('') || '<span>—</span>';

    return `
      <div class="issue-header-detail">
        <div class="issue-meta-detail">
          <div class="repo-info">
            <i class="fab fa-github"></i>
            <a href="https://github.com/${repo}" target="_blank" rel="noopener">${repo}</a>
          </div>
          <div class="issue-dates">
            <span>Created: ${new Date(issue.created_at).toLocaleString()}</span>
            <span>Updated: ${new Date(issue.updated_at).toLocaleString()}</span>
            <span>State: ${issue.state}</span>
          </div>
        </div>
      </div>

      <div class="issue-section">
        <h4>Description</h4>
      <div class="issue-description-full">${this.truncateAndLinkify(issue.body, issue.body.length)}</div>

      </div>

      <div class="issue-section">
        <h4>Labels</h4>
        <div class="issue-labels-detail">${labels || '—'}</div>
      </div>

      <div class="issue-section">
        <h4>Assignees</h4>
        <div class="assignees-detail">${assignees}</div>
      </div>

      <div class="issue-actions-detail">
        <a class="btn btn-secondary" href="${issue.html_url}" target="_blank" rel="noopener">
          <i class="fab fa-github"></i> View on GitHub
        </a>
      </div>
    `;
  }



  truncateAndLinkify(text, max=220) {
  if (!text) return '';
  let truncated = text.length > max ? text.slice(0, max).trim() + '…' : text;

  // simple URL → <a> replacer
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  truncated = truncated.replace(urlRegex, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );

  return truncated.replace(/\n/g, '<br>');
}


  updatePagination() {
    const total = this.filteredIssues.length;
    const totalPages = Math.max(1, Math.ceil(total / this.perPage));
    this.currentPage = Math.min(this.currentPage, totalPages);

    const info = this.$('#paginationInfo');
    if (info) {
      const start = (this.currentPage - 1) * this.perPage + 1;
      const end = Math.min(this.currentPage * this.perPage, total);
      info.textContent = `Showing ${total ? `${start}-${end}` : 0} of ${total} issues`;
    }

    const controls = this.$('#paginationControls'); if (!controls) return;
    controls.innerHTML = '';
    const mkBtn = (label, page, disabled=false) => {
      const b = document.createElement('button'); b.textContent = label; b.disabled = disabled;
      b.className = 'page-btn'; if (!disabled) b.onclick = () => { this.currentPage = page; this.renderIssues(); this.updatePagination(); };
      return b;
    };
    controls.appendChild(mkBtn('«', 1, this.currentPage === 1));
    controls.appendChild(mkBtn('‹', Math.max(1, this.currentPage - 1), this.currentPage === 1));
    controls.appendChild(mkBtn('›', Math.min(totalPages, this.currentPage + 1), this.currentPage === totalPages));
    controls.appendChild(mkBtn('»', totalPages, this.currentPage === totalPages));

    this.updateHash(); // NEW: sync page in hash
    this.updateStats();
  }

  // ---------- Modal ----------
  openModal(title, bodyHtml){ this.$('#modalTitle').textContent=title; this.$('#modalBody').innerHTML=bodyHtml||''; this.$('#issueModal').classList.add('show'); }
  closeModal(){ this.$('#issueModal').classList.remove('show'); }

  // ---------- Hash+cache sync ----------
  syncAndRefresh(){ this.updateHash(); this.saveToCache(); this.filterAndDisplayIssues(); }

  closeAllDropdowns(){ this.$all('.dropdown-menu').forEach(d=>d.classList.remove('show')); }
  copyIssueLink = async (url) => { try { await navigator.clipboard.writeText(url); this.showNotification('Issue link copied','success'); } catch { this.showNotification('Failed to copy link','error'); } }

  // ---------- NEW helpers ----------
  startAutoRefreshTimer() {
    if (this._autoRefreshTimer) clearInterval(this._autoRefreshTimer);
    if (!this.cacheConfig.autoRefresh) return;
    const ms = Math.max(1, this.cacheConfig.duration) * 60 * 1000;
    this._autoRefreshTimer = setInterval(() => this.loadData(true), ms);
  }

  updateHeaderRefreshDisplay() {
    const spanWrap = this.$('#headerLastRefreshTime');
    const timeEl = this.$('#headerRefreshTime');
    if (!spanWrap || !timeEl) return;
    if (!this.lastRefreshTime) { spanWrap.style.display='none'; return; }
    spanWrap.style.display='inline';
    timeEl.textContent = this.lastRefreshTime.toLocaleString();
  }

  showFiltersOnError() {
    const sec = this.$('#filtersSection');
    if (sec) { sec.style.display = 'block'; sec.classList.add('show-filters'); }
  }
}

const issuesManager = new GitHubIssuesManager('issuesWidget');
