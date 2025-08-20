/**
 * GitHub Issues Manager
 * Advanced issue tracking and management for ModelEarth repositories
 */
class GitHubIssuesManager {
    constructor(containerId = 'issuesWidget', options = {}) {
        this.containerId = containerId;

        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container with id '${this.containerId}' not found`);
            return;
        }

        const config = this.parseConfiguration(container, options);

        this.githubToken = localStorage.getItem('github_token') || '';
        this.baseURL = 'https://api.github.com';
        this.owner = config.githubOwner;
        this.detectCurrentFolder = config.detectCurrentFolder;
        this.multiRepoRoots = config.multiRepoRoots;
        this.currentFolder = this.getCurrentFolder();
        this.defaultRepo = this.determineDefaultRepo();

        this.perPage = 10;
        this.currentPage = 1;
        this.allIssues = [];
        this.filteredIssues = [];
        this.repositories = [];
        this.repositoryIssues = {};
        this.repositoryIssueCounts = {};
        this.assignees = new Set();
        this.labels = new Set();
        
        this.filters = {
            repo: this.defaultRepo,
            sort: 'updated',
            assignee: 'all',
            state: 'open',
            label: 'all',
            search: ''
        };

        this.currentView = 'list';
        this.isFullscreen = false;

        this.init();
    }

    parseConfiguration(container, options) {
        const config = {
            githubOwner: 'ModelEarth',
            detectCurrentFolder: true,
            multiRepoRoots: ['webroot', 'modelearth']
        };

        if (container) {
            config.githubOwner = container.dataset.githubOwner || config.githubOwner;
            config.detectCurrentFolder = container.dataset.detectCurrentFolder === 'true' || config.detectCurrentFolder;
            if (container.dataset.multiRepoRoots) {
                config.multiRepoRoots = container.dataset.multiRepoRoots.split(',').map(s => s.trim());
            }
        }

        return { ...config, ...options };
    }

    getCurrentFolder() {
        const path = window.location.pathname;
        const pathParts = path.split('/').filter(part => part.length > 0);
        return pathParts.length > 0 ? pathParts[0] : '';
    }

    determineDefaultRepo() {
        if (!this.detectCurrentFolder) return 'projects';
        if (this.multiRepoRoots.includes(this.currentFolder)) {
            console.log(`Detected multi-repo root '${this.currentFolder}', defaulting to 'all' repositories`);
            return 'all';
        }
        if (this.currentFolder) {
            console.log(`Detected current folder '${this.currentFolder}', using as default repository`);
            return this.currentFolder;
        }
       
        console.log('No folder detected, defaulting to projects repository');
        return 'projects';
    }

    createWidgetStructure() {
        const container = document.getElementById(this.containerId);
      console.log(document.getElementById(this.containerId));
         container.innerHTML = `
            <div class="issues-header">
                <i class="fas fa-search header-search-btn" onclick="issuesManager.toggleFilters()" title="Toggle Filters"></i>
                <i class="fas fa-expand header-fullscreen-btn" onclick="issuesManager.toggleFullscreen()" title="Toggle Fullscreen"></i>
                
                <div class="header-content">
                    <h1 style="font-size:32px"><i class="fab fa-github"></i> Team Projects</h1>
                    <p class="subtitle">
                        <a href="#" id="toggleTokenSection" class="token-toggle-link" style="font-size: 0.9rem;">Add Your GitHub Token</a>
                        <span id="tokenBenefitText" style="font-size: 0.9rem;"> to increase API rate limits from 60 to 5,000 requests per hour</span>
                        <span id="headerLastRefreshTime" style="font-size: 0.9rem; display: none;"> Issue counts last updated: <span id="headerRefreshTime">Never</span>.</span>
                    </p>
                </div>
                
                <div class="auth-section" id="authSection" style="display: none;">
                    <div class="auth-input">
                        <input type="password" id="githubToken" placeholder="Enter GitHub Personal Access Token (optional for public repos)">
                        <button id="saveToken" class="btn btn-primary">
                            <i class="fas fa-save"></i> Save Token
                        </button>
                        <button id="clearToken" class="btn btn-primary" style="display: none;">
                            Clear
                        </button>
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
                                <ol>
                                    <li>Click the "Get Your Token" link above (opens GitHub)</li>
                                    <li>Add a description like "ModelEarth Projects Hub"</li>
                                    <li>Select scopes: <code>repo</code> (for private repos) and <code>read:org</code></li>
                                    <li>Click "Generate token" at the bottom</li>
                                    <li>Copy the generated token immediately and paste it above</li>
                                </ol>
                                <p class="note">
                                    <i class="fas fa-shield-alt"></i>
                                    <strong>Security:</strong> Tokens are stored locally only. Never share your token.
                                </p>
                            </div>
                        </details>
                    </div>
                </div>
            </div>

            <div id="rateLimitInfo" class="rate-limit-info" style="display: none;"></div>

            <div class="loading-overlay" id="loadingOverlay">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Loading GitHub data...</p>
                    <div class="loading-progress">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                    <p class="loading-status" id="loadingStatus">Fetching repositories...</p>
                </div>
            </div>

            <div class="filters-section" id="filtersSection">
                <button class="filters-close-btn"  id="filtersCloseBtn" onclick="issuesManager.collapseFilters()" title="Close Filters">
                    <i class="fas fa-times"></i>
                </button>
                <div class="filters-row filters-primary-row">
                    <div class="filter-group">
                        <select id="repoFilter" class="filter-select">
                            <option value="all">All Repositories</option>
                        </select>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="sortButton" class="filter-button">
                            <i class="fas fa-sort"></i> Sort by: Updated
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="sortDropdown">
                            <div class="dropdown-item" data-sort="updated"><i class="fas fa-calendar-alt"></i> Updated Date</div>
                            <div class="dropdown-item" data-sort="created"><i class="fas fa-plus"></i> Created Date</div>
                            <div class="dropdown-item" data-sort="comments"><i class="fas fa-comments"></i> Comment Count</div>
                            <div class="dropdown-item" data-sort="title"><i class="fas fa-sort-alpha-down"></i> Title (A-Z)</div>
                            <div class="dropdown-item" data-sort="number"><i class="fas fa-hashtag"></i> Issue Number</div>
                        </div>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="assigneeButton" class="filter-button">
                            <i class="fas fa-user"></i> Assigned to: All
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="assigneeDropdown">
                            <div class="dropdown-item" data-assignee="all"><i class="fas fa-users"></i> All Users</div>
                            <div class="dropdown-item" data-assignee="unassigned"><i class="fas fa-user-slash"></i> Unassigned</div>
                        </div>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="stateButton" class="filter-button">
                            <i class="fas fa-exclamation-circle"></i> State: Open
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="stateDropdown">
                            <div class="dropdown-item" data-state="open"><i class="fas fa-exclamation-circle"></i> Open Issues</div>
                            <div class="dropdown-item" data-state="closed"><i class="fas fa-check-circle"></i> Closed Issues</div>
                            <div class="dropdown-item" data-state="all"><i class="fas fa-list"></i> All Issues</div>
                        </div>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="labelButton" class="filter-button">
                            <i class="fas fa-tags"></i> Labels: All
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="labelDropdown">
                            <div class="dropdown-item" data-label="all"><i class="fas fa-tags"></i> All Labels</div>
                        </div>
                    </div>
                    <button id="moreFiltersBtn" class="btn btn-outline more-filters-btn">
                        <i class="fas fa-filter"></i> More Filters
                    </button>
                </div>

                <div class="filters-row filters-secondary-row additional-filters"  id="enableSearch" style="display: none;">
                    <div class="search-container">
                        <div class="search-group">
                            <input type="text" id="searchInput" placeholder="Search issues by title, body, or number...">
                            <button id="searchButton" class="btn btn-primary"><i class="fas fa-search"></i></button>
                            <button id="clearSearch" class="btn btn-secondary""><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="issues-container" id="issuesContainer" style="display: none;">
                <div class="issues-header-bar">
                    <div class="view-controls">
                        <div class="view-toggle">
                            <button id="listView" class="view-btn active" title="List View"><i class="fas fa-list"></i></button>
                            <button id="rowView" class="view-btn" title="Row View"><i class="fas fa-align-justify"></i></button>
                            <button id="cardView" class="view-btn" title="Card View"><i class="fas fa-th-large"></i></button>
                        </div>
                    </div>
                </div>
                
                <div class="issues-list" id="issuesList"></div>

                <div class="pagination-container" id="paginationContainer">
                    <div class="pagination-info">
                        <span id="paginationInfo">Showing 0 of 0 issues</span>
                    </div>
                    <div class="pagination-controls" id="paginationControls"></div>
                </div>
            </div>

            <div class="stats-section" id="statsSection" style="display: none;">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-code-branch"></i></div>
                    <div class="stat-content">
                        <div class="stat-number" id="repoCount">0</div>
                        <div class="stat-label">Repositories</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div>
                    <div class="stat-content">
                        <div class="stat-number" id="openIssueCount">0</div>
                        <div class="stat-label">Open Issues</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-content">
                        <div class="stat-number" id="closedIssueCount">0</div>
                        <div class="stat-label">Closed Issues</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-comments"></i></div>
                    <div class="stat-content">
                        <div class="stat-number" id="totalComments">0</div>
                        <div class="stat-label">Comments</div>
                    </div>
                </div>
            </div>


            <div class="error-message" id="errorMessage" style="display: none;">
                <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="error-content">
                    <h3>Error Loading Issues</h3>
                    <p id="errorText">Failed to load GitHub data. Please check your connection and try again.</p>
                    <button id="retryButton" class="btn btn-primary"><i class="fas fa-redo"></i> Retry</button>
                </div>
            </div>

            <div class="modal-overlay" id="issueModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="modalTitle">Issue Details</h2>
                        <button class="modal-close" id="modalClose"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" id="modalBody"></div>
                </div>
            </div>
        `;
    }

    async init() {
        this.createWidgetStructure();
        this.setupEventListeners();
        this.detectOwner();
        await this.loadData();
    }

    detectOwner() {
        const hostname = window.location.hostname;
        if (hostname.includes('modelearth') || hostname.includes('model.earth')) {
            this.owner = 'ModelEarth';
        }
    }

    async loadRepositoriesFromCSV() {
        try {
            const response = await fetch('hub/repos.csv');
            if (!response.ok) throw new Error(`CSV fetch failed: ${response.status}`);
            const csvText = await response.text();
            const parsed = this.parseCSV(csvText);
            return parsed;
        } catch (error) {
            console.error('Error loading repositories from CSV:', error);
            return [];
        }
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        return lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index];
                return obj;
            }, {});
        });
    }

    setupEventListeners() {
        document.getElementById('toggleTokenSection').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleTokenSection();
        });
        document.getElementById('saveToken').addEventListener('click', () => this.saveToken());
        document.getElementById('clearToken').addEventListener('click', () => this.clearToken());

        document.getElementById('repoFilter').addEventListener('change', (e) => {
            this.filters.repo = e.target.value;
            this.filterAndDisplayIssues();
        });

        this.setupDropdown('sortButton', 'sortDropdown', (value) => {
            this.filters.sort = value;
            this.updateSortButton();
            this.filterAndDisplayIssues();
        });
        this.setupDropdown('assigneeButton', 'assigneeDropdown', (value) => {
            this.filters.assignee = value;
            this.updateAssigneeButton();
            this.filterAndDisplayIssues();
        });
        this.setupDropdown('stateButton', 'stateDropdown', (value) => {
            this.filters.state = value;
            this.updateStateButton();
            this.filterAndDisplayIssues();
        });
        this.setupDropdown('labelButton', 'labelDropdown', (value) => {
            this.filters.label = value;
            this.updateLabelButton();
            this.filterAndDisplayIssues();
        });

        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');
        const clearSearch = document.getElementById('clearSearch');

        searchButton.addEventListener('click', () => this.performSearch());
        clearSearch.addEventListener('click', () => this.clearSearch());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        document.getElementById('listView').addEventListener('click', () => this.setView('list'));
        document.getElementById('rowView').addEventListener('click', () => this.setView('row'));
        document.getElementById('cardView').addEventListener('click', () => this.setView('card'));

        document.getElementById('moreFiltersBtn').addEventListener('click', () => this.expandFilters());
        document.getElementById('filtersCloseBtn').addEventListener('click', () => this.collapseFilters());

        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('issueModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('issueModal')) this.closeModal();
        });

        document.getElementById('retryButton').addEventListener('click', () => this.loadData(true));
    }

    setupDropdown(buttonId, dropdownId, callback) {
        const button = document.getElementById(buttonId);
        const dropdown = document.getElementById(dropdownId);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeAllDropdowns();
            dropdown.classList.toggle('show');
        });

        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target.closest('.dropdown-item');
            if (target) {
                const value = target.dataset.sort || target.dataset.assignee || target.dataset.state || target.dataset.label;
                callback(value);
                dropdown.classList.remove('show');
            }
        });

        document.addEventListener('click', () => dropdown.classList.remove('show'));
    }

    closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu').forEach(dropdown => dropdown.classList.remove('show'));
    }

    // Placeholder methods for full functionality
    async loadData(force = false) {

    try {
        this.showLoading(true, 'Fetching repositories...');
        const headers = this.githubToken ? { Authorization: `token ${this.githubToken}` } : {};

        // Fetch repositories (store full objects)
        const repoResponse = await fetch(`${this.baseURL}/users/${this.owner}/repos?per_page=100`, { headers });
        if (!repoResponse.ok) throw new Error(`GitHub API error: ${repoResponse.status}`);
        this.repositories = await repoResponse.json();

        // Populate dropdown with names
        this.populateRepoDropdown();

        // Determine which repos to fetch issues from
        const reposToFetch = this.filters.repo === 'all'
            ? this.repositories.map(r => r.name)
            : [this.filters.repo];

        // Fetch issues for each repo
        this.allIssues = [];
        for (const repoName of reposToFetch) {
            const issues = await this.fetchAllIssuesForRepo(repoName, headers);
            this.allIssues.push(...issues);
        }

        // Collect assignees and labels
        this.assignees.clear();
        this.labels.clear();
        this.allIssues.forEach(issue => {
            if (issue.assignee) this.assignees.add(issue.assignee.login);
            issue.labels.forEach(l => this.labels.add(l.name));
        });
        this.updateLabelAndAssigneeDropdowns();

        // Initial filtering & display
        this.filterAndDisplayIssues();
    } catch (err) {
        this.showError(err.message);
    } 
    finally {
         this.showLoading(false);
    }
}

populateRepoDropdown() {
    const repoFilter = document.getElementById('repoFilter');
    
    // Clear all but the first child (assuming the first is the "All" option)
    while (repoFilter.options.length > 1) {
        repoFilter.remove(1);
    }
    
    // Add options dynamically if repositories are loaded
    if (this.repositories && this.repositories.length > 0) {
        this.repositories.forEach(repoObj => {
            const option = document.createElement('option');
            option.value = repoObj.name;
            option.textContent = repoObj.name;
              console.log(option);
            repoFilter.appendChild(option);
          
        });
    }

    // Set the selected repository based on the current filter
    repoFilter.value = this.filters.repo;
}

  showLoading(show, text = 'Loading...'){
  const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
    document.getElementById('loadingStatus').textContent = text;
  }
   showError(message){
document.getElementById('errorText').textContent = message;
    document.getElementById('errorMessage').style.display = 'block';
    this.showLoading(false);
   }
 updateLabelAndAssigneeDropdowns(){
     const labelDropdown = document.getElementById('labelDropdown');
    labelDropdown.innerHTML = '<div class="dropdown-item" data-label="all"><i class="fas fa-tags"></i> All Labels</div>';
    this.labels.forEach(label => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.dataset.label = label;
        div.innerHTML = `<i class="fas fa-tag"></i> ${label}`;
        labelDropdown.appendChild(div);
    });

    const assigneeDropdown = document.getElementById('assigneeDropdown');
    assigneeDropdown.innerHTML = '<div class="dropdown-item" data-assignee="all"><i class="fas fa-users"></i> All Users</div>' +
                                 '<div class="dropdown-item" data-assignee="unassigned"><i class="fas fa-user-slash"></i> Unassigned</div>';
    this.assignees.forEach(user => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.dataset.assignee = user;
        div.innerHTML = `<i class="fas fa-user"></i> ${user}`;
        assigneeDropdown.appendChild(div);
    });
 }

   async fetchAllIssuesForRepo(repo, headers) {
    let issues = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
        const url = `${this.baseURL}/repos/${this.owner}/${repo}/issues?state=all&per_page=100&page=${page}`;
        const response = await fetch(url, { headers });

        if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

        const data = await response.json();
        const filtered = data.filter(i => !i.pull_request); // remove PRs
        issues.push(...filtered);

        if (data.length < 100) {
            hasNext = false;
        } else {
            page++;
        }
    }
//  console.log(issues+ "fetch");
    return issues;
}

    filterAndDisplayIssues() { 
        console.log('Filter issues here'); 
     let issues = [...this.allIssues];
    if (this.filters.repo !== 'all') issues = issues.filter(i => i.repository_url.endsWith(`/${this.filters.repo}`));
    if (this.filters.state !== 'all') issues = issues.filter(i => i.state === this.filters.state);
    if (this.filters.assignee === 'unassigned') issues = issues.filter(i => !i.assignee);
    else if (this.filters.assignee !== 'all') issues = issues.filter(i => i.assignee?.login === this.filters.assignee);
    if (this.filters.label !== 'all') issues = issues.filter(i => i.labels.some(l => l.name === this.filters.label));
    if (this.filters.search) {
        const term = this.filters.search.toLowerCase();
        issues = issues.filter(i => (i.title + i.body + i.number).toLowerCase().includes(term));
    }
    this.filteredIssues = this.sortIssues(issues);
    this.currentPage = 1;
    this.displayIssues();
}
  displayIssues() {
    const container = document.getElementById('issuesList');
    container.innerHTML = '';

    const start = (this.currentPage - 1) * this.perPage;
    const pageIssues = this.filteredIssues.slice(start, start + this.perPage);

    if (!pageIssues.length) {
        container.innerHTML = '<p>No issues found.</p>';
        this.updatePagination();
        return;
    }

    if (this.currentView === 'list') {
        // List view
        pageIssues.forEach(issue => {
            const div = document.createElement('div');
            div.className = 'issue-item';
            div.innerHTML = `<strong>#${issue.number}</strong> <a href="${issue.html_url}" target="_blank">${issue.title}</a> - ${issue.state}`;
            container.appendChild(div);
        });
    } else if (this.currentView === 'row') {
        // Row view: table style
        const table = document.createElement('table');
        table.className = 'issue-table';
        const tbody = document.createElement('tbody');

        pageIssues.forEach(issue => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${issue.number}</td>
                <td><a href="${issue.html_url}" target="_blank">${issue.title}</a></td>
                <td>${issue.state}</td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.appendChild(table);
    } else if (this.currentView === 'card') {
        // Card view: grid of boxes
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container';

        pageIssues.forEach(issue => {
            const card = document.createElement('div');
            card.className = 'issue-card';
            card.innerHTML = `
                <h3>#${issue.number}: <a href="${issue.html_url}" target="_blank">${issue.title}</a></h3>
                <p>Status: ${issue.state}</p>
            `;
            cardContainer.appendChild(card);
        });

        container.appendChild(cardContainer);
    }
    this.updateStats();

    this.updatePagination();
}

   updatePagination(){
   const total = this.filteredIssues.length;
    const info = document.getElementById('paginationInfo');
    info.textContent = `Showing ${(this.currentPage - 1) * this.perPage + 1} - ${Math.min(this.currentPage * this.perPage, total)} of ${total} issues`;

    const controls = document.getElementById('paginationControls');
    controls.innerHTML = '';
    if (this.currentPage > 1) {
        const prev = document.createElement('button');
        prev.textContent = 'Prev';
        prev.onclick = () => { this.currentPage--; this.displayIssues(); };
        controls.appendChild(prev);
    }
    if (this.currentPage * this.perPage < total) {
        const next = document.createElement('button');
        next.textContent = 'Next';
        next.onclick = () => { this.currentPage++; this.displayIssues(); };
        controls.appendChild(next);
    }
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

     sortIssues(issues){
   const sortKey = this.filters.sort;
    return issues.sort((a, b) => {
        if (sortKey === 'updated') return new Date(b.updated_at) - new Date(a.updated_at);
        if (sortKey === 'created') return new Date(b.created_at) - new Date(a.created_at);
        if (sortKey === 'comments') return b.comments - a.comments;
        if (sortKey === 'title') return a.title.localeCompare(b.title);
        if (sortKey === 'number') return a.number - b.number;
        return 0;
    });
     }
  

    toggleTokenSection() { 
        console.log('Toggle token section'); 
         const authSection = document.getElementById('authSection');
    authSection.style.display = authSection.style.display === 'none' ? 'block' : 'none';
    }
    saveToken() { 
        console.log('Save GitHub token');
        const tokenInput = document.getElementById('githubToken');
    const token = tokenInput.value.trim();
    if (token) {
        localStorage.setItem('github_token', token);
        this.githubToken = token;
        tokenInput.value = '';
        document.getElementById('clearToken').style.display = 'inline-block';
        this.loadData(true);
    }
     }
    clearToken() { 
        console.log('Clear GitHub token'); 
         localStorage.removeItem('github_token');
    this.githubToken = '';
    document.getElementById('clearToken').style.display = 'none';
    this.loadData(true);
    }
    updateSortButton() { 
        console.log('Update sort button');
     document.getElementById('sortButton').innerHTML = `<i class="fas fa-sort"></i> Sort by: ${this.filters.sort.charAt(0).toUpperCase() + this.filters.sort.slice(1)} <i class="fas fa-chevron-down"></i>`; }
    updateAssigneeButton() {
         console.log('Update assignee button');
document.getElementById('assigneeButton').innerHTML = `<i class="fas fa-user"></i> Assigned to: ${this.filters.assignee} <i class="fas fa-chevron-down"></i>`;
         }
    updateStateButton() { 
        console.log('Update state button'); 
    document.getElementById('stateButton').innerHTML = `<i class="fas fa-exclamation-circle"></i> State: ${this.filters.state} <i class="fas fa-chevron-down"></i>`;}
    updateLabelButton() { 
        console.log('Update label button');
    document.getElementById('labelButton').innerHTML = `<i class="fas fa-tags"></i> Labels: ${this.filters.label} <i class="fas fa-chevron-down"></i>`;
 }
    performSearch() { 
        console.log('Perform search');
     const searchInput = document.getElementById('searchInput');
    this.filters.search = searchInput.value.trim();
    document.getElementById('clearSearch').style.display = this.filters.search ? 'inline-block': "" ;
    this.filterAndDisplayIssues();
 }
    clearSearch() { 
        console.log('Clear search input'); 
     document.getElementById('searchInput').value = '';
    this.filters.search = '';
     document.getElementById('enableSearch').style.display = 'none';
    this.filterAndDisplayIssues();

}
    setView(view) { 
        console.log('Change view:', view); 
       this.currentView = view;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${view}View`).classList.add('active');
    this.displayIssues();
}
toggleFilters() {
    console.log('Search icon clicked');
    const filtersSection = document.getElementById('filtersSection');
     console.log("toggleFilters : "+ filtersSection.style.display)
    if (!filtersSection) return;
    filtersSection.classList.toggle('expanded');
    if (filtersSection.style.display === 'block') {
        this.collapseFilters();
    } else {
        this.expandFilters();
    }
}
    expandFilters() { 
        const searchSection = document.getElementById('enableSearch');
    if (!searchSection) return;

    searchSection.style.display = 'block';
        console.log('Expand filters'); 
       
        const filtersSection = document.getElementById('filtersSection');
    if (!filtersSection) return;

    filtersSection.style.display = 'block';
     console.log('Filters section display:', document.getElementById('filtersSection').style.display);
        console.log('Repo filter options count:', document.getElementById('repoFilter')?.options.length);
    filtersSection.classList.add('expanded');
    

    // Optionally focus on the first filter input (search input)
    const searchInput = document.getElementById('searchInput');
    if (searchInput != null ) searchInput.focus();
    }
    collapseFilters() { 
        const searchSection = document.getElementById('enableSearch');
    if (!searchSection) return;

    searchSection.style.display = 'none';
        console.log('Collapse filters');

         const filtersSection = document.getElementById('filtersSection');
    if (!filtersSection) return;

    filtersSection.style.display = 'none';
    filtersSection.classList.remove('expanded');
        console.log('Filters section display now:', filtersSection.style.display);

        
     }
     toggleFullscreen() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    this.isFullscreen = !this.isFullscreen;

    if (this.isFullscreen) {
        container.classList.add('fullscreen');
        document.documentElement.requestFullscreen?.();
    } else {
        container.classList.remove('fullscreen');
        document.exitFullscreen?.();
    }
}

    closeModal() { console.log('Close modal');
         document.getElementById('issueModal').style.display = 'none';
     }

}


// Usage example
const issuesManager = new GitHubIssuesManager('issuesWidget');




