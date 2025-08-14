/**
 * GitHub Issues Manager
 * Advanced issue tracking and management for ModelEarth repositories
 */

class GitHubIssuesManager {
    constructor(containerId = 'issuesWidget', options = {}) {
        this.containerId = containerId;
        
        // Read configuration from data attributes or options
        const container = document.getElementById(containerId);
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
        this.repositoryIssues = {}; // Cache for repository-specific issues
        this.repositoryIssueCounts = {}; // Cache for repository issue counts
        this.lastRefreshTime = null;
        this.autoRefreshInterval = null;
        this.assignees = new Set();
        this.labels = new Set();
        
        // Cache configuration (in minutes)
        this.cacheConfig = {
            duration: parseInt(localStorage.getItem('github_cache_duration')) || 10, // Default 10 minutes
            autoRefresh: localStorage.getItem('github_cache_auto_refresh') !== 'false' // Default true
        };
        this.cacheExpireTimer = null;
        this.rateLimitInfo = {
            remaining: null,
            resetTime: null,
            startTime: null
        };
        
        // State management
        this.filters = {
            repo: this.defaultRepo,
            sort: 'updated',
            assignee: 'all',
            state: 'open',
            label: 'all',
            search: ''
        };
        
        // UI state
        this.currentView = 'list'; // Default view
        this.isFullscreen = false;
        
        this.init();
    }

    parseConfiguration(container, options) {
        const config = {
            githubOwner: 'ModelEarth',
            detectCurrentFolder: true,
            multiRepoRoots: ['webroot', 'modelearth']
        };

        // Read from data attributes if container exists
        if (container) {
            if (container.dataset.githubOwner) {
                config.githubOwner = container.dataset.githubOwner;
            }
            if (container.dataset.detectCurrentFolder) {
                config.detectCurrentFolder = container.dataset.detectCurrentFolder === 'true';
            }
            if (container.dataset.multiRepoRoots) {
                config.multiRepoRoots = container.dataset.multiRepoRoots.split(',').map(s => s.trim());
            }
        }

        // Override with explicit options
        return { ...config, ...options };
    }

    getCurrentFolder() {
        // Get current folder from URL path
        const path = window.location.pathname;
        const pathParts = path.split('/').filter(part => part.length > 0);
        
        // Return the first non-empty path segment (top-level folder)
        return pathParts.length > 0 ? pathParts[0] : '';
    }

    determineDefaultRepo() {
        if (!this.detectCurrentFolder) {
            return 'projects'; // Default fallback
        }

        // If current folder is one of the multi-repo roots, default to 'all'
        if (this.multiRepoRoots.includes(this.currentFolder)) {
            console.log(`Detected multi-repo root '${this.currentFolder}', defaulting to 'all' repositories`);
            return 'all';
        }

        // If current folder exists and is not a multi-repo root, use it as default
        if (this.currentFolder) {
            console.log(`Detected current folder '${this.currentFolder}', using as default repository`);
            return this.currentFolder;
        }

        // Fallback to 'projects' if no folder detected
        console.log('No folder detected, defaulting to projects repository');
        return 'projects';
    }

    // Widget HTML template methods
    createWidgetStructure() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container with id '${this.containerId}' not found`);
            return;
        }

        container.innerHTML = `
            ${this.createHeaderHTML()}
            ${this.createRateLimitHTML()}
            ${this.createLoadingOverlayHTML()}
            ${this.createFiltersHTML()}
            ${this.createIssuesContainerHTML()}
            ${this.createStatsHTML()}
            ${this.createCacheStatusHTML()}
            ${this.createErrorHTML()}
            ${this.createModalHTML()}
        `;
    }

    createHeaderHTML() {
        return `
            <div class="issues-header">
                <i class="fas fa-search header-search-btn" onclick="issuesManager.toggleFilters()" title="Toggle Filters"></i>
                <i class="fas fa-expand header-fullscreen-btn" onclick="issuesManager.toggleFullscreen()" title="Toggle Fullscreen"></i>
                
                <div class="header-content">
                    <h1 style="font-size:32px"><i class="fab fa-github"></i> Team Projects</h1>
                    <p class="subtitle">
                        <a href="#" id="toggleTokenSection" class="token-toggle-link" style="font-size: 0.9rem;">Add Your GitHub Token</a>
                        <span id="tokenBenefitText" style="font-size: 0.9rem;"> to increase API rate limits from 60 to 5,000 requests per hour</span>
                        <span id="headerLastRefreshTime" style="font-size: 0.9rem; display: none;"> Issue counts last updated: <span id="headerRefreshTime">Never</span>.</span>
                        <span id="gitAccountDisplay" style="font-size: 0.9rem; display: none;"> GitHub: <a href="#" id="gitAccountLink" onclick="toggleGitIssuesAccount(); return false;"></a></span>
                    </p>
                    <p class="subtitle" style="margin-top: 5px;">
                        <input type="text" id="gitIssuesAccount" class="textInput" style="width:150px; font-size: 14px; display: none;" placeholder="GitHub Account" onfocus="this.select()" oninput="updateGitIssuesAccount()">
                    </p>
                </div>
                
                <!-- GitHub Authentication -->
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
                                    <li>You'll be taken to GitHub's token creation page with recommended settings</li>
                                    <li>Add a description like "ModelEarth Projects Hub"</li>
                                    <li>Select scopes: <code>repo</code> (for private repos) and <code>read:org</code> (for organization data)</li>
                                    <li>Click "Generate token" at the bottom</li>
                                    <li>Copy the generated token immediately (you won't see it again!)</li>
                                    <li>Paste it in the field above and click "Save Token"</li>
                                </ol>
                                <p class="note">
                                    <i class="fas fa-shield-alt"></i>
                                    <strong>Security:</strong> Tokens are stored locally in your browser only. Never share your token with others.
                                </p>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        `;
    }

    createRateLimitHTML() {
        return `
            <div id="rateLimitInfo" class="rate-limit-info" style="display: none;">
                <!-- Rate limit information will be displayed here -->
            </div>
        `;
    }

    createLoadingOverlayHTML() {
        return `
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
        `;
    }

    createFiltersHTML() {
        return `
            <div class="filters-section" id="filtersSection" style="display: none;">
                <button class="filters-close-btn" id="filtersCloseBtn" onclick="issuesManager.hideFilters()" title="Close Filters">
                    <i class="fas fa-times"></i>
                </button>
                <div class="filters-row filters-primary-row">
                    <div class="filter-group">
                        <select id="repoFilter" class="filter-select">
                            <option value="all">All Repositories</option>
                        </select>
                    </div>
                    
                    <button id="moreFiltersBtn" class="btn btn-outline more-filters-btn" style="display: none;">
                        <i class="fas fa-filter"></i> More Filters
                    </button>

                    <div class="filter-group additional-filters">
                        <button id="sortButton" class="filter-button">
                            <i class="fas fa-sort"></i> Sort by: Updated
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="sortDropdown">
                            <div class="dropdown-item" data-sort="updated">
                                <i class="fas fa-calendar-alt"></i> Updated Date
                            </div>
                            <div class="dropdown-item" data-sort="created">
                                <i class="fas fa-plus"></i> Created Date
                            </div>
                            <div class="dropdown-item" data-sort="comments">
                                <i class="fas fa-comments"></i> Comment Count
                            </div>
                            <div class="dropdown-item" data-sort="title">
                                <i class="fas fa-sort-alpha-down"></i> Title (A-Z)
                            </div>
                            <div class="dropdown-item" data-sort="number">
                                <i class="fas fa-hashtag"></i> Issue Number
                            </div>
                        </div>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="assigneeButton" class="filter-button">
                            <i class="fas fa-user"></i> Assigned to: All
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="assigneeDropdown">
                            <div class="dropdown-item" data-assignee="all">
                                <i class="fas fa-users"></i> All Users
                            </div>
                            <div class="dropdown-item" data-assignee="unassigned">
                                <i class="fas fa-user-slash"></i> Unassigned
                            </div>
                        </div>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="stateButton" class="filter-button">
                            <i class="fas fa-exclamation-circle"></i> State: Open
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="stateDropdown">
                            <div class="dropdown-item" data-state="open">
                                <i class="fas fa-exclamation-circle"></i> Open Issues
                            </div>
                            <div class="dropdown-item" data-state="closed">
                                <i class="fas fa-check-circle"></i> Closed Issues
                            </div>
                            <div class="dropdown-item" data-state="all">
                                <i class="fas fa-list"></i> All Issues
                            </div>
                        </div>
                    </div>

                    <div class="filter-group additional-filters">
                        <button id="labelButton" class="filter-button">
                            <i class="fas fa-tags"></i> Labels: All
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="labelDropdown">
                            <div class="dropdown-item" data-label="all">
                                <i class="fas fa-tags"></i> All Labels
                            </div>
                        </div>
                    </div>
                </div>

                <div class="filters-row filters-secondary-row additional-filters">
                    <div class="search-container">
                        <div class="search-group">
                            <input type="text" id="searchInput" placeholder="Search issues by title, body, or number...">
                            <button id="searchButton" class="btn btn-primary">
                                <i class="fas fa-search"></i>
                            </button>
                            <button id="clearSearch" class="btn btn-secondary" style="display: none;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }

    createIssuesContainerHTML() {
        return `
            <div class="issues-container" id="issuesContainer" style="display: none;">
                <div class="issues-header-bar">
                    <div class="view-controls">
                        <div class="view-toggle">
                            <button id="listView" class="view-btn active" title="List View">
                                <i class="fas fa-list"></i>
                            </button>
                            <button id="rowView" class="view-btn" title="Row View">
                                <i class="fas fa-align-justify"></i>
                            </button>
                            <button id="cardView" class="view-btn" title="Card View">
                                <i class="fas fa-th-large"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="issues-list" id="issuesList">
                    <!-- Issues will be dynamically loaded here -->
                </div>

                <!-- Pagination -->
                <div class="pagination-container" id="paginationContainer">
                    <div class="pagination-info">
                        <span id="paginationInfo">Showing 0 of 0 issues</span>
                    </div>
                    <div class="pagination-controls" id="paginationControls">
                        <!-- Pagination buttons will be generated here -->
                    </div>
                </div>
            </div>
        `;
    }

    createStatsHTML() {
        return `
            <div class="stats-section" id="statsSection" style="display: none;">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-code-branch"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-number" id="repoCount">0</div>
                        <div class="stat-label">Repositories</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-exclamation-circle"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-number" id="openIssueCount">0</div>
                        <div class="stat-label">Open Issues</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-number" id="closedIssueCount">0</div>
                        <div class="stat-label">Closed Issues</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-number" id="totalComments">0</div>
                        <div class="stat-label">Comments</div>
                    </div>
                </div>
            </div>
        `;
    }

    createCacheStatusHTML() {
        return `
            <div class="cache-status-section">
                <div id="cacheStatus" class="cache-status">
                    <span class="cache-info">Cache: Loading...</span>
                </div>
            </div>
        `;
    }

    createErrorHTML() {
        return `
            <div class="error-message" id="errorMessage" style="display: none;">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="error-content">
                    <h3>Error Loading Issues</h3>
                    <p id="errorText">Failed to load GitHub data. Please check your connection and try again.</p>
                    <button id="retryButton" class="btn btn-primary">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            </div>
        `;
    }

    createModalHTML() {
        return `
            <div class="modal-overlay" id="issueModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="modalTitle">Issue Details</h2>
                        <button class="modal-close" id="modalClose">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" id="modalBody">
                        <!-- Issue details will be loaded here -->
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        // Create the widget structure first
        this.createWidgetStructure();
        
        this.setupEventListeners();
        this.setupMenuClickHandler(); // Add menu click handler
        this.loadFromHash();
        this.loadFromCache();
        this.updateTokenUI();
        
        // Load saved view preference
        this.loadViewPreference();
        
        // Auto-detect owner from current URL or default to ModelEarth
        this.detectOwner();
        
        // Load rate limit info from cache
        this.loadRateLimitFromCache();
        
        // If we have a token but no recent rate limit info, clear it to get fresh data
        if (this.githubToken && this.rateLimitInfo.remaining !== null) {
            const now = Date.now();
            const resetTime = new Date(this.rateLimitInfo.resetTime).getTime();
            // If reset time has passed, clear the old info
            if (now > resetTime) {
                console.log('Clearing expired rate limit info');
                this.clearRateLimit();
            }
        }
        
        this.startRateLimitTimer();
        
        await this.loadData();
        
        // Start auto-refresh timer
        this.startAutoRefreshTimer();
    }

    detectOwner() {
        // Try to detect owner from URL or use default
        const hostname = window.location.hostname;
        if (hostname.includes('modelearth') || hostname.includes('model.earth')) {
            this.owner = 'ModelEarth';
        }
        // Could add more detection logic here
    }

    async loadRepositoriesFromCSV() {
        try {
            const response = await fetch('hub/repos.csv');
            if (!response.ok) {
                throw new Error(`CSV fetch failed: ${response.status}`);
            }
            const csvText = await response.text();
            console.log('📊 CSV content:', csvText);
            const parsed = this.parseCSV(csvText);
            console.log('📊 Parsed CSV data:', parsed);
            return parsed;
        } catch (error) {
            console.error('Error loading repositories from CSV:', error);
            // Fallback to hardcoded list (updated with additional repositories)
            return [
                {repo_name: 'modelearth', display_name: 'ModelEarth', description: 'Main ModelEarth repository', default_branch: 'master'},
                {repo_name: 'localsite', display_name: 'LocalSite', description: 'Core CSS/JS utilities', default_branch: 'main'},
                {repo_name: 'realitystream', display_name: 'RealityStream', description: 'ML Models and Visualization', default_branch: 'main'},
                {repo_name: 'feed', display_name: 'Feed', description: 'FeedPlayer video/gallery', default_branch: 'main'},
                {repo_name: 'swiper', display_name: 'Swiper', description: 'UI swiper components', default_branch: 'main'},
                {repo_name: 'comparison', display_name: 'Comparison', description: 'Trade Flow tools', default_branch: 'main'},
                {repo_name: 'codechat', display_name: 'CodeChat', description: 'Code chat interface', default_branch: 'main'},
                {repo_name: 'home', display_name: 'Home', description: 'Home page content', default_branch: 'main'},
                {repo_name: 'cloud', display_name: 'Cloud', description: 'Cloud platform tools', default_branch: 'main'},
                {repo_name: 'projects', display_name: 'Projects', description: 'Project showcases', default_branch: 'main'},
                {repo_name: 'team', display_name: 'Team', description: 'Rust REST API for Azure', default_branch: 'main'},
                {repo_name: 'products', display_name: 'Products', description: 'Products frontend and python', default_branch: 'main'},
                {repo_name: 'products-data', display_name: 'Products Data', description: 'Products data output', default_branch: 'main'},
                {repo_name: 'profile', display_name: 'Profile', description: 'Profile frontend analysis', default_branch: 'main'},
                {repo_name: 'exiobase', display_name: 'Exiobase', description: 'Trade flow output to .csv and SQL', default_branch: 'main'},
                {repo_name: 'io', display_name: 'IO', description: 'Input-output analysis', default_branch: 'main'},
                {repo_name: 'useeio.js', display_name: 'USEEIO.JS', description: 'JavaScript footprint tools', default_branch: 'dev'},
                {repo_name: 'useeio-widgets', display_name: 'USEEIO Widgets', description: 'USEEIO React widgets', default_branch: 'master'},
                {repo_name: 'useeio-widgets-without-react', display_name: 'USEEIO Widgets Without React', description: 'USEEIO widgets without React', default_branch: 'master'},
                {repo_name: 'useeiopy', display_name: 'USEEIO Python', description: 'Python USEEIO library', default_branch: 'master'},
                {repo_name: 'useeio_api', display_name: 'USEEIO API', description: 'USEEIO REST API', default_branch: 'master'},
                {repo_name: 'useeio', display_name: 'USEEIO Core', description: 'Core USEEIO model', default_branch: 'master'},
                {repo_name: 'useeior', display_name: 'USEEIO R', description: 'R package for USEEIO', default_branch: 'master'},
                {repo_name: 'useeio-state', display_name: 'USEEIO State', description: 'State-level USEEIO data', default_branch: 'main'},
                {repo_name: 'useeio-json', display_name: 'USEEIO JSON', description: 'USEEIO JSON data', default_branch: 'main'},
                {repo_name: 'mario', display_name: 'Mario', description: 'Multi-regional input-output', default_branch: 'main'},
                {repo_name: 'webroot', display_name: 'Webroot', description: 'PartnerTools webroot', default_branch: 'main'},
                {repo_name: 'data-pipeline', display_name: 'Data Pipeline', description: 'Python data processing pipeline', default_branch: 'main'},
                {repo_name: 'community-data', display_name: 'Community data', description: 'Community-level data outputs', default_branch: 'master'},
                {repo_name: 'community-timelines', display_name: 'Community Timeline', description: 'Timeline data for communities', default_branch: 'main'},
                {repo_name: 'community-zipcodes', display_name: 'Community Zipcodes', description: 'ZIP code level community data', default_branch: 'main'},
                {repo_name: 'community-forecasting', display_name: 'Community Forecasting', description: 'Forecasting frontend', default_branch: 'main'},
                {repo_name: 'dataflow', display_name: 'Data flow', description: 'Data flow NextJS UX', default_branch: 'main'},
            ];
        }
    }

    async loadAllRepositoriesFromGitHub() {
        const cacheKey = 'github_all_repos';
        const cacheTimeKey = 'github_all_repos_time';
        
        // Check if we have cached data that's less than 1 hour old
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);
        
        if (cachedData && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
            
            if (age < oneHour) {
                console.log('Using cached GitHub repositories');
                return JSON.parse(cachedData);
            }
        }

        // Fetch fresh data from GitHub API
        if (!this.githubToken) {
            console.log('No GitHub token available for fetching all repositories');
            return null;
        }

        try {
            console.log('Fetching all repositories from GitHub API...');
            const repos = [];
            let page = 1;
            const perPage = 100;

            while (true) {
                const response = await this.makeGitHubRequest(`${this.baseURL}/orgs/${this.owner}/repos?per_page=${perPage}&page=${page}&type=all&sort=name`);
                
                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status} - ${response.statusText}`);
                }

                const pageRepos = await response.json();
                if (pageRepos.length === 0) break;

                // Add repos that have issues
                const reposWithIssues = pageRepos.filter(repo => repo.has_issues && !repo.archived);
                repos.push(...reposWithIssues.map(repo => ({
                    repo_name: repo.name,
                    display_name: repo.name,
                    description: repo.description || '',
                    default_branch: repo.default_branch || 'main',
                    open_issues_count: repo.open_issues_count,
                    html_url: repo.html_url
                })));

                page++;
                if (pageRepos.length < perPage) break; // Last page
            }

            console.log(`Fetched ${repos.length} repositories with issues from GitHub API`);

            // Cache the results
            localStorage.setItem(cacheKey, JSON.stringify(repos));
            localStorage.setItem(cacheTimeKey, Date.now().toString());

            return repos;
        } catch (error) {
            console.error('Error fetching repositories from GitHub API:', error);
            return null;
        }
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            data.push(row);
        }

        return data;
    }

    loadRateLimitFromCache() {
        try {
            const cached = localStorage.getItem('github_rate_limit_info');
            if (cached) {
                this.rateLimitInfo = JSON.parse(cached);
                
                // Check if rate limit period has passed
                if (this.rateLimitInfo.resetTime && new Date() > new Date(this.rateLimitInfo.resetTime)) {
                    this.clearRateLimit();
                }
            }
        } catch (error) {
            console.warn('Failed to load rate limit info from cache:', error);
        }
    }

    saveRateLimitToCache() {
        try {
            localStorage.setItem('github_rate_limit_info', JSON.stringify(this.rateLimitInfo));
        } catch (error) {
            console.warn('Failed to save rate limit info to cache:', error);
        }
    }

    clearRateLimit() {
        this.rateLimitInfo = {
            remaining: null,
            resetTime: null,
            startTime: null
        };
        localStorage.removeItem('github_rate_limit_info');
        this.updateRateLimitDisplay();
    }

    // Cache management functions
    setupCacheExpirationTimer(timeUntilExpiration) {
        // Clear existing timer
        if (this.cacheExpireTimer) {
            clearTimeout(this.cacheExpireTimer);
        }

        // Set new timer for auto-refresh
        this.cacheExpireTimer = setTimeout(() => {
            console.log('Cache expired, auto-refreshing...');
            this.loadData(true); // Force refresh
        }, timeUntilExpiration);

        console.log(`Cache expiration timer set for ${Math.round(timeUntilExpiration / 60000)} minutes`);
    }

    updateCacheStatusDisplay() {
        const cacheStatusDiv = document.getElementById('cacheStatus');
        if (!cacheStatusDiv) return;

        const cached = localStorage.getItem('github_issues_cache');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const cacheAge = Date.now() - data.timestamp;
                const cacheAgeMinutes = Math.round(cacheAge / 60000);
                const remainingMinutes = Math.max(0, this.cacheConfig.duration - cacheAgeMinutes);
                
                cacheStatusDiv.innerHTML = `
                    <span class="cache-info">
                        Cache: ${cacheAgeMinutes}m old, expires in ${remainingMinutes}m 
                        (${this.cacheConfig.duration}m duration)
                        ${this.cacheConfig.autoRefresh ? ' • Auto-refresh enabled' : ' • Auto-refresh disabled'}
                    </span>
                `;
            } catch (error) {
                cacheStatusDiv.innerHTML = '<span class="cache-info">Cache: Invalid</span>';
            }
        } else {
            cacheStatusDiv.innerHTML = '<span class="cache-info">Cache: Empty</span>';
        }
    }

    setCacheDuration(minutes) {
        this.cacheConfig.duration = Math.max(1, Math.min(60, minutes)); // Limit between 1-60 minutes
        localStorage.setItem('github_cache_duration', this.cacheConfig.duration.toString());
        
        // Clear existing cache to apply new duration
        localStorage.removeItem('github_issues_cache');
        
        this.showNotification(`Cache duration set to ${this.cacheConfig.duration} minutes`, 'info');
        this.updateCacheStatusDisplay();
        
        // Reload data with new cache settings
        this.loadData(true);
    }

    toggleAutoRefresh() {
        this.cacheConfig.autoRefresh = !this.cacheConfig.autoRefresh;
        localStorage.setItem('github_cache_auto_refresh', this.cacheConfig.autoRefresh.toString());
        
        if (!this.cacheConfig.autoRefresh && this.cacheExpireTimer) {
            clearTimeout(this.cacheExpireTimer);
            this.cacheExpireTimer = null;
        }
        
        this.showNotification(`Auto-refresh ${this.cacheConfig.autoRefresh ? 'enabled' : 'disabled'}`, 'info');
        this.updateCacheStatusDisplay();
    }

    updateRateLimitDisplay() {
        const rateLimitDiv = document.getElementById('rateLimitInfo');
        if (!rateLimitDiv) return;

        if (this.rateLimitInfo.remaining !== null) {
            const resetTime = new Date(this.rateLimitInfo.resetTime);
            const now = new Date();
            const timeLeft = Math.max(0, resetTime - now);
            const minutesLeft = Math.ceil(timeLeft / 60000);
            const remaining = this.rateLimitInfo.remaining;

            // Only show warning when running low on requests or recently hit limit
            const shouldShowWarning = remaining < 100 || (remaining === 0 && timeLeft > 0);

            if (shouldShowWarning && timeLeft > 0) {
                rateLimitDiv.innerHTML = `
                    <div class="rate-limit-warning">
                        <i class="fas fa-clock"></i>
                        <strong>API Rate Limit Warning:</strong> ${remaining} requests remaining.
                        Resets in ${minutesLeft} minutes (${resetTime.toLocaleTimeString()})
                    </div>
                `;
                rateLimitDiv.style.display = 'block';
            } else {
                rateLimitDiv.style.display = 'none';
            }
        } else {
            rateLimitDiv.style.display = 'none';
        }
        
        // Update the header text with current rate limit info
        this.updateTokenSectionUI();
    }

    startRateLimitTimer() {
        // Update rate limit display every minute
        if (this.rateLimitTimer) {
            clearInterval(this.rateLimitTimer);
        }
        
        this.rateLimitTimer = setInterval(() => {
            this.updateRateLimitDisplay();
        }, 60000); // Update every minute
    }

    setupEventListeners() {
        // Token management
        document.getElementById('toggleTokenSection').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleTokenSection();
        });
        document.getElementById('saveToken').addEventListener('click', () => this.saveToken());
        document.getElementById('clearToken').addEventListener('click', () => this.clearToken());

        // Filters
        document.getElementById('repoFilter').addEventListener('change', async (e) => {
            this.filters.repo = e.target.value;
            this.updateHash();
            this.saveToCache();
            
            // Load issues for the selected repository if not already loaded
            if (this.filters.repo !== 'all' && !this.repositoryIssues[this.filters.repo]) {
                await this.loadIssuesForRepository(this.filters.repo);
                this.updateRepositoryDropdownCounts();
            } else if (this.filters.repo === 'all') {
                // Load all repositories that haven't been loaded yet
                const unloadedRepos = this.repositories.filter(repo => !this.repositoryIssues[repo.name]);
                for (const repo of unloadedRepos) {
                    await this.loadIssuesForRepository(repo.name);
                }
                this.updateRepositoryDropdownCounts();
            }
            
            this.filterAndDisplayIssues();
        });

        // Dropdown menus
        this.setupDropdown('sortButton', 'sortDropdown', (value) => {
            this.filters.sort = value;
            this.updateSortButton();
            this.updateHash();
            this.saveToCache();
            this.filterAndDisplayIssues();
        });

        this.setupDropdown('assigneeButton', 'assigneeDropdown', (value) => {
            this.filters.assignee = value;
            this.updateAssigneeButton();
            this.updateHash();
            this.saveToCache();
            this.filterAndDisplayIssues();
        });

        this.setupDropdown('stateButton', 'stateDropdown', (value) => {
            this.filters.state = value;
            this.updateStateButton();
            this.updateHash();
            this.saveToCache();
            this.filterAndDisplayIssues();
        });

        this.setupDropdown('labelButton', 'labelDropdown', (value) => {
            this.filters.label = value;
            this.updateLabelButton();
            this.updateHash();
            this.saveToCache();
            this.filterAndDisplayIssues();
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');
        const clearSearch = document.getElementById('clearSearch');

        searchButton.addEventListener('click', () => {
            this.performSearch();
            this.loadData(true); // Also refresh data like the old refresh button
        });
        clearSearch.addEventListener('click', () => this.clearSearch());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // View controls
        document.getElementById('listView').addEventListener('click', () => this.setView('list'));
        document.getElementById('rowView').addEventListener('click', () => this.setView('row'));
        document.getElementById('cardView').addEventListener('click', () => this.setView('card'));

        // Filters expand/collapse
        document.getElementById('moreFiltersBtn').addEventListener('click', () => this.expandFilters());
        document.getElementById('filtersCloseBtn').addEventListener('click', () => this.collapseFilters());

        // Modal
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('issueModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('issueModal')) this.closeModal();
        });

        // Retry button
        document.getElementById('retryButton').addEventListener('click', () => this.loadData(true));

        // Prevent token link from toggling details
        const tokenLinks = document.querySelectorAll('.token-link');
        tokenLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // Hash change listener
        window.addEventListener('hashchange', () => this.loadFromHash());
        
        // Resize listener to update width display
        window.addEventListener('resize', () => this.updatePagination());
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
            if (e.target.classList.contains('dropdown-item')) {
                const value = e.target.getAttribute('data-sort') || 
                            e.target.getAttribute('data-assignee') || 
                            e.target.getAttribute('data-state') ||
                            e.target.getAttribute('data-label');
                callback(value);
                dropdown.classList.remove('show');
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            dropdown.classList.remove('show');
        });
    }

    closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }

    updateTokenUI() {
        const tokenInput = document.getElementById('githubToken');
        const clearButton = document.getElementById('clearToken');
        
        if (this.githubToken) {
            tokenInput.value = '••••••••••••••••';
            clearButton.style.display = 'inline-block';
        } else {
            tokenInput.value = '';
            clearButton.style.display = 'none';
        }
    }

    toggleTokenSection() {
        const authSection = document.getElementById('authSection');
        const subtitleDescription = document.getElementById('subtitleDescription');
        
        if (authSection.style.display === 'none') {
            // Show the token section
            authSection.style.display = 'block';
            subtitleDescription.style.display = 'block';
        } else {
            // Hide the token section
            authSection.style.display = 'none';
            subtitleDescription.style.display = 'none';
        }
    }

    updateTokenSectionUI() {
        const toggleLink = document.getElementById('toggleTokenSection');
        const benefitText = document.getElementById('tokenBenefitText');
        const headerRefreshSpan = document.getElementById('headerLastRefreshTime');
        
        if (this.githubToken) {
            toggleLink.textContent = 'Change or Remove your Github Token';
            let text = ' The token has increased your API rate limits from 60 to 5,000 requests per hour';
            
            // Add current request count and reset time if available
            if (this.rateLimitInfo.remaining !== null && this.rateLimitInfo.resetTime) {
                const resetTime = new Date(this.rateLimitInfo.resetTime);
                const resetTimeString = resetTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                text += `. ${this.rateLimitInfo.remaining} requests remaining before ${resetTimeString}`;
            } else if (this.rateLimitInfo.remaining !== null) {
                text += `. ${this.rateLimitInfo.remaining} requests remaining`;
            }
            
            benefitText.textContent = text;
            
            // Show the refresh time info
            if (headerRefreshSpan) {
                headerRefreshSpan.style.display = 'inline';
            }
        } else {
            toggleLink.textContent = 'Add Your GitHub Token';
            benefitText.textContent = ' to increase API rate limits from 60 to 5,000 requests per hour';
            
            // Hide the refresh time info when no token
            if (headerRefreshSpan) {
                headerRefreshSpan.style.display = 'none';
            }
        }
        
        // Update the refresh time display
        this.updateHeaderRefreshDisplay();
    }

    async saveToken() {
        const tokenInput = document.getElementById('githubToken');
        const token = tokenInput.value.trim();
        
        if (token && token !== '••••••••••••••••') {
            this.githubToken = token;
            localStorage.setItem('github_token', token);
            localStorage.removeItem('github_issues_cache'); // Clear cache when token changes
            localStorage.removeItem('github_all_repos'); // Clear repo cache to fetch fresh data
            localStorage.removeItem('github_all_repos_time');
            
            // Clear rate limit info since new token likely has better limits
            this.clearRateLimit();
            
            this.showNotification('Token saved successfully', 'success');
            
            // Reload repositories with new token to populate all available repos
            try {
                await this.loadRepositoriesFromCSVToUI();
                this.populateRepositoryDropdown();
            } catch (error) {
                console.error('Error refreshing repositories after token save:', error);
            }
        }
        
        this.updateTokenUI();
        this.updateTokenSectionUI();
        
        // Hide the token section after saving
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('subtitleDescription').style.display = 'none';
    }

    clearToken() {
        // Show confirmation dialog
        const confirmed = confirm(
            'Are you sure you want to clear your GitHub token?\n\n' +
            'This will:\n' +
            '• Remove your stored token\n' +
            '• Clear cached issue data\n' +
            '• Reduce API rate limit from 5,000 to 60 requests per hour\n\n' +
            'You can always add your token back later.'
        );
        
        if (confirmed) {
            this.githubToken = '';
            localStorage.removeItem('github_token');
            localStorage.removeItem('github_issues_cache'); // Clear cache when token changes
            this.updateTokenUI();
            this.updateTokenSectionUI();
            this.showNotification('GitHub token cleared successfully', 'info');
            
            // Hide the token section after clearing
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('subtitleDescription').style.display = 'none';
        }
    }

    async loadData(forceRefresh = false) {
        try {
            this.showLoading(true);
            this.hideError();

            // Check cache first
            if (!forceRefresh) {
                const cached = this.loadFromCache();
                if (cached && cached.repositories && cached.repositories.length > 0 && cached.issues && cached.issues.length > 0) {
                    this.repositories = cached.repositories;
                    this.allIssues = cached.issues;
                    
                    // Rebuild assignees and labels from cached data
                    this.assignees = new Set();
                    this.labels = new Set();
                    this.allIssues.forEach(issue => {
                        if (issue.assignees && issue.assignees.length > 0) {
                            issue.assignees.forEach(assignee => this.assignees.add(assignee.login));
                        }
                        if (issue.labels && issue.labels.length > 0) {
                            issue.labels.forEach(label => this.labels.add(label.name));
                        }
                    });
                    
                    console.log(`Loaded ${this.repositories.length} repositories and ${this.allIssues.length} issues from cache`);
                    this.updateUI();
                    this.showLoading(false);
                    return;
                }
            }

            this.updateLoadingStatus('Loading repositories...');
            await this.loadRepositoriesFromCSVToUI();
            
            // Load issues for repositories
            if (this.filters.repo !== 'all') {
                this.updateLoadingStatus(`Loading issues for ${this.filters.repo}...`);
                await this.loadIssuesForRepository(this.filters.repo);
            } else {
                // Load issues for all repositories
                this.updateLoadingStatus('Loading issues for all repositories...');
                await this.loadIssuesForAllRepositories();
            }
            
            this.updateUI();
            this.saveToCache();
            this.showLoading(false);
            
        } catch (error) {
            console.error('Error loading data:', error);
            
            // Always load repositories from CSV even on API error
            try {
                await this.loadRepositoriesFromCSVToUI();
                this.showFiltersOnError();
            } catch (csvError) {
                this.showError('Failed to load repository data: ' + csvError.message);
            }
            
            this.showLoading(false);
        }
    }

    async loadRepositoriesFromCSVToUI() {
        // Try to load all repositories from GitHub API first if we have a token
        let allRepos = null;
        if (this.githubToken) {
            allRepos = await this.loadAllRepositoriesFromGitHub();
        }

        if (allRepos && allRepos.length > 0) {
            // Use GitHub API data
            this.repositories = allRepos.map(apiRepo => ({
                name: apiRepo.repo_name,
                displayName: apiRepo.display_name,
                description: apiRepo.description,
                defaultBranch: apiRepo.default_branch,
                openIssueCount: apiRepo.open_issues_count,
                totalIssueCount: null,
                repository_url: apiRepo.html_url || `https://github.com/${this.owner}/${apiRepo.repo_name}`
            }));
            
            console.log(`Loaded ${this.repositories.length} repositories from GitHub API`);
        } else {
            // Fallback to CSV data
            const csvRepos = await this.loadRepositoriesFromCSV();
            
            this.repositories = csvRepos.map(csvRepo => ({
                name: csvRepo.repo_name,
                displayName: csvRepo.display_name,
                description: csvRepo.description,
                defaultBranch: csvRepo.default_branch,
                openIssueCount: null, // Will be loaded on demand
                totalIssueCount: null,
                repository_url: `https://github.com/${this.owner}/${csvRepo.repo_name}`
            }));
            
            console.log(`Loaded ${this.repositories.length} repositories from CSV`);
        }

        // If we have a valid token, default to "all" repositories
        if (this.githubToken && this.filters.repo === 'modelearth') {
            this.filters.repo = 'all';
        }

        // Load issue counts for all repositories
        await this.loadAllRepositoryIssueCounts();
    }

    async loadAllRepositoryIssueCounts() {
        const cacheKey = 'repo_issue_counts';
        const cacheTimeKey = 'repo_issue_counts_time';
        
        // Check cache first (valid for 5 minutes)
        const cachedCounts = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);
        
        if (cachedCounts && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
            
            if (age < fiveMinutes) {
                this.repositoryIssueCounts = JSON.parse(cachedCounts);
                this.lastRefreshTime = new Date(parseInt(cacheTime));
                console.log('Using cached repository issue counts');
                this.updateRepositoryDropdown();
                return;
            }
        }

        // Load fresh issue counts
        try {
            console.log('Loading issue counts for all repositories...');
            const counts = {};
            
            for (const repo of this.repositories) {
                try {
                    const openCount = await this.getRepositoryIssueCount(repo.name, 'open');
                    const closedCount = await this.getRepositoryIssueCount(repo.name, 'closed');
                    counts[repo.name] = {
                        open: openCount,
                        closed: closedCount,
                        total: openCount + closedCount
                    };
                    console.log(`${repo.name}: ${openCount} open, ${closedCount} closed`);
                } catch (error) {
                    console.error(`Error loading issue count for ${repo.name}:`, error);
                    counts[repo.name] = { open: 0, closed: 0, total: 0 };
                }
            }

            this.repositoryIssueCounts = counts;
            this.lastRefreshTime = new Date();

            // Cache the results
            localStorage.setItem(cacheKey, JSON.stringify(counts));
            localStorage.setItem(cacheTimeKey, Date.now().toString());

            console.log('Finished loading all repository issue counts');
            this.updateRepositoryDropdown();
        } catch (error) {
            console.error('Error loading repository issue counts:', error);
        }
    }

    async getRepositoryIssueCount(repoName, state = 'open') {
        try {
            const url = `${this.baseURL}/repos/${this.owner}/${repoName}/issues?state=${state}&per_page=1`;
            const response = await this.makeGitHubRequest(url);
            
            if (response.ok) {
                // GitHub returns the total count in the Link header
                const linkHeader = response.headers.get('Link');
                if (linkHeader) {
                    const lastPageMatch = linkHeader.match(/&page=(\d+)>; rel="last"/);
                    if (lastPageMatch) {
                        return parseInt(lastPageMatch[1]);
                    }
                }
                
                // Fallback: if no pagination, count the results
                const issues = await response.json();
                return issues.length;
            }
            return 0;
        } catch (error) {
            console.error(`Error getting issue count for ${repoName} (${state}):`, error);
            return 0;
        }
    }

    async loadIssuesForAllRepositories() {
        console.log('Loading issues for all repositories...');
        
        for (const repo of this.repositories) {
            try {
                this.updateLoadingStatus(`Loading issues for ${repo.name}...`);
                await this.loadIssuesForRepository(repo.name);
            } catch (error) {
                console.error(`Error loading issues for ${repo.name}:`, error);
                // Continue with other repositories
            }
        }
        
        console.log('Finished loading issues for all repositories');
    }

    async loadIssuesForRepository(repoName) {
        if (this.repositoryIssues[repoName]) {
            return this.repositoryIssues[repoName];
        }

        try {
            this.showNotification(`Loading issues for ${repoName}...`, 'info');
            const issues = await this.fetchRepositoryIssues(repoName);
            this.repositoryIssues[repoName] = issues;
            
            // Update the repository object with issue counts
            const repo = this.repositories.find(r => r.name === repoName);
            if (repo) {
                const openIssues = issues.filter(issue => issue.state === 'open');
                repo.openIssueCount = openIssues.length;
                repo.totalIssueCount = issues.length;
                console.log(`Repository ${repoName}: ${issues.length} total issues, ${openIssues.length} open`);
            }
            
            // Add to allIssues if not already there
            const existingIssueIds = new Set(this.allIssues.map(issue => issue.id));
            const newIssues = issues.filter(issue => !existingIssueIds.has(issue.id));
            this.allIssues.push(...newIssues);
            
            // Collect assignees and labels
            issues.forEach(issue => {
                if (issue.assignees && issue.assignees.length > 0) {
                    issue.assignees.forEach(assignee => this.assignees.add(assignee.login));
                }
                if (issue.labels && issue.labels.length > 0) {
                    issue.labels.forEach(label => this.labels.add(label.name));
                }
            });
            
            this.populateAssigneeFilter();
            this.populateLabelFilter();
            
            return issues;
        } catch (error) {
            console.error(`Failed to load issues for ${repoName}:`, error);
            this.showNotification(`Failed to load issues for ${repoName}`, 'error');
            return [];
        }
    }

    updateRepositoryDropdownCounts() {
        const select = document.getElementById('repoFilter');
        const options = select.querySelectorAll('option');
        
        options.forEach(option => {
            const repoName = option.value;
            if (repoName !== 'all') {
                const repo = this.repositories.find(r => r.name === repoName);
                if (repo && repo.openIssueCount !== null) {
                    const issueText = `(${repo.openIssueCount})`;
                    const displayName = repo.displayName || repo.name;
                    option.textContent = `${displayName} ${issueText}`;
                }
            }
        });
    }

    async enrichRepositoryData(repo) {
        try {
            // Get repository contents for file count and images
            const contents = await this.apiRequest(`/repos/${this.owner}/${repo.name}/contents`);
            repo.fileCount = contents.filter(item => item.type === 'file').length;
            
            // Look for images in common directories
            repo.images = [];
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
            
            // Check root directory
            const rootImages = contents.filter(item => 
                item.type === 'file' && 
                imageExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
            );
            repo.images.push(...rootImages.slice(0, 4));
            
            // Check for common image directories if we need more images
            if (repo.images.length < 4) {
                const imageDirs = ['images', 'img', 'assets', 'static', 'public'];
                for (const dir of imageDirs) {
                    if (repo.images.length >= 4) break;
                    try {
                        const dirContents = await this.apiRequest(`/repos/${this.owner}/${repo.name}/contents/${dir}`);
                        const dirImages = dirContents.filter(item =>
                            item.type === 'file' &&
                            imageExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
                        );
                        repo.images.push(...dirImages.slice(0, 4 - repo.images.length));
                    } catch (e) {
                        // Directory doesn't exist, continue
                    }
                }
            }
            
            // Get repository statistics
            const stats = await this.apiRequest(`/repos/${this.owner}/${repo.name}/stats/contributors`);
            repo.contributorCount = stats ? stats.length : 1;
            
        } catch (error) {
            console.warn(`Failed to enrich data for ${repo.name}:`, error);
            repo.fileCount = 0;
            repo.images = [];
            repo.contributorCount = 1;
        }
    }



    async fetchRepositoryIssues(repoName) {
        const issues = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await this.apiRequest(
                    `/repos/${this.owner}/${repoName}/issues?state=all&per_page=100&page=${page}`
                );
                
                if (response.length === 0) {
                    hasMore = false;
                } else {
                    // Filter out pull requests (they appear in issues endpoint)
                    const actualIssues = response.filter(issue => !issue.pull_request);
                    
                    // Enrich each issue with additional data
                    for (const issue of actualIssues) {
                        issue.repository = repoName;
                        issue.repository_url = `https://github.com/${this.owner}/${repoName}`;
                        
                        // Fetch comments if any
                        if (issue.comments > 0) {
                            try {
                                issue.comment_details = await this.apiRequest(
                                    `/repos/${this.owner}/${repoName}/issues/${issue.number}/comments`
                                );
                            } catch (e) {
                                issue.comment_details = [];
                            }
                        } else {
                            issue.comment_details = [];
                        }
                    }
                    
                    issues.push(...actualIssues);
                    page++;
                }
            } catch (error) {
                console.error(`Error fetching issues for ${repoName}, page ${page}:`, error);
                hasMore = false;
            }
        }

        console.log(`Fetched ${issues.length} issues for repository ${repoName}`);
        return issues;
    }

    async apiRequest(endpoint) {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
        };

        if (this.githubToken) {
            headers['Authorization'] = `token ${this.githubToken}`;
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, { headers });
        
        // Extract rate limit information from headers
        if (response.headers.get('X-RateLimit-Remaining')) {
            this.rateLimitInfo.remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
            this.rateLimitInfo.resetTime = new Date(parseInt(response.headers.get('X-RateLimit-Reset')) * 1000);
            this.saveRateLimitToCache();
            this.updateRateLimitDisplay();
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Handle rate limit exceeded
            if (response.status === 403 && errorData.message && errorData.message.includes('rate limit')) {
                this.rateLimitInfo.startTime = new Date();
                this.rateLimitInfo.remaining = 0;
                if (response.headers.get('X-RateLimit-Reset')) {
                    this.rateLimitInfo.resetTime = new Date(parseInt(response.headers.get('X-RateLimit-Reset')) * 1000);
                }
                this.saveRateLimitToCache();
                this.updateRateLimitDisplay();
            }
            
            throw new Error(`GitHub API Error: ${response.status} - ${errorData.message || response.statusText}`);
        }

        return await response.json();
    }

    updateProgress(current, total, type) {
        const percentage = Math.round((current / total) * 100);
        const progressBar = document.getElementById('progressBar');
        const loadingStatus = document.getElementById('loadingStatus');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        
        if (loadingStatus) {
            loadingStatus.textContent = `Processing ${current}/${total} ${type}...`;
        }
    }

    updateUI() {
        this.populateRepositoryFilter();
        this.populateAssigneeFilter();
        this.populateLabelFilter();
        this.updateStats();
        this.updateRateLimitDisplay();
        this.updateCacheStatusDisplay();
        this.filterAndDisplayIssues();
        
        // Keep filters hidden by default - user can toggle with search button
        // document.getElementById('filtersSection').style.display = 'block';
        document.getElementById('statsSection').style.display = 'flex';
        document.getElementById('issuesContainer').style.display = 'block';
    }

    populateRepositoryFilter() {
        const select = document.getElementById('repoFilter');
        
        // Calculate total for "All Repositories"
        let totalIssues = 0;
        if (this.repositoryIssueCounts) {
            totalIssues = Object.values(this.repositoryIssueCounts)
                .reduce((sum, counts) => sum + (counts.total || 0), 0);
        }
        
        const allReposText = totalIssues > 0 ? `All Repositories (${totalIssues})` : 'All Repositories';
        
        // Start with empty select
        select.innerHTML = '';
        
        // Sort repositories to put Projects first, then others, then All Repositories at the end
        const sortedRepos = [...this.repositories].sort((a, b) => {
            if (a.name === 'projects') return -1;
            if (b.name === 'projects') return 1;
            const aName = (a.displayName || a.name || '').toString();
            const bName = (b.displayName || b.name || '').toString();
            return aName.localeCompare(bName);
        });
        
        // Add individual repositories first (Projects will be at the top)
        sortedRepos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.name;
            
            // Use cached issue counts if available
            const counts = this.repositoryIssueCounts[repo.name];
            let issueText = '';
            if (counts && counts.total > 0) {
                issueText = ` (${counts.total})`;
            } else if (repo.openIssueCount !== null) {
                issueText = ` (${repo.openIssueCount})`;
            }
            
            const repoName = repo.displayName || repo.name || 'Unknown';
            option.textContent = `${repoName}${issueText}`;
            console.log('📂 Adding repo to dropdown:', repo);
            select.appendChild(option);
        });
        
        // Add "All Repositories" option at the end
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = allReposText;
        select.appendChild(allOption);
        
        select.value = this.filters.repo;
        
        // If projects repo exists in the list, make sure it's selected when appropriate
        const projectsOption = Array.from(select.options).find(option => option.value === 'projects');
        if (projectsOption && this.filters.repo === 'projects') {
            select.value = 'projects';
        }
    }

    updateRepositoryDropdown() {
        // Update the dropdown with current issue counts
        this.populateRepositoryFilter();
        
        // Update the last refresh time display
        this.updateLastRefreshDisplay();
    }

    populateRepositoryDropdown() {
        // Alias for backwards compatibility
        this.updateRepositoryDropdown();
    }

    updateLastRefreshDisplay() {
        // This method is kept for backwards compatibility
        this.updateHeaderRefreshDisplay();
    }

    updateHeaderRefreshDisplay() {
        const headerRefreshTimeSpan = document.getElementById('headerRefreshTime');
        
        if (this.lastRefreshTime && headerRefreshTimeSpan) {
            const timeString = this.lastRefreshTime.toLocaleTimeString([], { 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true 
            });
            headerRefreshTimeSpan.textContent = timeString;
        }
    }

    startAutoRefreshTimer() {
        // Clear existing timer
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        // Check every 5 minutes if we can refresh
        this.autoRefreshInterval = setInterval(async () => {
            const cacheTime = localStorage.getItem('repo_issue_counts_time');
            if (cacheTime) {
                const age = Date.now() - parseInt(cacheTime);
                const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
                
                if (age >= fiveMinutes) {
                    console.log('Auto-refreshing repository issue counts...');
                    await this.loadAllRepositoryIssueCounts();
                }
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    stopAutoRefreshTimer() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    populateAssigneeFilter() {
        const dropdown = document.getElementById('assigneeDropdown');
        
        // Keep existing default options
        const defaultOptions = dropdown.innerHTML;
        dropdown.innerHTML = defaultOptions;
        
        // Add assignees
        Array.from(this.assignees).sort().forEach(assignee => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.setAttribute('data-assignee', assignee);
            item.innerHTML = `<i class="fas fa-user"></i> ${assignee}`;
            dropdown.appendChild(item);
        });
        
        // Set default assignee based on gitAccount if available
        setTimeout(() => {
            if (typeof updateAssigneeButtonDefault === 'function') {
                updateAssigneeButtonDefault();
            }
        }, 100);
    }

    populateLabelFilter() {
        const dropdown = document.getElementById('labelDropdown');
        
        // Keep existing default options
        const defaultOptions = dropdown.innerHTML;
        dropdown.innerHTML = defaultOptions;
        
        // Add labels
        Array.from(this.labels).sort().forEach(label => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.setAttribute('data-label', label);
            item.innerHTML = `<i class="fas fa-tag"></i> ${label}`;
            dropdown.appendChild(item);
        });
    }

    updateStats() {
        const totalRepos = this.repositories.length;
        const openIssues = this.allIssues.filter(issue => issue.state === 'open').length;
        const closedIssues = this.allIssues.filter(issue => issue.state === 'closed').length;
        const totalComments = this.allIssues.reduce((sum, issue) => sum + (issue.comments || 0), 0);

        document.getElementById('repoCount').textContent = totalRepos;
        document.getElementById('openIssueCount').textContent = openIssues;
        document.getElementById('closedIssueCount').textContent = closedIssues;
        document.getElementById('totalComments').textContent = totalComments;
    }

    filterAndDisplayIssues() {
        console.log(`Filtering ${this.allIssues.length} total issues with filters:`, this.filters);
        this.filteredIssues = this.allIssues.filter(issue => {
            // Repository filter
            if (this.filters.repo !== 'all' && issue.repository !== this.filters.repo) {
                return false;
            }

            // State filter
            if (this.filters.state !== 'all' && issue.state !== this.filters.state) {
                return false;
            }

            // Assignee filter
            if (this.filters.assignee !== 'all') {
                if (this.filters.assignee === 'unassigned') {
                    if (issue.assignees && issue.assignees.length > 0) return false;
                } else {
                    if (!issue.assignees || !issue.assignees.some(a => a.login === this.filters.assignee)) {
                        return false;
                    }
                }
            }

            // Label filter
            if (this.filters.label !== 'all') {
                if (!issue.labels || !issue.labels.some(l => l.name === this.filters.label)) {
                    return false;
                }
            }

            // Search filter
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                const searchableText = [
                    issue.title,
                    issue.body || '',
                    issue.number.toString(),
                    ...(issue.labels || []).map(l => l.name)
                ].join(' ').toLowerCase();
                
                if (!searchableText.includes(searchTerm)) {
                    return false;
                }
            }

            return true;
        });

        console.log(`After filtering: ${this.filteredIssues.length} issues match the filters`);
        this.sortIssues();
        this.displayIssues();
    }

    sortIssues() {
        this.filteredIssues.sort((a, b) => {
            switch (this.filters.sort) {
                case 'created':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'comments':
                    return (b.comments || 0) - (a.comments || 0);
                case 'title':
                    return (a.title || '').localeCompare(b.title || '');
                case 'number':
                    return b.number - a.number;
                case 'updated':
                default:
                    return new Date(b.updated_at) - new Date(a.updated_at);
            }
        });
    }

    displayIssues() {
        const issuesList = document.getElementById('issuesList');
        const startIndex = (this.currentPage - 1) * this.perPage;
        const endIndex = startIndex + this.perPage;
        const pageIssues = this.filteredIssues.slice(startIndex, endIndex);

        issuesList.innerHTML = '';

        if (pageIssues.length === 0) {
            issuesList.innerHTML = `
                <div class="no-issues">
                    <i class="fas fa-search"></i>
                    <h3>No issues found</h3>
                    <p>Try adjusting your filters or search terms.</p>
                </div>
            `;
        } else {
            pageIssues.forEach(issue => {
                const issueElement = this.createIssueElement(issue);
                issuesList.appendChild(issueElement);
            });
        }

        this.updatePagination();
    }

    createIssueElement(issue) {
        const issueDiv = document.createElement('div');
        issueDiv.className = 'issue-item';
        issueDiv.setAttribute('data-issue-id', issue.id);

        // Determine if we're showing multiple repositories
        const showingMultipleRepos = this.filters.repo === 'all' || this.repositoryIssueCounts && Object.keys(this.repositoryIssueCounts).length > 1;
        
        // Get current view type
        const currentView = this.currentView;
        
        const stateIcon = issue.state === 'open' ? 
            '<i class="fas fa-exclamation-circle issue-open"></i>' : 
            '<i class="fas fa-check-circle issue-closed"></i>';

        const assigneesHtml = issue.assignees && issue.assignees.length > 0 ? 
            issue.assignees.map(assignee => `
                <img src="${assignee.avatar_url}" alt="${assignee.login}" class="assignee-avatar" title="${assignee.login}">
            `).join('') : '';

        const labelsHtml = issue.labels && issue.labels.length > 0 ? 
            issue.labels.map(label => `
                <span class="issue-label" style="background-color: #${label.color}; color: ${this.getContrastColor(label.color)}">
                    ${label.name}
                </span>
            `).join('') : '';

        // Row view content (title + body preview)
        if (currentView === 'row') {
            issueDiv.innerHTML = `
                <div class="issue-header">
                    <div class="issue-title-row">
                        ${stateIcon}
                        <div class="issue-number">#${issue.number}</div>
                        <h3 class="issue-title">
                            <a href="${issue.html_url}" target="_blank">${this.escapeHtml(issue.title)}</a>
                        </h3>
                        
                        <!-- Issue Actions Menu -->
                        <div class="issue-actions-menu">
                            <button class="issue-menu-btn" onclick="issuesManager.toggleIssueMenu('${issue.id}', event)" title="Issue Actions">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="issue-menu-dropdown" id="issueMenu-${issue.id}">
                                <div class="menu-item" onclick="issuesManager.refreshSingleIssue('${issue.id}')">
                                    <i class="fas fa-sync-alt"></i> Refresh
                                </div>
                                <div class="menu-item" onclick="window.open('${issue.html_url}', '_blank')">
                                    <i class="fas fa-external-link-alt"></i> Open in GitHub
                                </div>
                                <div class="menu-item" onclick="issuesManager.copyIssueLink('${issue.html_url}')">
                                    <i class="fas fa-link"></i> Copy Link
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ${issue.body ? `
                    <div class="issue-description">
                        ${this.formatMarkdown(issue.body.substring(0, 150))}${issue.body.length > 150 ? '...' : ''}
                    </div>
                ` : ''}
            `;
            return issueDiv;
        }

        const repoInfo = this.repositories.find(r => r.name === issue.repository) || {};
        const repoImages = repoInfo.images && repoInfo.images.length > 0 ? `
            <div class="repo-images">
                ${repoInfo.images.slice(0, 2).map(img => `
                    <img src="${img.download_url}" alt="${img.name}" class="repo-image">
                `).join('')}
            </div>
        ` : '';

        issueDiv.innerHTML = `
            <div class="issue-header">
                <div class="issue-title-row">
                    ${stateIcon}
                    <div class="issue-number">#${issue.number}</div>
                    <h3 class="issue-title">
                        <a href="${issue.html_url}" target="_blank">${this.escapeHtml(issue.title)}</a>
                    </h3>
                    
                    <!-- Issue Actions Menu -->
                    <div class="issue-actions-menu">
                        <button class="issue-menu-btn" onclick="issuesManager.toggleIssueMenu('${issue.id}', event)" title="Issue Actions">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="issue-menu-dropdown" id="issueMenu-${issue.id}">
                            <div class="menu-item" onclick="issuesManager.refreshSingleIssue('${issue.id}')">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </div>
                            <div class="menu-item" onclick="window.open('${issue.html_url}', '_blank')">
                                <i class="fas fa-external-link-alt"></i> Open in GitHub
                            </div>
                            <div class="menu-item" onclick="issuesManager.copyIssueLink('${issue.html_url}')">
                                <i class="fas fa-link"></i> Copy Link
                            </div>
                        </div>
                    </div>
                </div>
                <div class="issue-meta">
                    <span class="repo-name">
                        <i class="fas fa-code-branch"></i>
                        <a href="${issue.repository_url}" target="_blank">${issue.repository}</a>
                    </span>
                    <span class="issue-date">
                        <i class="fas fa-clock"></i>
                        Updated ${this.formatDate(issue.updated_at)}
                    </span>
                    ${issue.comments > 0 ? `
                        <span class="comment-count">
                            <i class="fas fa-comments"></i>
                            ${issue.comments}
                        </span>
                    ` : ''}
                </div>
            </div>

            <div class="issue-body">
                ${issue.body ? `
                    <div class="issue-description">
                        ${this.formatMarkdown(issue.body.substring(0, 300))}
                        ${issue.body.length > 300 ? '...' : ''}
                    </div>
                ` : ''}
                
                ${labelsHtml ? `<div class="issue-labels">${labelsHtml}</div>` : ''}
                
                <div class="issue-footer">
                    <div class="issue-author">
                        <img src="${issue.user.avatar_url}" alt="${issue.user.login}" class="author-avatar">
                        <span>by ${issue.user.login}</span>
                    </div>
                    
                    ${assigneesHtml ? `<div class="issue-assignees">${assigneesHtml}</div>` : ''}
                    
                    <div class="issue-actions">
                        <button class="btn btn-sm btn-outline" onclick="issuesManager.showIssueDetails(${issue.id})">
                            <i class="fas fa-eye"></i><span> Details</span>
                        </button>
                        <!-- GitHub button commented out - now available in 3-dot menu -->
                        <!--<a href="${issue.html_url}" target="_blank" class="btn btn-sm btn-outline">
                            <i class="fab fa-github"></i><span> GitHub</span>
                        </a>-->
                    </div>
                </div>
                
                ${repoImages}
                
                <!-- Content for narrow card view (handled by CSS) -->
                <div class="issue-repo-name" style="display: ${showingMultipleRepos ? 'block' : 'none'};">
                    ${issue.repository}
                </div>
                ${!showingMultipleRepos && issue.body ? `
                    <div class="issue-body-preview">
                        ${this.formatMarkdown(issue.body.substring(0, 100))}${issue.body.length > 100 ? '...' : ''}
                    </div>
                ` : ''}
            </div>
        `;

        return issueDiv;
    }

    async showIssueDetails(issueId) {
        const issue = this.allIssues.find(i => i.id === issueId);
        if (!issue) return;

        const modal = document.getElementById('issueModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        modalTitle.textContent = `${issue.title} #${issue.number}`;

        // Create detailed view
        const stateIcon = issue.state === 'open' ? 
            '<i class="fas fa-exclamation-circle issue-open"></i>' : 
            '<i class="fas fa-check-circle issue-closed"></i>';

        const assigneesHtml = issue.assignees && issue.assignees.length > 0 ? 
            issue.assignees.map(assignee => `
                <div class="assignee-detail">
                    <img src="${assignee.avatar_url}" alt="${assignee.login}" class="assignee-avatar">
                    <span>${assignee.login}</span>
                </div>
            `).join('') : '<span class="text-muted">No assignees</span>';

        const labelsHtml = issue.labels && issue.labels.length > 0 ? 
            issue.labels.map(label => `
                <span class="issue-label" style="background-color: #${label.color}; color: ${this.getContrastColor(label.color)}">
                    ${label.name}
                </span>
            `).join('') : '<span class="text-muted">No labels</span>';

        const commentsHtml = issue.comment_details && issue.comment_details.length > 0 ? 
            issue.comment_details.map(comment => `
                <div class="comment-item">
                    <div class="comment-header">
                        <img src="${comment.user.avatar_url}" alt="${comment.user.login}" class="comment-avatar">
                        <strong>${comment.user.login}</strong>
                        <span class="comment-date">${this.formatDate(comment.created_at)}</span>
                    </div>
                    <div class="comment-body">
                        ${this.formatMarkdown(comment.body)}
                    </div>
                </div>
            `).join('') : '<p class="text-muted">No comments</p>';

        modalBody.innerHTML = `
            <div class="issue-detail">
                <div class="issue-header-detail">
                    ${stateIcon}
                    <div class="issue-meta-detail">
                        <div class="repo-info">
                            <i class="fas fa-code-branch"></i>
                            <a href="${issue.repository_url}" target="_blank">${issue.repository}</a>
                        </div>
                        <div class="issue-dates">
                            <div><i class="fas fa-plus"></i> Created: ${this.formatDate(issue.created_at)}</div>
                            <div><i class="fas fa-clock"></i> Updated: ${this.formatDate(issue.updated_at)}</div>
                        </div>
                    </div>
                </div>

                <div class="issue-section">
                    <h4>Description</h4>
                    <div class="issue-description-full">
                        ${issue.body ? this.formatMarkdown(issue.body) : '<span class="text-muted">No description provided</span>'}
                    </div>
                </div>

                <div class="issue-section">
                    <h4>Labels</h4>
                    <div class="issue-labels-detail">
                        ${labelsHtml}
                    </div>
                </div>

                <div class="issue-section">
                    <h4>Assignees</h4>
                    <div class="assignees-detail">
                        ${assigneesHtml}
                    </div>
                </div>

                <div class="issue-section">
                    <h4>Comments (${issue.comments || 0})</h4>
                    <div class="comments-section">
                        ${commentsHtml}
                    </div>
                </div>

                <div class="issue-actions-detail">
                    <a href="${issue.html_url}" target="_blank" class="btn btn-primary">
                        <i class="fab fa-github"></i> View on GitHub
                    </a>
                    <a href="${issue.html_url}/edit" target="_blank" class="btn btn-secondary">
                        <i class="fas fa-edit"></i> Edit Issue
                    </a>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    closeModal() {
        document.getElementById('issueModal').style.display = 'none';
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredIssues.length / this.perPage);
        const startIndex = (this.currentPage - 1) * this.perPage;
        const endIndex = Math.min(startIndex + this.perPage, this.filteredIssues.length);

        // Get container width for display
        const container = document.getElementById(this.containerId);
        const containerWidth = container ? container.offsetWidth : 0;
        
        // Update pagination info with width and fullscreen controls
        const paginationInfo = document.getElementById('paginationInfo');
        const fullscreenIcon = this.isFullscreen ? 'fa-compress' : 'fa-expand';
        const fullscreenTitle = this.isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen';
        
        const leftText = this.filteredIssues.length === 0 ? 
            'No issues found' : 
            `Showing ${startIndex + 1}-${endIndex} of ${this.filteredIssues.length} issues (${this.perPage} per page)`;
            
        const rightText = `Widget width ${containerWidth}px <i class="fas ${fullscreenIcon} fullscreen-btn" onclick="issuesManager.toggleFullscreen()" title="${fullscreenTitle}" style="margin-left: 0.5rem; cursor: pointer; color: var(--primary-color);"></i>`;
        
        paginationInfo.innerHTML = `<span class="pagination-left">${leftText}</span><span class="pagination-right" style="color: var(--text-muted); font-size: 0.85em;">${rightText}</span>`;
        
        // Update header fullscreen icon
        const headerIcon = document.querySelector('.header-fullscreen-btn');
        if (headerIcon) {
            headerIcon.className = `fas ${fullscreenIcon} header-fullscreen-btn`;
            headerIcon.title = fullscreenTitle;
        }

        // Update pagination controls
        const paginationControls = document.getElementById('paginationControls');
        paginationControls.innerHTML = '';

        if (totalPages <= 1) return;

        // Previous button
        const prevButton = document.createElement('button');
        prevButton.className = `pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}`;
        prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevButton.onclick = () => this.goToPage(this.currentPage - 1);
        paginationControls.appendChild(prevButton);

        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `pagination-btn ${i === this.currentPage ? 'active' : ''}`;
            pageButton.textContent = i;
            pageButton.onclick = () => this.goToPage(i);
            paginationControls.appendChild(pageButton);
        }

        // Next button
        const nextButton = document.createElement('button');
        nextButton.className = `pagination-btn ${this.currentPage === totalPages ? 'disabled' : ''}`;
        nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextButton.onclick = () => this.goToPage(this.currentPage + 1);
        paginationControls.appendChild(nextButton);
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredIssues.length / this.perPage);
        if (page < 1 || page > totalPages) return;
        
        this.currentPage = page;
        this.displayIssues();
        
        // Scroll to top of issues
        document.getElementById('issuesContainer').scrollIntoView({ behavior: 'smooth' });
    }

    // Utility methods
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'today';
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        
        return date.toLocaleDateString();
    }

    formatMarkdown(text) {
        // Basic markdown formatting
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getContrastColor(hexColor) {
        // Convert hex to RGB
        const r = parseInt(hexColor.substr(0, 2), 16);
        const g = parseInt(hexColor.substr(2, 2), 16);
        const b = parseInt(hexColor.substr(4, 2), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    // State management
    updateHash() {
        const params = new URLSearchParams();
        Object.entries(this.filters).forEach(([key, value]) => {
            if (value && value !== 'all' && value !== '') {
                params.set(key, value);
            }
        });
        
        const hash = params.toString() ? `#${params.toString()}` : '';
        window.history.replaceState(null, null, window.location.pathname + hash);
    }

    loadFromHash() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;

        const params = new URLSearchParams(hash);
        params.forEach((value, key) => {
            if (this.filters.hasOwnProperty(key)) {
                this.filters[key] = value;
            }
        });

        this.updateFilterUI();
    }

    updateFilterUI() {
        // Update filter dropdowns and inputs
        document.getElementById('repoFilter').value = this.filters.repo;
        document.getElementById('searchInput').value = this.filters.search;
        
        this.updateSortButton();
        this.updateAssigneeButton();
        this.updateStateButton();
        this.updateLabelButton();
        
        if (this.filters.search) {
            document.getElementById('clearSearch').style.display = 'inline-block';
        }
    }

    updateSortButton() {
        const button = document.getElementById('sortButton');
        const sortNames = {
            updated: 'Updated',
            created: 'Created',
            comments: 'Comments',
            title: 'Title',
            number: 'Number'
        };
        button.innerHTML = `
            <i class="fas fa-sort"></i> Sort by: ${sortNames[this.filters.sort]}
            <i class="fas fa-chevron-down"></i>
        `;
    }

    updateAssigneeButton() {
        const button = document.getElementById('assigneeButton');
        let displayText = 'All';
        if (this.filters.assignee === 'unassigned') {
            displayText = 'Unassigned';
        } else if (this.filters.assignee !== 'all') {
            displayText = this.filters.assignee;
        }
        button.innerHTML = `
            <i class="fas fa-user"></i> Assigned to: ${displayText}
            <i class="fas fa-chevron-down"></i>
        `;
    }

    updateStateButton() {
        const button = document.getElementById('stateButton');
        const stateNames = {
            open: 'Open',
            closed: 'Closed',
            all: 'All'
        };
        button.innerHTML = `
            <i class="fas fa-exclamation-circle"></i> State: ${stateNames[this.filters.state]}
            <i class="fas fa-chevron-down"></i>
        `;
    }

    updateLabelButton() {
        const button = document.getElementById('labelButton');
        let displayText = this.filters.label === 'all' ? 'All' : this.filters.label;
        button.innerHTML = `
            <i class="fas fa-tags"></i> Labels: ${displayText}
            <i class="fas fa-chevron-down"></i>
        `;
    }

    saveToCache() {
        const cacheData = {
            filters: this.filters,
            repositories: this.repositories,
            issues: this.allIssues,
            timestamp: Date.now()
        };
        localStorage.setItem('github_issues_cache', JSON.stringify(cacheData));
        
        // Set up cache expiration timer for auto-refresh
        if (this.cacheConfig.autoRefresh) {
            this.setupCacheExpirationTimer(this.cacheConfig.duration * 60 * 1000);
        }
        
        // Update cache status display
        this.updateCacheStatusDisplay();
    }
    
    saveViewPreference() {
        localStorage.setItem('github_issues_view', this.currentView);
    }
    
    loadViewPreference() {
        const savedView = localStorage.getItem('github_issues_view');
        if (savedView && (savedView === 'list' || savedView === 'card')) {
            this.currentView = savedView;
            this.setView(savedView, false); // Don't save when loading
        }
    }
    
    toggleFullscreen() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        this.isFullscreen = !this.isFullscreen;
        
        if (this.isFullscreen) {
            // Enter fullscreen
            container.classList.add('widget-fullscreen');
            document.body.classList.add('widget-fullscreen-active');
            
            // Add minimize button to main header next to search icon
            const mainHeader = document.querySelector('.issues-header');
            if (mainHeader && !mainHeader.querySelector('.minimize-btn')) {
                const minimizeBtn = document.createElement('button');
                minimizeBtn.className = 'minimize-btn';
                minimizeBtn.innerHTML = '<i class="fas fa-compress"></i>';
                minimizeBtn.title = 'Exit Fullscreen';
                minimizeBtn.onclick = () => this.toggleFullscreen();
                mainHeader.appendChild(minimizeBtn);
            }
            
        } else {
            // Exit fullscreen
            container.classList.remove('widget-fullscreen');
            document.body.classList.remove('widget-fullscreen-active');
            
            // Remove minimize button
            const minimizeBtn = document.querySelector('.minimize-btn');
            if (minimizeBtn) {
                minimizeBtn.remove();
            }
            
        }
        
        // Update icon in pagination
        this.updatePagination();
    }

    toggleFilters() {
        const filtersSection = document.getElementById('filtersSection');
        const closeBtn = document.getElementById('filtersCloseBtn');
        
        if (!filtersSection) return;
        
        if (filtersSection.classList.contains('show-filters')) {
            filtersSection.classList.remove('show-filters');
            if (closeBtn) closeBtn.style.display = 'none';
        } else {
            filtersSection.classList.add('show-filters');
            if (closeBtn) closeBtn.style.display = 'block';
        }
    }

    hideFilters() {
        const filtersSection = document.getElementById('filtersSection');
        const closeBtn = document.getElementById('filtersCloseBtn');
        
        if (filtersSection) filtersSection.classList.remove('show-filters');
        if (closeBtn) closeBtn.style.display = 'none';
    }

    // Issue menu functionality
    toggleIssueMenu(issueId, event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        
        // Close all other open menus
        document.querySelectorAll('.issue-menu-dropdown').forEach(menu => {
            if (menu.id !== `issueMenu-${issueId}`) {
                menu.classList.remove('show');
            }
        });
        
        // Toggle current menu
        const menu = document.getElementById(`issueMenu-${issueId}`);
        if (menu) {
            menu.classList.toggle('show');
        }
    }

    async refreshSingleIssue(issueId) {
        try {
            // Close menu
            const menu = document.getElementById(`issueMenu-${issueId}`);
            if (menu) menu.classList.remove('show');
            
            // Find the issue in our current data
            const existingIssue = this.allIssues.find(issue => issue.id == issueId);
            if (!existingIssue) {
                this.showNotification('Issue not found', 'error');
                return;
            }
            
            // Show loading indicator on specific issue
            this.showIssueLoading(issueId, true);
            
            // Fetch fresh issue data from GitHub API
            const updatedIssue = await this.apiRequest(
                `/repos/${this.owner}/${existingIssue.repository}/issues/${existingIssue.number}`
            );
            
            // Preserve repository information
            updatedIssue.repository = existingIssue.repository;
            updatedIssue.repository_url = existingIssue.repository_url;
            
            // Update the issue in our data arrays
            this.updateIssueInCollections(updatedIssue);
            
            // Re-render only this specific issue
            this.rerenderSingleIssue(issueId, updatedIssue);
            
            // Update cache with new data
            this.saveToCache();
            
            this.showNotification(`Issue #${updatedIssue.number} refreshed`, 'success');
            
        } catch (error) {
            console.error('Error refreshing single issue:', error);
            if (error.name === 'AbortError') {
                this.showNotification('Refresh timed out', 'warning');
            } else if (error.message.includes('403')) {
                this.showNotification('API rate limit exceeded', 'error');
            } else {
                this.showNotification('Failed to refresh issue', 'error');
            }
        } finally {
            this.showIssueLoading(issueId, false);
        }
    }

    updateIssueInCollections(updatedIssue) {
        // Update in main issues array
        const mainIndex = this.allIssues.findIndex(issue => issue.id == updatedIssue.id);
        if (mainIndex !== -1) {
            this.allIssues[mainIndex] = updatedIssue;
        }
        
        // Update in filtered array if present
        const filteredIndex = this.filteredIssues.findIndex(issue => issue.id == updatedIssue.id);
        if (filteredIndex !== -1) {
            this.filteredIssues[filteredIndex] = updatedIssue;
        }
        
        // Update repository-specific cache if exists
        if (this.repositoryIssues[updatedIssue.repository]) {
            const repoIndex = this.repositoryIssues[updatedIssue.repository].findIndex(
                issue => issue.id == updatedIssue.id
            );
            if (repoIndex !== -1) {
                this.repositoryIssues[updatedIssue.repository][repoIndex] = updatedIssue;
            }
        }
    }

    rerenderSingleIssue(issueId, updatedIssue) {
        const existingElement = document.querySelector(`[data-issue-id="${issueId}"]`);
        if (existingElement) {
            // Create new element with updated data
            const newElement = this.createIssueElement(updatedIssue);
            
            // Replace existing element with smooth transition
            existingElement.style.opacity = '0.5';
            
            setTimeout(() => {
                existingElement.replaceWith(newElement);
                newElement.style.opacity = '0';
                newElement.offsetHeight; // Force reflow
                newElement.style.transition = 'opacity 0.3s ease';
                newElement.style.opacity = '1';
            }, 150);
        }
    }

    showIssueLoading(issueId, isLoading) {
        const issueElement = document.querySelector(`[data-issue-id="${issueId}"]`);
        if (issueElement) {
            if (isLoading) {
                issueElement.classList.add('issue-refreshing');
                // Add subtle loading indicator
                const loader = document.createElement('div');
                loader.className = 'issue-refresh-loader';
                loader.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
                issueElement.appendChild(loader);
            } else {
                issueElement.classList.remove('issue-refreshing');
                const loader = issueElement.querySelector('.issue-refresh-loader');
                if (loader) loader.remove();
            }
        }
    }

    async copyIssueLink(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.showNotification('Issue link copied to clipboard', 'success');
        } catch (error) {
            console.error('Failed to copy link:', error);
            this.showNotification('Failed to copy link', 'error');
        }
    }

    // Close menus when clicking outside
    setupMenuClickHandler() {
        document.addEventListener('click', (event) => {
            // Check if click is outside any issue menu
            if (!event.target.closest('.issue-actions-menu')) {
                document.querySelectorAll('.issue-menu-dropdown').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }

    loadFromCache() {
        try {
            const cached = localStorage.getItem('github_issues_cache');
            if (!cached) return null;

            const data = JSON.parse(cached);
            
            // Check if cache is less than configured duration old
            const maxAge = this.cacheConfig.duration * 60 * 1000; // Convert minutes to milliseconds
            const cacheAge = Date.now() - data.timestamp;
            if (cacheAge > maxAge) {
                console.log(`Cache expired (${Math.round(cacheAge / 60000)} minutes old, max age: ${this.cacheConfig.duration} minutes)`);
                return null;
            }

            if (data.filters) {
                this.filters = { ...this.filters, ...data.filters };
            }

            // Set up cache expiration timer if auto-refresh is enabled
            if (this.cacheConfig.autoRefresh) {
                this.setupCacheExpirationTimer(maxAge - cacheAge);
            }

            console.log(`Loaded from cache (${Math.round(cacheAge / 60000)} minutes old)`);
            return data;
        } catch (error) {
            console.warn('Failed to load from cache:', error);
            return null;
        }
    }

    // Search functionality
    performSearch() {
        const searchInput = document.getElementById('searchInput');
        this.filters.search = searchInput.value.trim();
        this.currentPage = 1;
        this.updateHash();
        this.saveToCache();
        this.filterAndDisplayIssues();
        
        if (this.filters.search) {
            document.getElementById('clearSearch').style.display = 'inline-block';
        }
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearch').style.display = 'none';
        this.filters.search = '';
        this.currentPage = 1;
        this.updateHash();
        this.saveToCache();
        this.filterAndDisplayIssues();
    }

    // View management
    setView(viewType, savePreference = true) {
        this.currentView = viewType;
        
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(viewType + 'View').classList.add('active');
        
        const issuesList = document.getElementById('issuesList');
        issuesList.className = `issues-list ${viewType}-view`;
        
        // Save view preference to localStorage (unless loading from saved preference)
        if (savePreference) {
            this.saveViewPreference();
        }
    }

    // Filters expand/collapse management
    expandFilters() {
        const filtersSection = document.getElementById('filtersSection');
        filtersSection.classList.add('expanded');
    }

    collapseFilters() {
        const filtersSection = document.getElementById('filtersSection');
        filtersSection.classList.remove('expanded');
    }

    // UI helpers
    showLoading(show) {
        const issuesContainer = document.getElementById('issuesContainer');
        const issuesList = document.getElementById('issuesList');
        const loadingOverlay = document.getElementById('loadingOverlay');
        
        if (show) {
            // Show issues container and display loading inside it
            issuesContainer.style.display = 'block';
            issuesList.innerHTML = `
                <div class="loading-content">
                    <div class="spinner"></div>
                    <p>Loading GitHub data...</p>
                    <div class="loading-progress">
                        <div class="progress-bar" id="progressBar" style="width: 0%;"></div>
                    </div>
                    <p class="loading-status" id="loadingStatus">Fetching repositories...</p>
                </div>
            `;
            // Hide the overlay loading
            loadingOverlay.style.display = 'none';
        } else {
            // Hide the overlay loading (if it was showing)
            loadingOverlay.style.display = 'none';
            // Issues container will be managed by updateUI() method
        }
    }

    updateLoadingStatus(status) {
        document.getElementById('loadingStatus').textContent = status;
    }

    showError(message) {
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('errorText').textContent = message;
        document.getElementById('filtersSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('issuesContainer').style.display = 'none';
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }

    showNotification(message, type = 'info') {
        // Check if this is a loading message that should be shown in issues container
        const isLoadingMessage = message.toLowerCase().includes('loading');
        
        if (isLoadingMessage) {
            // Show loading messages inside the issues container
            this.showInlineNotification(message, type);
        } else {
            // Show other notifications as floating (existing behavior)
            this.showFloatingNotification(message, type);
        }
    }

    showInlineNotification(message, type = 'info') {
        const issuesContainer = document.getElementById('issuesContainer');
        const issuesList = document.getElementById('issuesList');
        
        if (!issuesContainer || !issuesList) return;
        
        // Make sure issues container is visible
        issuesContainer.style.display = 'block';
        
        // Create notification element with subtle styling
        const notification = document.createElement('div');
        notification.className = `inline-notification ${type}`;
        
        // Use spinner for loading messages, other icons for other types
        const isLoadingMessage = message.toLowerCase().includes('loading');
        let iconHtml;
        
        if (isLoadingMessage) {
            iconHtml = '<i class="fas fa-spinner fa-spin inline-spinner"></i>';
        } else {
            const iconMap = {
                'success': 'check',
                'error': 'exclamation-triangle',
                'info': 'info'
            };
            const icon = iconMap[type] || 'info';
            iconHtml = `<i class="fas fa-${icon}-circle"></i>`;
        }
        
        notification.innerHTML = `
            ${iconHtml}
            ${message}
        `;
        
        // Clear any existing inline notifications
        const existingNotification = issuesList.querySelector('.inline-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Add to top of issues list
        issuesList.insertBefore(notification, issuesList.firstChild);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    showFloatingNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const iconMap = {
            'success': 'check',
            'error': 'exclamation-triangle',
            'info': 'info'
        };
        const icon = iconMap[type] || 'info';
        
        notification.innerHTML = `
            <i class="fas fa-${icon}-circle"></i>
            ${message}
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show and auto-hide
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showFiltersOnError() {
        // Show basic UI elements even when API fails
        // Keep filters hidden by default - user can toggle with search button
        // document.getElementById('filtersSection').style.display = 'block';
        
        // Populate repository filter from loaded repositories
        this.populateRepositoryFilter();
        
        // Update rate limit display
        this.updateRateLimitDisplay();
        
        // Set basic stats
        document.getElementById('repoCount').textContent = '1';
        document.getElementById('openIssueCount').textContent = '?';
        document.getElementById('closedIssueCount').textContent = '?';
        document.getElementById('totalComments').textContent = '?';
        
        // Show stats section
        document.getElementById('statsSection').style.display = 'flex';
        
        // Show issues container with message
        document.getElementById('issuesContainer').style.display = 'block';
        document.getElementById('issuesList').innerHTML = `
            <div class="no-issues">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>API Rate Limit Exceeded</h3>
                <p>GitHub API rate limit reached. Please try again later or add a GitHub token to increase your rate limit.</p>
                <p>You can still use the filters - they will work once the API is accessible again.</p>
            </div>
        `;
        
        // Hide pagination
        document.getElementById('paginationContainer').innerHTML = '';
    }
}

// Git Issues Account Management Functions
function updateGitIssuesAccount() {
    const gitIssuesAccount = document.getElementById("gitIssuesAccount").value;
    
    // Store in localStorage using same cache as other git fields - store even if empty to clear cache
    localStorage.gitAccount = gitIssuesAccount;
    
    // Update the display
    updateGitAccountDisplay();
    
    // Update assignee button default if needed
    updateAssigneeButtonDefault();
}

function updateGitAccountDisplay() {
    const gitAccount = localStorage.gitAccount || document.getElementById("gitIssuesAccount").value;
    const gitAccountDisplay = document.getElementById("gitAccountDisplay");
    const gitAccountLink = document.getElementById("gitAccountLink");
    
    if (gitAccount && gitAccount.trim() !== '' && gitAccountDisplay && gitAccountLink) {
        // Show GitHub account when available
        gitAccountLink.textContent = gitAccount;
        gitAccountLink.href = `https://github.com/${gitAccount}`;
        gitAccountDisplay.innerHTML = ` GitHub: <a href="https://github.com/${gitAccount}" id="gitAccountLink" onclick="toggleGitIssuesAccount(); return false;">${gitAccount}</a>`;
        gitAccountDisplay.style.display = 'inline';
    } else if (gitAccountDisplay && gitAccountLink) {
        // Show "Add my Github name" when no account is cached
        gitAccountDisplay.innerHTML = ` <a href="#" id="gitAccountLink" onclick="toggleGitIssuesAccount(); return false;">Add my Github name</a> - Will soon allow you to display your projects.`;
        gitAccountDisplay.style.display = 'inline';
    }
}

function toggleGitIssuesAccount() {
    const gitIssuesAccountField = document.getElementById("gitIssuesAccount");
    if (gitIssuesAccountField) {
        if (gitIssuesAccountField.style.display === 'none' || !gitIssuesAccountField.style.display) {
            gitIssuesAccountField.style.display = 'inline-block';
            gitIssuesAccountField.focus();
        } else {
            gitIssuesAccountField.style.display = 'none';
        }
    }
}

function updateAssigneeButtonDefault() {
    const gitAccount = localStorage.gitAccount;
    if (!gitAccount || !issuesManager) return;
    
    // Check if gitAccount exists in the assignees list
    if (issuesManager.assignees && issuesManager.assignees.has(gitAccount)) {
        // Only set as default if no other assignee value is cached
        const cachedAssignee = localStorage.getItem('issuesManager_assignee');
        if (!cachedAssignee || cachedAssignee === 'all') {
            issuesManager.filters.assignee = gitAccount;
            issuesManager.updateAssigneeButton();
        }
    }
}

// Initialize Git Issues Account on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const gitIssuesAccountField = document.getElementById("gitIssuesAccount");
        if (gitIssuesAccountField) {
            // Load from localStorage if available
            if (localStorage.gitAccount) {
                gitIssuesAccountField.value = localStorage.gitAccount;
            }
            
            // Add keypress event listener for clearing cache on Enter when field is empty
            gitIssuesAccountField.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && this.value.trim() === '') {
                    localStorage.removeItem('gitAccount');
                    updateGitIssuesAccount();
                }
            });
        }
        
        // Update the display initially
        updateGitAccountDisplay();
    }, 100);
});

// Initialize the issues manager when the page loads
let issuesManager;
document.addEventListener('DOMContentLoaded', () => {
    // Check if there's a specific container, otherwise use default
    const container = document.getElementById('issuesWidget');
    if (container) {
        // Get container ID from data attribute or use default
        const containerId = container.dataset.containerId || 'issuesWidget';
        issuesManager = new GitHubIssuesManager(containerId);
    } else {
        console.error('Issues widget container not found. Please add <div id="issuesWidget"></div> to your page.');
    }
});