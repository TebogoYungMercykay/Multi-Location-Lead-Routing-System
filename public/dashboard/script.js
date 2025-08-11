// script.js

class Dashboard {
    constructor() {
        this.sourceChart = null;
        this.volumeChart = null;
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        await this.loadDashboardData();
        this.startAutoRefresh();
    }

    async loadDashboardData() {
        try {
            // Load routing stats
            await this.loadRoutingStats();
            // Load locations
            await this.loadLocations();
            // Initialize charts
            this.initializeCharts();
            
            this.showSuccess('Dashboard data loaded successfully');
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async loadRoutingStats() {
        try {
            const response = await fetch('/api/dashboard/routing-stats');
            const data = await response.json();
            
            if (data.success) {
                this.updateStats(data.stats);
            }
        } catch (error) {
            console.error('Error loading routing stats:', error);
        }
    }

    async loadLocations() {
        try {
            const response = await fetch('/api/locations');
            const data = await response.json();
            
            if (data.success) {
                this.renderLocations(data.locations);
            }
        } catch (error) {
            console.error('Error loading locations:', error);
        }
    }

    updateStats(stats) {
        document.getElementById('total-leads').textContent = stats.totalRoutings || 0;
        document.getElementById('success-rate').textContent = (stats.successRate || 0) + '%';
        document.getElementById('response-time').textContent = '127ms'; // Mock data
        
        const activeLocations = Object.keys(stats.routingByLocation || {}).length;
        document.getElementById('active-locations').textContent = activeLocations;
    }

    renderLocations(locations) {
        const container = document.getElementById('locations-container');
        
        if (!locations || locations.length === 0) {
            container.innerHTML = '<div class="error">No locations found</div>';
            return;
        }

        container.innerHTML = locations.map(location => `
            <div class="location-card">
                <div class="location-header">
                    <div class="location-name">${location.name}</div>
                    <div class="status-indicator ${location.active ? 'status-active' : 'status-error'}"></div>
                </div>
                <div class="location-stats">
                    <div class="location-stat">
                        <div class="location-stat-value">${this.getRandomLeadCount()}</div>
                        <div class="location-stat-label">Leads Today</div>
                    </div>
                    <div class="location-stat">
                        <div class="location-stat-value">${this.getRandomConversionRate()}%</div>
                        <div class="location-stat-label">Conversion</div>
                    </div>
                </div>
                <div class="capacity-bar">
                    <div class="capacity-fill" style="width: ${this.getRandomCapacity()}%"></div>
                </div>
                <div class="capacity-text">${this.getRandomCapacity()}% Capacity Used</div>
            </div>
        `).join('');
    }

    initializeCharts() {
        this.createSourceChart();
        this.createVolumeChart();
    }

    createSourceChart() {
        const ctx = document.getElementById('sourceChart').getContext('2d');
        
        if (this.sourceChart) {
            this.sourceChart.destroy();
        }

        this.sourceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Facebook Ads', 'Google Ads', 'Website', 'Walk-ins', 'Referrals'],
                datasets: [{
                    data: [35, 25, 20, 12, 8],
                    backgroundColor: [
                        '#667eea',
                        '#764ba2',
                        '#f093fb',
                        '#f5576c',
                        '#4facfe'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    createVolumeChart() {
        const ctx = document.getElementById('volumeChart').getContext('2d');
        
        if (this.volumeChart) {
            this.volumeChart.destroy();
        }

        // Generate mock hourly data for last 24 hours
        const hours = [];
        const data = [];
        const now = new Date();

        for (let i = 23; i >= 0; i--) {
            const hour = new Date(now - i * 60 * 60 * 1000);
            hours.push(hour.getHours() + ':00');
            // Mock data with realistic patterns (higher during business hours)
            const baseValue = hour.getHours() >= 9 && hour.getHours() <= 17 ? 15 : 3;
            data.push(baseValue + Math.random() * 10);
        }

        this.volumeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hours,
                datasets: [{
                    label: 'Leads per Hour',
                    data: data,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            color: '#666'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#666',
                            maxTicksLimit: 12
                        }
                    }
                }
            }
        });
    }

    startAutoRefresh() {
        // Refresh every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadDashboardData();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    showError(message) {
        const container = document.getElementById('error-container');
        container.innerHTML = `<div class="error">❌ ${message}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }

    showSuccess(message) {
        const container = document.getElementById('error-container');
        container.innerHTML = `<div class="success">✅ ${message}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }

    // Helper methods for mock data
    getRandomLeadCount() {
        return Math.floor(Math.random() * 50) + 10;
    }

    getRandomConversionRate() {
        return Math.floor(Math.random() * 30) + 15;
    }

    getRandomCapacity() {
        return Math.floor(Math.random() * 60) + 20;
    }
}

// Global refresh function
function refreshDashboard() {
    const button = document.querySelector('.refresh-button');
    button.style.transform = 'scale(1.1) rotate(360deg)';
    
    dashboard.loadDashboardData();
    
    setTimeout(() => {
        button.style.transform = '';
    }, 300);
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new Dashboard();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (dashboard) {
        dashboard.stopAutoRefresh();
    }
});
