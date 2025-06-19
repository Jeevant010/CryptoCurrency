class CryptoPriceTracker {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 25;
        this.currentCurrency = 'usd';
        this.searchTerm = '';
        this.cryptoData = [];
        this.updateInterval = null;
        
        this.initializeElements();
        this.bindEvents();
        this.loadData();
        this.startAutoRefresh();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('loading'),
            errorMessage: document.getElementById('error-message'),
            errorText: document.getElementById('error-text'),
            retryBtn: document.getElementById('retry-btn'),
            refreshBtn: document.getElementById('refresh-btn'),
            themeToggle: document.getElementById('theme-toggle'),
            currencySelector: document.getElementById('currency-selector'),
            searchInput: document.getElementById('search-input'),
            cryptoTbody: document.getElementById('crypto-tbody'),
            totalMarketCap: document.getElementById('total-market-cap'),
            totalVolume: document.getElementById('total-volume'),
            btcDominance: document.getElementById('btc-dominance'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn'),
            pageInfo: document.getElementById('page-info')
        };
    }

    bindEvents() {
        this.elements.refreshBtn.addEventListener('click', () => this.loadData());
        this.elements.retryBtn.addEventListener('click', () => this.loadData());
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.elements.currencySelector.addEventListener('change', (e) => {
            this.currentCurrency = e.target.value;
            this.loadData();
        });
        this.elements.searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.filterAndDisplayData();
        });
        this.elements.prevBtn.addEventListener('click', () => this.previousPage());
        this.elements.nextBtn.addEventListener('click', () => this.nextPage());
    }

    async loadData() {
        try {
            this.showLoading();
            this.hideError();
            
            const [coinsData, globalData] = await Promise.all([
                this.fetchCoins(),
                this.fetchGlobalData()
            ]);
            
            this.cryptoData = coinsData;
            this.updateGlobalStats(globalData);
            this.filterAndDisplayData();
            
            // Cache data in localStorage
            this.cacheData(coinsData, globalData);
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(error.message);
            this.tryLoadCachedData();
        } finally {
            this.hideLoading();
        }
    }

    async fetchCoins() {
        const response = await this.fetchWithRetry(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${this.currentCurrency}&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=24h`
        );
        
        if (!response.ok) {
            throw new Error(`Failed to fetch coins: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }

    async fetchGlobalData() {
        const response = await this.fetchWithRetry('https://api.coingecko.com/api/v3/global');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch global data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data;
    }

    async fetchWithRetry(url, maxRetries = 3, retryDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url);
                return response;
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await this.delay(retryDelay * Math.pow(2, i)); // Exponential backoff
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    updateGlobalStats(globalData) {
        const currencySymbol = this.getCurrencySymbol(this.currentCurrency);
        
        this.elements.totalMarketCap.textContent = 
            `${currencySymbol}${this.formatNumber(globalData.total_market_cap[this.currentCurrency])}`;
        this.elements.totalVolume.textContent = 
            `${currencySymbol}${this.formatNumber(globalData.total_volume[this.currentCurrency])}`;
        this.elements.btcDominance.textContent = 
            `${globalData.market_cap_percentage.btc.toFixed(1)}%`;
    }

    filterAndDisplayData() {
        let filteredData = this.cryptoData;
        
        if (this.searchTerm) {
            filteredData = this.cryptoData.filter(coin => 
                coin.name.toLowerCase().includes(this.searchTerm) ||
                coin.symbol.toLowerCase().includes(this.searchTerm)
            );
        }
        
        this.displayCoins(filteredData);
        this.updatePagination(filteredData.length);
    }

    displayCoins(coins) {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageCoins = coins.slice(startIndex, endIndex);
        
        this.elements.cryptoTbody.innerHTML = pageCoins.map((coin, index) => {
            const changeClass = coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative';
            const changeIcon = coin.price_change_percentage_24h >= 0 ? '↗' : '↘';
            const currencySymbol = this.getCurrencySymbol(this.currentCurrency);
            
            return `
                <tr>
                    <td>${startIndex + index + 1}</td>
                    <td>
                        <div class="coin-info">
                            <img src="${coin.image}" alt="${coin.name}" class="coin-logo">
                            <div>
                                <div class="coin-name">${coin.name}</div>
                                <div class="coin-symbol">${coin.symbol.toUpperCase()}</div>
                            </div>
                        </div>
                    </td>
                    <td>${currencySymbol}${this.formatPrice(coin.current_price)}</td>
                    <td class="price-change ${changeClass}">
                        ${changeIcon} ${coin.price_change_percentage_24h?.toFixed(2) || 'N/A'}%
                    </td>
                    <td>${currencySymbol}${this.formatNumber(coin.market_cap)}</td>
                    <td>${currencySymbol}${this.formatNumber(coin.total_volume)}</td>
                    <td>${this.formatTime(coin.last_updated)}</td>
                </tr>
            `;
        }).join('');
    }

    updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        
        this.elements.prevBtn.disabled = this.currentPage <= 1;
        this.elements.nextBtn.disabled = this.currentPage >= totalPages;
        this.elements.pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.filterAndDisplayData();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.cryptoData.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.filterAndDisplayData();
        }
    }

    formatPrice(price) {
        if (price < 0.01) return price.toFixed(6);
        if (price < 1) return price.toFixed(4);
        if (price < 100) return price.toFixed(2);
        return price.toLocaleString();
    }

    formatNumber(num) {
        if (!num) return 'N/A';
        if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toLocaleString();
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }

    getCurrencySymbol(currency) {
        const symbols = {
            usd: '$',
            eur: '€',
            btc: '₿'
        };
        return symbols[currency] || '';
    }

    cacheData(coinsData, globalData) {
        try {
            const cacheData = {
                coins: coinsData,
                global: globalData,
                timestamp: Date.now(),
                currency: this.currentCurrency
            };
            localStorage.setItem('cryptoTrackerCache', JSON.stringify(cacheData));
        } catch (error) {
            console.warn('Failed to cache data:', error);
        }
    }

    tryLoadCachedData() {
        try {
            const cached = localStorage.getItem('cryptoTrackerCache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                const isRecentCache = Date.now() - cacheData.timestamp < 5 * 60 * 1000; // 5 minutes
                
                if (isRecentCache && cacheData.currency === this.currentCurrency) {
                    this.cryptoData = cacheData.coins;
                    this.updateGlobalStats(cacheData.global);
                    this.filterAndDisplayData();
                    this.showCacheNotification();
                }
            }
        } catch (error) {
            console.warn('Failed to load cached data:', error);
        }
    }

    showCacheNotification() {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.textContent = 'Showing cached data due to network error';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--warning-color);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1000;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 5000);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        this.elements.themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        
        localStorage.setItem('theme', newTheme);
    }

    startAutoRefresh() {
        // Refresh data every 2 minutes
        this.updateInterval = setInterval(() => {
            this.loadData();
        }, 120000);
    }

    showLoading() {
        this.elements.loading.style.display = 'block';
    }

    hideLoading() {
        this.elements.loading.style.display = 'none';
    }

    showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.errorMessage.style.display = 'block';
    }

    hideError() {
        this.elements.errorMessage.style.display = 'none';
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CryptoPriceTracker();
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
});
