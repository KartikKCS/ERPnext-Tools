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

function _generateMockData() {
    const data = [];
    const customers = ["Acme Corp", "Globex", "Initech", "Soylent", "Umbrella Corp", "Wayne Enterprises", "Stark Industries"];
    
    let numToGenerate = 150;

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
                allTransactions: [],
                loading: true,
                sidebarOpen: true,
                
                // Pagination
                currentPage: 1,
                perPage: 10,
                
                // Sidebar Filters
                filters: {
                    from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
                    to_date: frappe.datetime.get_today(),
                    company: "",
                    customer: "",
                    status: ""
                },

                company_ctl: null,
                customer_ctl: null,
                from_ctl: null,
                to_ctl: null,

                // Interactive Dashboard Filters
                dashFilters: {
                    kpi: null,
                    month: null,
                    status: null,
                    customer: null,
                    aging: null
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
                }
            };
        },
        computed: {
            filteredTransactions() {
                let list = this.allTransactions;
                
                // Sidebar Filters
                if (this.filters.status) list = list.filter(t => t.status === this.filters.status);
                if (this.filters.customer) list = list.filter(t => t.customer.toLowerCase().includes(this.filters.customer.toLowerCase()));
                if (this.filters.from_date) {
                    const fd = new Date(this.filters.from_date);
                    list = list.filter(t => new Date(t.date) >= fd);
                }
                if (this.filters.to_date) {
                    const td = new Date(this.filters.to_date);
                    list = list.filter(t => new Date(t.date) <= td);
                }

                // Dashboard Interactive Filters
                if (this.dashFilters.month) list = list.filter(t => t.month === this.dashFilters.month);
                if (this.dashFilters.status) list = list.filter(t => t.status === this.dashFilters.status);
                if (this.dashFilters.customer) list = list.filter(t => t.customer === this.dashFilters.customer);
                if (this.dashFilters.aging) list = list.filter(t => t.aging === this.dashFilters.aging);

                return list;
            },
            paginatedTransactions() {
                const start = (this.currentPage - 1) * this.perPage;
                return this.filteredTransactions.slice(start, start + this.perPage);
            },
            totalPages() {
                return Math.ceil(this.filteredTransactions.length / this.perPage);
            },
            hasDashFilters() {
                return Object.values(this.dashFilters).some(v => v !== null);
            }
        },
        watch: {
            filteredTransactions() {
                this.calculateKPIs();
                this.currentPage = 1;
                this.$nextTick(() => {
                    this.renderCharts();
                });
            }
        },
        mounted() {
            this.company_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_company"),
                df: { label: "Company", fieldtype: "Link", options: "Company", default: this.filters.company },
                render_input: true,
            });
            this.customer_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_customer"),
                df: { label: "Customer", fieldtype: "Link", options: "Customer", default: this.filters.customer },
                render_input: true,
            });
            this.from_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_from"),
                df: { label: "From Date", fieldtype: "Date", default: this.filters.from_date },
                render_input: true,
            });
            this.to_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_to"),
                df: { label: "To Date", fieldtype: "Date", default: this.filters.to_date },
                render_input: true,
            });
            
            this.fetchData();
        },
        methods: {
            amt, pct,
            
            fetchData() {
                if (this.company_ctl) this.filters.company = this.company_ctl.get_value();
                if (this.customer_ctl) this.filters.customer = this.customer_ctl.get_value();
                if (this.from_ctl) this.filters.from_date = this.from_ctl.get_value();
                if (this.to_ctl) this.filters.to_date = this.to_ctl.get_value();

                this.loading = true;
                setTimeout(() => {
                    this.allTransactions = _generateMockData();
                    this.loading = false;
                }, 400);
            },

            clearDashFilters() {
                this.dashFilters = { kpi: null, month: null, status: null, customer: null, aging: null };
            },

            setDashFilter(key, value) {
                if (this.dashFilters[key] === value) {
                    this.dashFilters[key] = null; // toggle off
                } else {
                    this.dashFilters[key] = value;
                }
            },

            calculateKPIs() {
                let soCount = 0, invCount = 0;
                let invAmt = 0, payAmt = 0, outAmt = 0;
                let matchedAmt = 0, unmatchedAmt = 0;
                let matchedCount = 0;

                this.filteredTransactions.forEach(t => {
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
                    dso: outAmt > 0 ? Math.round((outAmt / (invAmt || 1)) * 30) : 0
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

                this.filteredTransactions.forEach(t => {
                    if (!months[t.month]) months[t.month] = { sales: 0, inv: 0, pay: 0, matchCount: 0, totalCount: 0 };
                    months[t.month].sales += t.so_total;
                    if (t.status !== "PENDING_INVOICE") {
                        months[t.month].inv += t.si_total;
                        months[t.month].pay += t.payment_received;
                        months[t.month].totalCount++;
                        if (t.status === "MATCHED") months[t.month].matchCount++;
                        if (statuses[t.status] !== undefined) statuses[t.status]++;
                    }
                    if (t.outstanding > 0 && t.aging !== "Current") {
                        if (aging[t.aging] !== undefined) aging[t.aging] += t.outstanding;
                    }
                    if (!customers[t.customer]) customers[t.customer] = 0;
                    customers[t.customer] += t.so_total;
                });

                // Ensure all recent months are present so charts don't break if filtered heavily
                const allMonths = [...new Set(this.allTransactions.map(t => t.month))].reverse();
                let monthLabels = Object.keys(months);
                monthLabels.sort((a,b) => allMonths.indexOf(a) - allMonths.indexOf(b));

                const salesData = monthLabels.map(m => months[m].sales);
                const invData = monthLabels.map(m => months[m].inv);
                const payData = monthLabels.map(m => months[m].pay);
                const matchRateData = monthLabels.map(m => months[m].totalCount > 0 ? (months[m].matchCount / months[m].totalCount)*100 : 0);

                const custSorted = Object.entries(customers).sort((a,b) => b[1] - a[1]).slice(0,5);
                const custLabels = custSorted.map(c => c[0]);

                const createNavigableChart = (id, options, onClick) => {
                    const el = document.querySelector(id);
                    if (!el) return;
                    el.innerHTML = "";
                    options.isNavigable = 1;
                    const chart = new frappe.Chart(id, options);
                    
                    if (el._chartSelectHandler) {
                        el.removeEventListener('data-select', el._chartSelectHandler);
                    }
                    el._chartSelectHandler = (e) => {
                        if (onClick) onClick(e);
                    };
                    el.addEventListener('data-select', el._chartSelectHandler);

                    // Also add a cursor pointer to make it obvious
                    const svg = el.querySelector('svg');
                    if (svg) svg.style.cursor = 'pointer';

                    return chart;
                };

                // 1. Sales Trend
                createNavigableChart("#chart-sales-trend", {
                    title: "Sales Trend",
                    data: { labels: monthLabels, datasets: [{ name: "Sales Orders", values: salesData }] },
                    type: 'line', height: 250, colors: ['#2563eb']
                }, (e) => this.setDashFilter('month', e.label));

                // 2. Invoice vs Payment
                createNavigableChart("#chart-inv-pay", {
                    title: "Invoice vs Payment",
                    data: { labels: monthLabels, datasets: [
                        { name: "Invoiced", values: invData },
                        { name: "Paid", values: payData }
                    ] },
                    type: 'bar', height: 250, colors: ['#6366f1', '#10b981']
                }, (e) => this.setDashFilter('month', e.label));

                // 3. Recon Status (Pie -> Custom SVG Donut)
                const reconEl = document.querySelector("#chart-recon-status");
                if (reconEl) {
                    const rLabels = ["MATCHED", "UNDERCHARGED", "OVERCHARGED"];
                    const rValues = [statuses["MATCHED"], statuses["UNDERCHARGED"], statuses["OVERCHARGED"]];
                    const rColors = ['#10b981', '#ef4444', '#f59e0b'];
                    const rTotal = rValues.reduce((a,b)=>a+b, 0);

                    const size = 180, cx = size/2, cy = size/2, radius = 68, stroke = 28;
                    let cumulativeAngle = -90;
                    let pathsHTML = '';
                    rValues.forEach((val, i) => {
                        if(val === 0) return;
                        const sweep = (val / rTotal) * 360;
                        const actualSweep = Math.min(sweep, 359.9);
                        const startRad = (cumulativeAngle * Math.PI) / 180;
                        const endRad = ((cumulativeAngle + actualSweep) * Math.PI) / 180;
                        const x1 = cx + radius * Math.cos(startRad);
                        const y1 = cy + radius * Math.sin(startRad);
                        const x2 = cx + radius * Math.cos(endRad);
                        const y2 = cy + radius * Math.sin(endRad);
                        const largeArc = actualSweep > 180 ? 1 : 0;
                        const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
                        pathsHTML += `<path d="${path}" fill="none" stroke="${rColors[i]}" stroke-width="${stroke}"
                            data-idx="${i}" class="rc-donut-segment"
                            style="cursor:pointer; transition: stroke-width 0.2s ease, opacity 0.2s ease;"/>`;
                        cumulativeAngle += sweep;
                    });

                    reconEl.innerHTML = `
                        <div style="font-size: 14px; font-weight: 600; margin-bottom: 16px; color: var(--text-main);">Reconciliation Status</div>
                        <div class="rc-donut-wrapper" style="position:relative; width:${size}px; height:${size}px; margin: 8px auto 0;">
                            <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
                                ${pathsHTML}
                            </svg>
                            <div class="rc-donut-center">
                                <div class="rc-donut-center__count">${rTotal}</div>
                                <div class="rc-donut-center__label">Total Docs</div>
                            </div>
                            <div class="rc-donut-tooltip" style="display:none;"></div>
                        </div>
                    `;

                    const segments = reconEl.querySelectorAll('.rc-donut-segment');
                    const tooltip = reconEl.querySelector('.rc-donut-tooltip');
                    segments.forEach(seg => {
                        const idx = parseInt(seg.getAttribute('data-idx'));
                        const pctVal = rTotal > 0 ? Math.round((rValues[idx] / rTotal) * 100) : 0;
                        seg.addEventListener('mouseenter', () => {
                            seg.style.strokeWidth = stroke + 6;
                            seg.style.opacity = '1';
                            segments.forEach(s => { if(s !== seg) s.style.opacity = '0.45'; });
                            tooltip.innerHTML = `<strong>${rLabels[idx]}</strong><br>${rValues[idx]} (${pctVal}%)`;
                            tooltip.style.display = 'block';
                        });
                        seg.addEventListener('mousemove', (e) => {
                            const rect = reconEl.querySelector('.rc-donut-wrapper').getBoundingClientRect();
                            tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
                            tooltip.style.top = (e.clientY - rect.top - 30) + 'px';
                        });
                        seg.addEventListener('mouseleave', () => {
                            seg.style.strokeWidth = stroke;
                            segments.forEach(s => s.style.opacity = '1');
                            tooltip.style.display = 'none';
                        });
                        seg.addEventListener('click', () => {
                            this.setDashFilter('status', rLabels[idx]);
                        });
                    });
                }

                // 4. Monthly Collection Trend
                createNavigableChart("#chart-monthly-coll", {
                    title: "Monthly Collection Trend",
                    data: { labels: monthLabels, datasets: [{ name: "Collections", values: payData }] },
                    type: 'line', height: 250, colors: ['#059669']
                }, (e) => this.setDashFilter('month', e.label));

                // 5. Top Customers
                createNavigableChart("#chart-top-cust", {
                    title: "Top Customers",
                    data: { 
                        labels: custLabels, 
                        datasets: [{ name: "Order Value", values: custSorted.map(c => c[1]) }] 
                    },
                    type: 'bar', height: 250, colors: ['#3b82f6']
                }, null);
                
                setTimeout(() => {
                    const custChartEl = document.querySelector("#chart-top-cust svg");
                    if (custChartEl && !custChartEl._custClickBound) {
                        custChartEl._custClickBound = true;
                        custChartEl.addEventListener('click', (e) => {
                            let idx = null;
                            let target = e.target;
                            while (target && target.tagName !== 'svg' && target.tagName !== 'SVG') {
                                if (target.hasAttribute('data-point-index')) {
                                    idx = parseInt(target.getAttribute('data-point-index'));
                                    break;
                                }
                                target = target.parentNode;
                            }
                            if (idx === null && e.target.tagName.toLowerCase() === 'rect') {
                                const parent = e.target.closest('g.dataset-units');
                                if (parent) {
                                    const rects = Array.from(parent.querySelectorAll('rect'));
                                    idx = rects.indexOf(e.target);
                                }
                            }
                            if (idx !== null && idx >= 0 && custLabels[idx]) {
                                this.setDashFilter('customer', custLabels[idx]);
                            }
                        });
                    }
                }, 100);

                // 6. Invoice Aging (Stacked)
                createNavigableChart("#chart-aging", {
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
                }, null);
                
                // Add robust manual click listener for the stacked bar
                setTimeout(() => {
                    const agingChartEl = document.querySelector("#chart-aging svg");
                    if (agingChartEl && !agingChartEl._agingClickBound) {
                        agingChartEl._agingClickBound = true;
                        agingChartEl.addEventListener('click', (e) => {
                            // Find which dataset was clicked by checking legend or rect index
                            const text = e.target.textContent || '';
                            if (["< 30 Days", "30-60 Days", "60-90 Days", "> 90 Days"].includes(text.trim())) {
                                this.setDashFilter('aging', text.trim());
                                return;
                            }
                            // Fallback to finding the dataset based on DOM hierarchy
                            if (e.target.tagName.toLowerCase() === 'rect') {
                                const parentGroup = e.target.closest('g.dataset-units');
                                if (parentGroup) {
                                    // In stacked charts, there are multiple dataset-units groups.
                                    // Find which one we clicked.
                                    const allGroups = Array.from(agingChartEl.querySelectorAll('g.dataset-units'));
                                    const datasetIndex = allGroups.indexOf(parentGroup);
                                    const datasetNames = ["< 30 Days", "30-60 Days", "60-90 Days", "> 90 Days"];
                                    if (datasetIndex >= 0 && datasetIndex < datasetNames.length) {
                                        this.setDashFilter('aging', datasetNames[datasetIndex]);
                                    }
                                }
                            }
                        });
                    }
                }, 100);

                // 7. Invoice Match Rate Trend
                createNavigableChart("#chart-match-rate", {
                    title: "Invoice Match Rate Trend (%)",
                    data: { labels: monthLabels, datasets: [{ name: "Match Rate", values: matchRateData }] },
                    type: 'line', height: 250, colors: ['#8b5cf6']
                }, (e) => this.setDashFilter('month', e.label));
            }
        },
        template: `
            <div class="dashboard-layout">
                
                <!-- SIDEBAR -->
                <aside class="sidebar">
                    <div class="sidebar-title">RECONCILIATION PARAMS</div>
                    <div class="filter-group">
                        <div class="rc-sidebar__field" id="rc_company" style="margin-top: 4px;"></div>
                        <div class="rc-sidebar__field" id="rc_customer" style="margin-top: 4px;"></div>
                        <div class="rc-sidebar__field" id="rc_from" style="margin-top: 4px;"></div>
                        <div class="rc-sidebar__field" id="rc_to" style="margin-top: 4px;"></div>
                        
                        <div style="margin-top: 15px;">
                            <label>Status Filter</label>
                            <select v-model="filters.status">
                                <option value="">All Statuses</option>
                                <option value="MATCHED">Matched</option>
                                <option value="UNDERCHARGED">Revenue Leakage</option>
                                <option value="OVERCHARGED">Dispute Risk</option>
                                <option value="PENDING_INVOICE">Pending Invoice</option>
                            </select>
                        </div>
                    </div>
                    <button class="filter-btn" @click="fetchData">Apply Filters</button>
                </aside>

                <!-- MAIN CONTENT -->
                <div class="main-content">
                    <div class="dashboard-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h1 class="dashboard-title">Sales Reconciliation</h1>
                            <div class="dashboard-subtitle">Monitor quotation to invoice lifecycle and prevent revenue leakage.</div>
                        </div>
                    </div>

                    <!-- ACTIVE FILTERS -->
                    <div v-if="hasDashFilters" style="margin-bottom: 20px; padding: 10px; background: #f1f5f9; border-radius: 8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <span style="font-size: 13px; font-weight: 600; color: #475569;">Active Filters:</span>
                        <span v-if="dashFilters.kpi" class="badge" style="background:#3b82f6; cursor:pointer; color: white;" @click="dashFilters.kpi = null">KPI: {{ dashFilters.kpi.replace(/_/g, ' ') }} &times;</span>
                        <span v-if="dashFilters.month" class="badge" style="background:#3b82f6; cursor:pointer; color: white;" @click="dashFilters.month = null">Month: {{ dashFilters.month }} &times;</span>
                        <span v-if="dashFilters.status" class="badge" style="background:#3b82f6; cursor:pointer; color: white;" @click="dashFilters.status = null">Status: {{ dashFilters.status }} &times;</span>
                        <span v-if="dashFilters.customer" class="badge" style="background:#3b82f6; cursor:pointer; color: white;" @click="dashFilters.customer = null">Customer: {{ dashFilters.customer }} &times;</span>
                        <span v-if="dashFilters.aging" class="badge" style="background:#3b82f6; cursor:pointer; color: white;" @click="dashFilters.aging = null">Aging: {{ dashFilters.aging }} &times;</span>
                        <span style="font-size: 12px; color: #ef4444; cursor:pointer; margin-left: auto; font-weight: bold;" @click="clearDashFilters">Clear All</span>
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

                            <div v-if="paginatedTransactions.length === 0" style="padding: 40px; text-align: center; color: var(--text-muted);">
                                No data found for the selected filters.
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
                            <div class="pagination" v-if="filteredTransactions.length > 0">
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
