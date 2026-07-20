frappe.pages['sales-reconciliation-dashboard'] = frappe.pages['sales-reconciliation-dashboard'] || {};
frappe.pages['sales-reconciliation-dashboard'].on_page_load = function (wrapper) {
    frappe.require(
        ["https://unpkg.com/vue@3/dist/vue.global.js"],
        () => init_page(wrapper)
    );
};

function init_page(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "",
        single_column: true
    });

    const breakContainer = setInterval(() => {
        const app = document.getElementById('recon-app');
        if (app) {
            let parent = app.parentElement;
            while (parent && parent.tagName !== 'BODY') {
                parent.style.setProperty('max-width', '100%', 'important');
                parent.style.setProperty('width', '100%', 'important');
                if (parent.classList.contains('container')) {
                    parent.classList.remove('container');
                }
                parent = parent.parentElement;
            }
        }
    }, 50);
    setTimeout(() => clearInterval(breakContainer), 5000);

    page.body.append(`<div id="recon-app"></div>`);
    mount_vue_app(page);
}

function amt(v) {
    if (v == null) return "—";
    return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v) {
    if (v == null || isNaN(v)) return "0%";
    return Math.round(v * 100) / 100 + "%";
}

function _generateMockData(filters) {
    const data = [];
    const customers = ["Acme Corp", "Globex", "Initech", "Soylent", "Umbrella Corp"];
    
    // Simulate API responding to filters
    let numToGenerate = 45;
    if (filters.customer) {
        numToGenerate = 15;
    }

    for (let i = 1; i <= numToGenerate; i++) {
        const roll = Math.random();
        const soTotal = 50000 + Math.floor(Math.random() * 50000);
        let siTotal = soTotal;
        let status = "MATCHED";
        
        if (roll < 0.2) {
            siTotal = soTotal - (1000 + Math.floor(Math.random() * 5000));
            status = "UNDERCHARGED";
        } else if (roll < 0.35) {
            siTotal = soTotal + (1000 + Math.floor(Math.random() * 5000));
            status = "OVERCHARGED";
        } else if (roll < 0.45) {
            siTotal = 0;
            status = "PENDING_INVOICE";
        }

        const dateOffset = Math.floor(Math.random() * 90);
        const d = new Date();
        d.setDate(d.getDate() - dateOffset);
        const dateStr = d.toISOString().split('T')[0];
        
        const paymentRoll = Math.random();
        let paymentReceived = 0;
        let outstanding = siTotal;
        let aging = "Current";
        
        if (status !== "PENDING_INVOICE") {
            if (paymentRoll < 0.5) {
                paymentReceived = siTotal;
                outstanding = 0;
            } else if (paymentRoll < 0.8) {
                paymentReceived = siTotal * 0.5;
                outstanding = siTotal * 0.5;
            }
            
            if (outstanding > 0) {
                if (dateOffset > 90) aging = "> 90 Days";
                else if (dateOffset > 60) aging = "60-90 Days";
                else if (dateOffset > 30) aging = "30-60 Days";
                else aging = "< 30 Days";
            }
        }

        let custName = customers[i % customers.length];
        if (filters.customer) custName = filters.customer;

        data.push({
            id: i,
            so_number: `SAL-ORD-2026-${String(i).padStart(4, '0')}`,
            qtn_number: `QUO-2026-${String(i).padStart(4, '0')}`,
            dn_number: status !== "PENDING_INVOICE" ? `DN-2026-${String(i).padStart(4, '0')}` : null,
            si_number: status !== "PENDING_INVOICE" ? `SAL-INV-2026-${String(i).padStart(4, '0')}` : null,
            customer: custName,
            date: dateStr,
            month: d.toLocaleString('default', { month: 'short' }),
            so_total: soTotal,
            si_total: siTotal,
            payment_received: paymentReceived,
            outstanding: outstanding,
            aging: aging,
            status: status,
            variance: siTotal - soTotal,
            expanded: false
        });
    }
    
    data.sort((a,b) => new Date(b.date) - new Date(a.date));
    return data;
}

function mount_vue_app(page) {
    const { createApp } = Vue;

    createApp({
        data() {
            return {
                transactions: [],
                loading: true,
                
                // Pagination
                currentPage: 1,
                perPage: 10,
                
                // Filters
                filters: {
                    from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
                    to_date: frappe.datetime.get_today(),
                    company: "",
                    customer: "",
                    status: ""
                },

                kpis: {
                    total_sales_orders: 0,
                    total_invoices: 0,
                    total_invoice_amount: 0,
                    total_payments_received: 0,
                    outstanding_amount: 0,
                    reconciled_amount: 0,
                    unreconciled_amount: 0,
                    collection_efficiency: 0,
                    invoice_match_rate: 0,
                    dso: 0
                },
                
                charts: {}
            };
        },
        computed: {
            filteredTransactions() {
                let list = this.transactions;
                if (this.filters.status) {
                    list = list.filter(t => t.status === this.filters.status);
                }
                return list;
            },
            paginatedTransactions() {
                const start = (this.currentPage - 1) * this.perPage;
                return this.filteredTransactions.slice(start, start + this.perPage);
            },
            totalPages() {
                return Math.ceil(this.filteredTransactions.length / this.perPage);
            }
        },
        mounted() {
            this.fetchData();
        },
        methods: {
            amt, pct,
            
            fetchData() {
                this.loading = true;
                // Pretend to call API with this.filters
                setTimeout(() => {
                    this.transactions = _generateMockData(this.filters);
                    this.calculateKPIs();
                    this.currentPage = 1;
                    this.loading = false;
                    
                    this.$nextTick(() => {
                        this.renderCharts();
                    });
                }, 600);
            },

            calculateKPIs() {
                let soCount = 0, invCount = 0;
                let invAmt = 0, payAmt = 0, outAmt = 0;
                let matchedAmt = 0, unmatchedAmt = 0;
                let matchedCount = 0;

                this.transactions.forEach(t => {
                    soCount++;
                    if (t.status !== "PENDING_INVOICE") {
                        invCount++;
                        invAmt += t.si_total;
                        payAmt += t.payment_received;
                        outAmt += t.outstanding;
                        
                        if (t.status === "MATCHED") {
                            matchedAmt += t.si_total;
                            matchedCount++;
                        } else {
                            unmatchedAmt += t.si_total;
                        }
                    }
                });

                this.kpis = {
                    total_sales_orders: soCount,
                    total_invoices: invCount,
                    total_invoice_amount: invAmt,
                    total_payments_received: payAmt,
                    outstanding_amount: outAmt,
                    reconciled_amount: matchedAmt,
                    unreconciled_amount: unmatchedAmt,
                    collection_efficiency: invAmt > 0 ? (payAmt / invAmt) * 100 : 0,
                    invoice_match_rate: invCount > 0 ? (matchedCount / invCount) * 100 : 0,
                    dso: outAmt > 0 ? Math.round((outAmt / (invAmt || 1)) * 30) : 0 // Proxy calculation
                };
            },

            toggleRow(txn) {
                txn.expanded = !txn.expanded;
            },
            
            badgeClass(status) {
                if (status === 'UNDERCHARGED') return 'badge-critical';
                if (status === 'OVERCHARGED') return 'badge-warning';
                if (status === 'MATCHED') return 'badge-success';
                return 'badge-info';
            },
            
            badgeText(status) {
                if (status === 'UNDERCHARGED') return 'Revenue Leakage';
                if (status === 'OVERCHARGED') return 'Dispute Risk';
                if (status === 'MATCHED') return 'Matched';
                return 'Pending';
            },
            
            prevPage() { if (this.currentPage > 1) this.currentPage--; },
            nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; },

            renderCharts() {
                if (!window.frappe || !window.frappe.Chart) return;
                
                // Aggregate data for charts
                const months = {};
                const customers = {};
                const aging = { "< 30 Days": 0, "30-60 Days": 0, "60-90 Days": 0, "> 90 Days": 0 };
                const statuses = { "MATCHED": 0, "UNDERCHARGED": 0, "OVERCHARGED": 0 };

                this.transactions.forEach(t => {
                    // Months
                    if (!months[t.month]) months[t.month] = { sales: 0, inv: 0, pay: 0, matchCount: 0, totalCount: 0 };
                    months[t.month].sales += t.so_total;
                    if (t.status !== "PENDING_INVOICE") {
                        months[t.month].inv += t.si_total;
                        months[t.month].pay += t.payment_received;
                        months[t.month].totalCount++;
                        if (t.status === "MATCHED") months[t.month].matchCount++;
                        if (statuses[t.status] !== undefined) statuses[t.status]++;
                    }
                    
                    // Aging
                    if (t.outstanding > 0 && t.aging !== "Current") {
                        if (aging[t.aging] !== undefined) aging[t.aging] += t.outstanding;
                    }
                    
                    // Customers
                    if (!customers[t.customer]) customers[t.customer] = 0;
                    customers[t.customer] += t.so_total;
                });

                const monthLabels = Object.keys(months).reverse(); // simple sort
                const salesData = monthLabels.map(m => months[m].sales);
                const invData = monthLabels.map(m => months[m].inv);
                const payData = monthLabels.map(m => months[m].pay);
                const matchRateData = monthLabels.map(m => months[m].totalCount > 0 ? (months[m].matchCount / months[m].totalCount)*100 : 0);

                const custSorted = Object.entries(customers).sort((a,b) => b[1] - a[1]).slice(0,5);

                // 1. Sales Trend
                new frappe.Chart("#chart-sales-trend", {
                    title: "Sales Trend",
                    data: { labels: monthLabels, datasets: [{ name: "Sales Orders", values: salesData }] },
                    type: 'line', height: 250, colors: ['#2563eb']
                });

                // 2. Invoice vs Payment
                new frappe.Chart("#chart-inv-pay", {
                    title: "Invoice vs Payment",
                    data: { labels: monthLabels, datasets: [
                        { name: "Invoiced", values: invData },
                        { name: "Paid", values: payData }
                    ] },
                    type: 'bar', height: 250, colors: ['#6366f1', '#10b981']
                });

                // 3. Recon Status (Pie)
                new frappe.Chart("#chart-recon-status", {
                    title: "Reconciliation Status",
                    data: { 
                        labels: ["Matched", "Undercharged", "Overcharged"], 
                        datasets: [{ values: [statuses["MATCHED"], statuses["UNDERCHARGED"], statuses["OVERCHARGED"]] }] 
                    },
                    type: 'pie', height: 250, colors: ['#10b981', '#ef4444', '#f59e0b']
                });

                // 4. Monthly Collection Trend
                new frappe.Chart("#chart-monthly-coll", {
                    title: "Monthly Collection Trend",
                    data: { labels: monthLabels, datasets: [{ name: "Collections", values: payData }] },
                    type: 'line', height: 250, colors: ['#059669']
                });

                // 5. Top Customers
                new frappe.Chart("#chart-top-cust", {
                    title: "Top Customers",
                    data: { 
                        labels: custSorted.map(c => c[0]), 
                        datasets: [{ name: "Order Value", values: custSorted.map(c => c[1]) }] 
                    },
                    type: 'bar', height: 250, colors: ['#3b82f6']
                });

                // 6. Invoice Aging (Stacked)
                new frappe.Chart("#chart-aging", {
                    title: "Invoice Aging",
                    data: { 
                        labels: ["Outstanding Amount"], 
                        datasets: [
                            { name: "< 30 Days", values: [aging["< 30 Days"]] },
                            { name: "30-60 Days", values: [aging["30-60 Days"]] },
                            { name: "60-90 Days", values: [aging["60-90 Days"]] },
                            { name: "> 90 Days", values: [aging["> 90 Days"]] }
                        ] 
                    },
                    type: 'bar', barOptions: { stacked: true }, height: 250, colors: ['#10b981', '#f59e0b', '#f97316', '#ef4444']
                });

                // 7. Invoice Match Rate Trend
                new frappe.Chart("#chart-match-rate", {
                    title: "Invoice Match Rate Trend (%)",
                    data: { labels: monthLabels, datasets: [{ name: "Match Rate", values: matchRateData }] },
                    type: 'line', height: 250, colors: ['#8b5cf6']
                });
            }
        },
        template: `
            <div class="dashboard-layout">
                
                <!-- SIDEBAR -->
                <div class="sidebar">
                    <div class="sidebar-title">Filters</div>
                    
                    <div class="filter-group">
                        <label>From Date</label>
                        <input type="date" v-model="filters.from_date" />
                    </div>
                    
                    <div class="filter-group">
                        <label>To Date</label>
                        <input type="date" v-model="filters.to_date" />
                    </div>
                    
                    <div class="filter-group">
                        <label>Company</label>
                        <select v-model="filters.company">
                            <option value="">All Companies</option>
                            <option value="Company A">Company A</option>
                        </select>
                    </div>

                    <div class="filter-group">
                        <label>Customer</label>
                        <input type="text" v-model="filters.customer" placeholder="Search customer..." />
                    </div>

                    <div class="filter-group">
                        <label>Status</label>
                        <select v-model="filters.status">
                            <option value="">All Statuses</option>
                            <option value="MATCHED">Matched</option>
                            <option value="UNDERCHARGED">Revenue Leakage</option>
                            <option value="OVERCHARGED">Dispute Risk</option>
                            <option value="PENDING_INVOICE">Pending Invoice</option>
                        </select>
                    </div>

                    <button class="filter-btn" @click="fetchData">Apply Filters</button>
                </div>

                <!-- MAIN CONTENT -->
                <div class="main-content">
                    <div class="dashboard-header">
                        <div>
                            <h1 class="dashboard-title">Sales Reconciliation</h1>
                            <div class="dashboard-subtitle">Monitor quotation to invoice lifecycle and prevent revenue leakage.</div>
                        </div>
                    </div>

                    <div v-if="loading" style="padding: 40px; text-align: center; color: var(--text-muted);">
                        Loading Sales Data...
                    </div>
                    
                    <div v-else>
                        <!-- 10 KPI Cards -->
                        <div class="kpi-grid">
                            <div class="kpi-card"><div class="kpi-card-title">Total Sales Orders</div><div class="kpi-card-value">{{ kpis.total_sales_orders }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Total Invoices</div><div class="kpi-card-value">{{ kpis.total_invoices }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Total Invoice Amount</div><div class="kpi-card-value">{{ amt(kpis.total_invoice_amount) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Total Payments Received</div><div class="kpi-card-value">{{ amt(kpis.total_payments_received) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Outstanding Amount</div><div class="kpi-card-value">{{ amt(kpis.outstanding_amount) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Reconciled Amount</div><div class="kpi-card-value">{{ amt(kpis.reconciled_amount) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Unreconciled Amount</div><div class="kpi-card-value">{{ amt(kpis.unreconciled_amount) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Collection Efficiency</div><div class="kpi-card-value">{{ pct(kpis.collection_efficiency) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Invoice Match Rate</div><div class="kpi-card-value">{{ pct(kpis.invoice_match_rate) }}</div></div>
                            <div class="kpi-card"><div class="kpi-card-title">Average DSO</div><div class="kpi-card-value">{{ kpis.dso }} Days</div></div>
                        </div>

                        <!-- 7 Charts -->
                        <div class="charts-grid">
                            <div class="chart-card"><div id="chart-sales-trend"></div></div>
                            <div class="chart-card"><div id="chart-inv-pay"></div></div>
                            <div class="chart-card"><div id="chart-recon-status"></div></div>
                            <div class="chart-card"><div id="chart-monthly-coll"></div></div>
                            <div class="chart-card"><div id="chart-top-cust"></div></div>
                            <div class="chart-card"><div id="chart-aging"></div></div>
                        </div>
                        <div class="charts-grid full-width" style="margin-top: -12px;">
                            <div class="chart-card"><div id="chart-match-rate"></div></div>
                        </div>

                        <!-- Data Grid with Pagination -->
                        <div class="data-grid-container">
                            <div class="data-grid-header">
                                <div>Sales Order</div>
                                <div>Customer</div>
                                <div class="text-right">Order Total</div>
                                <div class="text-right">Invoice Total</div>
                                <div class="text-right">Variance</div>
                                <div style="text-align: center;">Status</div>
                            </div>

                            <div v-for="txn in paginatedTransactions" :key="txn.id">
                                <div class="data-grid-row">
                                    <div class="data-grid-main" @click="toggleRow(txn)">
                                        <div class="font-bold flex-center">
                                            <span style="color: var(--text-muted); font-size: 10px;">
                                                {{ txn.expanded ? '▼' : '▶' }}
                                            </span>
                                            {{ txn.so_number }}
                                        </div>
                                        <div>{{ txn.customer }}</div>
                                        <div class="text-right">{{ amt(txn.so_total) }}</div>
                                        <div class="text-right">{{ txn.si_total ? amt(txn.si_total) : '—' }}</div>
                                        <div class="text-right font-bold" :style="{color: txn.variance < 0 ? '#b91c1c' : (txn.variance > 0 ? '#b45309' : 'inherit')}">
                                            {{ txn.variance === 0 || txn.status === 'PENDING_INVOICE' ? '—' : amt(txn.variance) }}
                                        </div>
                                        <div style="text-align: center;">
                                            <span class="badge" :class="badgeClass(txn.status)">{{ badgeText(txn.status) }}</span>
                                        </div>
                                    </div>
                                    
                                    <div class="data-grid-expanded" v-if="txn.expanded">
                                        <h4 style="margin:0 0 12px 0; font-size:12px; color: var(--text-muted); text-transform: uppercase;">Document Lineage Trace</h4>
                                        <table class="sub-table">
                                            <thead>
                                                <tr>
                                                    <th>Step</th>
                                                    <th>Document</th>
                                                    <th>Date</th>
                                                    <th class="text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>1. Quotation</td>
                                                    <td class="font-bold">{{ txn.qtn_number }}</td>
                                                    <td>{{ txn.date }}</td>
                                                    <td class="text-right">{{ amt(txn.so_total) }}</td>
                                                </tr>
                                                <tr>
                                                    <td>2. Sales Order</td>
                                                    <td class="font-bold">{{ txn.so_number }}</td>
                                                    <td>{{ txn.date }}</td>
                                                    <td class="text-right">{{ amt(txn.so_total) }}</td>
                                                </tr>
                                                <tr>
                                                    <td>3. Delivery Note</td>
                                                    <td class="font-bold">{{ txn.dn_number || 'Pending' }}</td>
                                                    <td>{{ txn.dn_number ? txn.date : '—' }}</td>
                                                    <td class="text-right">—</td>
                                                </tr>
                                                <tr>
                                                    <td>4. Sales Invoice</td>
                                                    <td class="font-bold">{{ txn.si_number || 'Pending' }}</td>
                                                    <td>{{ txn.si_number ? txn.date : '—' }}</td>
                                                    <td class="text-right">{{ txn.si_total ? amt(txn.si_total) : '—' }}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Pagination Controls -->
                            <div class="pagination">
                                <div>Showing {{ (currentPage - 1) * perPage + 1 }} to {{ Math.min(currentPage * perPage, filteredTransactions.length) }} of {{ filteredTransactions.length }} entries</div>
                                <div class="pagination-controls">
                                    <button :disabled="currentPage === 1" @click="prevPage">Previous</button>
                                    <span style="margin-left: 8px;">Page {{ currentPage }} of {{ totalPages }}</span>
                                    <button :disabled="currentPage === totalPages || totalPages === 0" @click="nextPage">Next</button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        `
    }).mount('#recon-app');
}
