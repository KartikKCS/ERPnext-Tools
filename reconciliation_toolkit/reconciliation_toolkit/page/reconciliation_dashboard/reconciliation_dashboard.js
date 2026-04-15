frappe.pages['reconciliation-dashboard'].on_page_load = function (wrapper) {
    frappe.require(
        ["https://unpkg.com/vue@3/dist/vue.global.js"],
        () => init_page(wrapper)
    );
};

function init_page(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Reconciliation Dashboard",
        single_column: true
    });

    // ── AGGRESSIVE INLINE STYLE OVERRIDE ──
    // ── AGGRESSIVE INLINE STYLE OVERRIDE ──
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

    // Stop after 5 seconds when page is definitely rendered
    setTimeout(() => clearInterval(breakContainer), 5000);

    page.body.append(`<div id="recon-app"></div>`);
    mount_vue_app();
}

/* ── Helpers ── */

function badge(status) {
    const m = {
        matched: ["✓ Matched", "badge--ok"],
        mismatch: ["✗ Mismatch", "badge--err"],
        bs_only: ["Missing in ERP", "badge--warn"],
        no_data: ["Unavailable", "badge--muted"],
    };
    const [label, cls] = m[status] || m.no_data;
    return `<span class="rc-badge ${cls}">${label}</span>`;
}

function amt(v) {
    if (v == null) return "—";
    return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diff(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (n === 0) return "₹0.00";
    return (n > 0 ? "+" : "") + amt(n);
}

function isIssueDiff(v) {
    if (v == null) return false;
    return Math.abs(Number(v)) >= 1;
}

function pct(n, total) {
    if (!total) return "0%";
    return Math.round((n / total) * 100) + "%";
}

/* ── Color Validation (block green/red/amber hue zones) ── */

function _hexToHue(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    let h = 0;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return h * 60;
}

function _hexToSat(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === 0) return 0;
    return (max - min) / max;
}

function _isBlockedHue(hex) {
    const hue = _hexToHue(hex);
    const sat = _hexToSat(hex);
    // Only block if color is saturated enough to be confused with status colors
    if (sat < 0.25) return false; // greys/whites/blacks are fine
    // Red zone: hue 0-30 or 340-360
    if (hue <= 30 || hue >= 340) return 'red';
    // Green zone: hue 80-160
    if (hue >= 80 && hue <= 160) return 'green';
    return false;
}

function _hueDist(h1, h2) {
    const d = Math.abs(h1 - h2);
    return Math.min(d, 360 - d);
}

function _suggestContrast(hex) {
    // Suggest a color with max hue distance from the given color
    const hue = _hexToHue(hex);
    const opposite = (hue + 180) % 360;
    // If opposite lands in a blocked zone, shift it
    let target = opposite;
    if (target <= 30 || target >= 340) target = 210; // shift to blue
    if (target >= 80 && target <= 160) target = 270; // shift to purple
    // Convert HSL to hex (sat=80%, light=45% for vivid color)
    const s = 0.8, l = 0.45;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((target / 60) % 2) - 1));
    const m = l - c / 2;
    let r1, g1, b1;
    if (target < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (target < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (target < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (target < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (target < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r1) + toHex(g1) + toHex(b1);
}

function statusIcon(type, isOk) {
    const iconMap = {
        amount: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>`,
        revenue: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
        payment: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`
    };
    if (!iconMap[type]) return '';
    const color = isOk ? 'var(--green-500, #10b981)' : 'var(--red-500, #ef4444)';
    const titleText = type.charAt(0).toUpperCase() + type.slice(1);
    const resultText = isOk ? 'OK' : 'Error';
    return `<span class="rc-icon" style="color: ${color}; display: inline-flex; vertical-align: middle; margin: 0 2px;" title="${titleText}: ${resultText}">${iconMap[type]}</span>`;
}



/* ── Vue App ── */

function mount_vue_app() {
    const { createApp } = Vue;

    createApp({
        data() {
            const today = frappe.datetime.get_today();
            return {
                isActivePage: true,
                sidebarTarget: null,
                from_ctl: null, to_ctl: null, company_ctl: null, tol_ctl: null,
                result: null,
                loading: false,
                companyOptions: [],
                view: "folios",
                search: "",
                filter: "all",
                errorsOnly: false,
                expanded: null,
                sel_booking: null,
                page: 1,
                perPage: 20,

                // Sidebar state
                sidebarOpen: true,

                // Sort & Filter state
                sortBy: 'none',
                filterMinDiff: 0,
                filterSources: [],
                filterMismatchType: 'all',
                // Color picker state
                pmsColor: null,
                erpColor: null,
                showSettings: false,
                pmsWarning: '',
                erpWarning: '',
                defaultFromDate: today,
                defaultToDate: today,
                selectedCompany: "",
                selectedFrom: "",
                selectedTo: "",
            };
        },

        computed: {
            s() { return this.result?.summary || null; },
            rev_bk() { return this.result?.revenue_breakdown || null; },
            col_bk() { return this.result?.collection_breakdown || null; },
            bk_list() { return this.result?.bookings?.bookings || []; },
            fo_all() { return this.result?.folios || []; },
            has_bk() { return this.result?.bookings?.status !== "no_data"; },

            isBookingView() {
                return ['group_bookings', 'individual_bookings', 'tpa_bookings', 'company_bookings'].includes(this.view);
            },

            rows() {
                let source;
                const tagViewMap = {
                    group_bookings: 'Group',
                    individual_bookings: 'Individual',
                    tpa_bookings: 'TPA',
                    company_bookings: 'Company',
                };
                const tagFilter = tagViewMap[this.view];
                if (tagFilter) {
                    source = this.bk_list.filter(b => (b.booking_tags || []).includes(tagFilter));
                } else {
                    source = this.sel_booking
                        ? (this.bk_list.find(b => b.booking_id === this.sel_booking)?.folios || [])
                        : this.fo_all;
                }

                let items = source.slice();

                // Status filter
                if (this.filter === "matched")
                    items = items.filter(x => x.status === "matched");
                else if (this.filter === "mismatch")
                    items = items.filter(x => x.status === "mismatch");
                else if (this.filter === "missing")
                    items = items.filter(x => x.status === "bs_only");
                else if (this.filter === "missing_pms")
                    items = items.filter(x => x.status === "si_only");

                // Hide ERP-only entries unless explicitly filtering for them
                if (this.filter !== "missing_pms") {
                    items = items.filter(x => x.status !== "si_only");
                }

                if (this.errorsOnly) {
                    items = items.filter(x => x.status !== "matched");
                }

                // Text search
                if (this.search) {
                    const q = this.search.toLowerCase();
                    items = items.filter(x => {
                        const fields = this.isBookingView
                            ? [x.booking_id, x.bs_guest]
                            : [x.folio, x.bs_guest_name, x.si_customer];
                        return fields.some(f => f && f.toLowerCase().includes(q));
                    });
                }

                // Min difference filter
                if (this.filterMinDiff > 0) {
                    items = items.filter(x => Math.abs(x.difference || 0) >= this.filterMinDiff);
                }

                // Source filter (bookings view)
                if (this.filterSources.length > 0 && this.isBookingView) {
                    items = items.filter(x => this.filterSources.includes(x.bs_source || '—'));
                }

                // Mismatch type filter (folios view)
                if (this.filterMismatchType !== 'all') {
                    items = items.filter(x => {
                        if (this.filterMismatchType === 'revenue')
                            return x.revenue && x.revenue.status !== 'matched';
                        if (this.filterMismatchType === 'payment')
                            return x.payment && x.payment.status !== 'matched';
                        if (this.filterMismatchType === 'amount')
                            return !x.amount_match;
                        return true;
                    });
                }

                // Sort
                const sb = this.sortBy;
                if (sb === 'discrepancy')
                    items.sort((a, b) => Math.abs(b.difference || 0) - Math.abs(a.difference || 0));
                else if (sb === 'pms')
                    items.sort((a, b) => (b.bs_total || b.bs_grand_total || 0) - (a.bs_total || a.bs_grand_total || 0));
                else if (sb === 'erp')
                    items.sort((a, b) => (b.si_total || b.si_grand_total || 0) - (a.bs_total || a.bs_grand_total || 0));
                else if (sb === 'guest') {
                    items.sort((a, b) => {
                        const ga = (a.bs_guest || a.bs_guest_name || '').toLowerCase();
                        const gb = (b.bs_guest || b.bs_guest_name || '').toLowerCase();
                        return ga < gb ? -1 : ga > gb ? 1 : 0;
                    });
                }
                else if (sb === 'status') {
                    const pri = { bs_only: 0, mismatch: 1, matched: 2 };
                    items.sort((a, b) => (pri[a.status] ?? 1) - (pri[b.status] ?? 1));
                }

                return items;
            },

            paged() {
                const s = (this.page - 1) * this.perPage;
                return this.rows.slice(s, s + this.perPage);
            },

            pages() { return Math.max(1, Math.ceil(this.rows.length / this.perPage)); },

            // Sort/filter panel computeds
            uniqueSources() {
                const srcs = new Set();
                for (const b of this.bk_list) srcs.add(b.bs_source || '—');
                return [...srcs].sort();
            },
            activeFilterCount() {
                let n = 0;
                if (this.sortBy !== 'none') n++;
                if (this.filterMinDiff > 0) n++;
                if (this.filterSources.length > 0) n++;
                if (this.filterMismatchType !== 'all') n++;
                return n;
            },

            // Color picker computeds
            pmsStyle() { return this.pmsColor ? { color: this.pmsColor } : {}; },
            erpStyle() { return this.erpColor ? { color: this.erpColor } : {}; },
            pmsBorder() { return this.pmsColor ? { borderLeftColor: this.pmsColor } : {}; },
            erpBorder() { return this.erpColor ? { borderLeftColor: this.erpColor } : {}; },
            pmsHeadStyle() { return this.pmsColor ? { color: this.pmsColor, fontWeight: 700 } : {}; },
            erpHeadStyle() { return this.erpColor ? { color: this.erpColor, fontWeight: 700 } : {}; },

            pmsInputColor() { return this.pmsColor || '#2563eb'; },
            erpInputColor() { return this.erpColor || '#ea580c'; },
        },

        methods: {
            run() {
                const fromDate = this.from_ctl.get_value();
                const toDate = this.to_ctl.get_value();
                const company = this.company_ctl.get_value();
                if (!fromDate || !toDate || !company) {
                    frappe.msgprint("Enter from date, to date, and company.");
                    return;
                }
                this.selectedCompany = company;
                this.selectedFrom = fromDate;
                this.selectedTo = toDate;

                this.loading = true;
                this.result = null;
                this.expanded = null;
                this.sel_booking = null;
                this.view = "folios";
                this.filter = "all";
                this.search = "";
                this.errorsOnly = false;
                this.sortBy = 'none';
                this.filterMinDiff = 0;
                this.filterSources = [];
                this.filterMismatchType = 'all';
                this.showSortPanel = false;
                this.page = 1;

                frappe.call({
                    method: "reconciliation_toolkit.reconciliation_toolkit.page.reconciliation_dashboard.reconciliation_dashboard.run_reconciliation",
                    args: {
                        from_date: fromDate,
                        to_date: toDate,
                        company: company,
                        tolerance: this.tol_ctl.get_value() || 1,
                    },
                    freeze: true,
                    freeze_message: "Fetching API data and analysing reconciliation layers…",
                    callback: r => {
                        this.result = r.message;
                        this.loading = false;
                        if (!this.has_bk) this.view = "folios";
                    },
                    error: () => { this.loading = false; },
                });
            },

            setFilter(f) { this.filter = f; this.page = 1; if (f === 'all') this.filterMismatchType = 'all'; },
            setView(v) { this.view = v; this.sel_booking = null; this.expanded = null; this.page = 1; this.filter = "all"; this.search = ""; },
            drillBooking(id) { this.sel_booking = id; this.view = "folios"; this.expanded = null; this.page = 1; this.filter = "all"; },
            toggleDetail(f) { this.expanded = this.expanded === f ? null : f; },
            goBack() { this.sel_booking = null; this.view = "folios"; this.expanded = null; },

            copyDispute(f) {
                const a = this.amt;
                const pad = (l, w) => l.padEnd(w);
                const ln = [];
                const HR = '━'.repeat(42);

                ln.push('━━━ DISPUTE NOTE ' + '━'.repeat(25));
                ln.push(`Folio:    ${f.folio}`);
                if (f.bs_guest_name) ln.push(`Guest:    ${f.bs_guest_name}`);
                else if (f.si_customer) ln.push(`Guest:    ${f.si_customer}`);
                if (f.bs_room) ln.push(`Room:     ${f.bs_room}`);
                ln.push('');

                // Amounts
                ln.push('AMOUNTS');
                ln.push(`  PMS Total:    ${a(f.bs_grand_total)}`);
                ln.push(`  ERP Total:    ${a(f.si_grand_total)}`);
                ln.push(`  Difference:   ${this.diff(f.difference)}`);
                ln.push('');

                // Revenue
                if (f.revenue) {
                    const rv = f.revenue;
                    if (rv.status === 'matched') {
                        ln.push('REVENUE   ✓ Matched');
                    } else {
                        ln.push(pad('REVENUE', 20) + pad('PMS', 14) + 'ERP');
                        ln.push(`  Pre-tax         ${a(rv.bs_pretax).padStart(12)}  ${a(rv.si_pretax).padStart(12)}  ${rv.bs_pretax === rv.si_pretax ? '✓' : '✗'}`);
                        ln.push(`  Tax             ${a(rv.bs_tax).padStart(12)}  ${a(rv.si_tax).padStart(12)}  ${rv.bs_tax === rv.si_tax ? '✓' : '✗'}`);
                        ln.push(`  Total           ${a(rv.bs_total).padStart(12)}  ${a(rv.si_total).padStart(12)}  ${rv.bs_total === rv.si_total ? '✓' : '✗'}`);
                        // PMS categories
                        if (rv.bs_breakdown && rv.bs_breakdown.length) {
                            const cats = rv.bs_breakdown.map(c => `${c.label} ${a(c.amount)}`).join(' · ');
                            ln.push(`  PMS: ${cats}`);
                        }
                        // ERP categories
                        if (rv.si_breakdown && rv.si_breakdown.length) {
                            const cats = rv.si_breakdown.map(c => `${c.category} ${a(c.amount)}`).join(' · ');
                            ln.push(`  ERP: ${cats}`);
                        }
                    }
                    ln.push('');
                }

                // Payments
                if (f.payment) {
                    const py = f.payment;
                    if (py.status === 'matched') {
                        ln.push('PAYMENTS  ✓ Matched');
                    } else {
                        ln.push(pad('PAYMENTS', 20) + pad('PMS', 14) + 'ERP');
                        ln.push(`  ${pad('Total Paid', 16)} ${a(py.bs_total_paid).padStart(12)}  ${a(py.si_total_paid).padStart(12)}  ${py.total_match ? '✓' : '✗'}`);
                        if (py.si_is_fully_paid) {
                            ln.push('  ERP marked fully paid (outstanding amount is zero)');
                        } else if (py.erp_exceeds_pms) {
                            ln.push('  ERP paid total exceeds PMS total');
                        }
                        if (py.modes && py.modes.length) {
                            for (const m of py.modes) {
                                const mark = m.match ? '✓' : '✗';
                                ln.push(`  ${pad(m.mode || '—', 16)} ${String(m.bs_count).padStart(12)}  ${String(m.si_count).padStart(12)}  ${mark}`);
                            }
                        }
                    }
                    ln.push('');
                }

                ln.push(HR);
                const text = ln.join('\n');
                navigator.clipboard.writeText(text).then(() => {
                    frappe.show_alert({ message: 'Dispute note copied', indicator: 'green' });
                });
            },
            copyIdentifier(value, label, event) {
                if (event) {
                    event.stopPropagation();
                    event.preventDefault();
                }
                navigator.clipboard.writeText(value).then(() => {
                    frappe.show_alert({ message: `${label} copied`, indicator: 'green' });
                });
            },

            // KPI card click → toggle issue-type filter
            filterByIssueType(type) {
                // If already filtering by this type, toggle off
                if (this.view === 'folios' && this.filterMismatchType === type && this.filter === 'mismatch') {
                    this.filterMismatchType = 'all';
                    this.filter = 'all';
                    return;
                }
                this.view = 'folios';
                this.sel_booking = null;
                this.filter = 'mismatch';
                this.filterMismatchType = type;
                this.expanded = null;
                this.page = 1;
            },

            // Sort/filter panel methods
            toggleSortPanel() { this.showSortPanel = !this.showSortPanel; },
            closeSortPanel() { this.showSortPanel = false; },
            clearAllFilters() {
                this.sortBy = 'none';
                this.filterMinDiff = 0;
                this.filterSources = [];
                this.filterMismatchType = 'all';
            },
            toggleSource(src) {
                const idx = this.filterSources.indexOf(src);
                if (idx >= 0) this.filterSources.splice(idx, 1);
                else this.filterSources.push(src);
                this.page = 1;
            },

            // Color picker methods
            onPmsInput(e) {
                const hex = e.target.value;
                const blocked = _isBlockedHue(hex);
                if (blocked) {
                    this.pmsWarning = blocked === 'red' ? 'Too close to error red — pick a different shade' : 'Too close to success green — pick a different shade';
                    return;
                }
                this.pmsWarning = '';
                this.pmsColor = hex;
                localStorage.setItem('rc_pms_color', hex);
                // Auto-suggest ERP if unset or same
                if (!this.erpColor || this.erpColor === hex) {
                    const suggested = _suggestContrast(hex);
                    this.erpColor = suggested;
                    localStorage.setItem('rc_erp_color', suggested);
                    this.erpWarning = '';
                }
            },
            onErpInput(e) {
                const hex = e.target.value;
                const blocked = _isBlockedHue(hex);
                if (blocked) {
                    this.erpWarning = blocked === 'red' ? 'Too close to error red — pick a different shade' : 'Too close to success green — pick a different shade';
                    return;
                }
                if (this.pmsColor && hex === this.pmsColor) {
                    this.erpWarning = 'Same as PMS — pick a different color';
                    return;
                }
                this.erpWarning = '';
                this.erpColor = hex;
                localStorage.setItem('rc_erp_color', hex);
            },
            resetColors() {
                this.pmsColor = null;
                this.erpColor = null;
                this.pmsWarning = '';
                this.erpWarning = '';
                localStorage.removeItem('rc_pms_color');
                localStorage.removeItem('rc_erp_color');
                this.showSettings = false;
            },
            toggleSettings() {
                this.showSettings = !this.showSettings;
            },
            closeSettings(e) {
                if (this.showSettings && this.$refs.settingsWrap && !this.$refs.settingsWrap.contains(e.target)) {
                    this.showSettings = false;
                }
            },
            formatDate(d) {
                if (!d) return "";
                if (typeof frappe !== 'undefined' && frappe.datetime) {
                    return frappe.datetime.str_to_user(d);
                }
                return d;
            },
            getFolioIcon(f) {
                if (f.is_group_booking) {
                    // FontAwesome 'Users' (3 people)
                    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="16" height="16" fill="currentColor"><path d="M144 160c-44.2 0-80-35.8-80-80S99.8 0 144 0s80 35.8 80 80-35.8 80-80 80zm352 0c-44.2 0-80-35.8-80-80s35.8-80 80-80 80 35.8 80 80-35.8 80-80 80zM320 256c-61.9 0-112-50.1-112-112S258.1 32 320 32s112 50.1 112 112-50.1 112-112 112zm-166.5 32H48.4C21.7 288 0 309.7 0 336.4V384c0 17.7 14.3 32 32 32h115.5c-4.4-10-6.9-21-6.9-32v-64c0-10.9 2.5-21 6.9-32zm438.1 0h-105.1c4.4 11 6.9 21.1 6.9 32v64c0 11-2.5 22-6.9 32H608c17.7 0 32-14.3 32-32v-47.6c0-26.7-21.7-48.4-48.4-48.4zM432 320H208c-35.3 0-64 28.7-64 64v64c0 35.3 28.7 64 64 64h224c35.3 0 64-28.7 64-64v-64c0-35.3-28.7-64-64-64z"/></svg>';
                } else {
                    // FontAwesome 'User' (1 person)
                    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="16" height="16" fill="currentColor"><path d="M224 256c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z"/></svg>';
                }
            },

            badge, amt, diff, pct, isIssueDiff, statusIcon,
        },

        mounted() {
            this.from_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_from"),
                df: { label: "From Date", fieldtype: "Date", default: this.defaultFromDate },
                render_input: true,
            });
            this.to_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_to"),
                df: { label: "To Date", fieldtype: "Date", default: this.defaultToDate },
                render_input: true,
            });
            this.company_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_company"),
                df: { label: "Company", fieldtype: "Select", reqd: 1, options: [""] },
                render_input: true,
            });
            this.tol_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_tol"), df: { label: "Tolerance (₹)", fieldtype: "Float", default: 1 }, render_input: true,
            });
            frappe.call({
                method: "reconciliation_toolkit.reconciliation_toolkit.page.reconciliation_dashboard.reconciliation_dashboard.get_company_options",
                callback: (r) => {
                    const options = r.message || [];
                    this.companyOptions = options;
                    this.company_ctl.df.options = ["", ...options].join("\n");
                    this.company_ctl.refresh();
                    if (options.length) {
                        this.company_ctl.set_value(options[0]);
                    }
                },
            });
            // Load saved colors from localStorage
            const savedPms = localStorage.getItem('rc_pms_color');
            const savedErp = localStorage.getItem('rc_erp_color');
            if (savedPms) this.pmsColor = savedPms;
            if (savedErp) this.erpColor = savedErp;
            // Click-outside listener for settings popover
            document.addEventListener('click', this.closeSettings);

            // Mount sidebar to Frappe's global sidebar
            const fSidebar = document.querySelector('.sidebar-items') || document.querySelector('.body-sidebar') || document.querySelector('.layout-side-section') || document.querySelector('.sidebar-left');
            if (fSidebar) {
                if (!fSidebar.id) fSidebar.id = 'frappe-global-sidebar';
                this.sidebarTarget = '#' + fSidebar.id;
            }

            // Apply resize CSS to the outermost layout column so Frappe honors the drag width
            const sideSection = document.querySelector('.layout-side-section');
            if (sideSection) {
                sideSection.style.resize = 'horizontal';
                sideSection.style.overflowY = 'auto';
                sideSection.style.overflowX = 'hidden';
                sideSection.style.minWidth = '220px';
                sideSection.style.maxWidth = '500px';
                sideSection.style.paddingRight = '5px'; // room for resize handle
            }
            frappe.pages['reconciliation-dashboard'] = frappe.pages['reconciliation-dashboard'] || {};
            frappe.pages['reconciliation-dashboard'].on_page_show = () => {
                this.isActivePage = true;
            };
            frappe.pages['reconciliation-dashboard'].on_page_hide = () => {
                this.isActivePage = false;
            };
        },
        beforeUnmount() {
            document.removeEventListener('click', this.closeSettings);
        },

        template: `
<div class="rc">
  <div class="rc-layout">
    
    <!-- ════════ INJECTED LEFT SIDEBAR ════════ -->
    <Teleport :to="sidebarTarget" :disabled="!sidebarTarget" v-if="sidebarTarget || !sidebarTarget">
        <div id="rc-injected-sidebar" class="rc-injected-sidebar" :class="{'rc-sidebar': !sidebarTarget}" v-show="isActivePage" style="padding: 10px 15px; margin-top: 10px; border-top: 1px dashed var(--border-color);">
            <div class="rc-sidebar__section" style="padding: 0 0 10px 0; border: none;">
                <div class="rc-sidebar__label" style="margin-bottom: 8px; font-weight: 700;">Reconciliation Params</div>
                <div class="rc-sidebar__field" id="rc_company"></div>
                <div class="rc-sidebar__field" id="rc_from" style="margin-top: 4px;"></div>
                <div class="rc-sidebar__field" id="rc_to" style="margin-top: 4px;"></div>
                <div class="rc-sidebar__field" id="rc_tol" style="margin-top: 4px;"></div>
                <button class="btn btn-primary btn-sm" @click="run" :disabled="loading" style="margin-top: 12px; width: 100%;">
                    {{ loading ? "Analysing…" : "Reconcile" }}
                </button>
            </div>

            <template v-if="result">

                <div class="rc-sidebar__section">
                    <div class="rc-sidebar__label">Status Filter</div>
                    <div class="rc-chip-group">
                        <button class="rc-chip" :class="{'rc-chip--active': filter==='all'}" @click="setFilter('all')">All</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filter==='matched'}" @click="setFilter('matched')">Matched</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filter==='mismatch'}" @click="setFilter('mismatch')">Issues</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filter==='missing'}" @click="setFilter('missing')">Missing ERP</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filter==='missing_pms'}" @click="setFilter('missing_pms')">Missing PMS</button>
                    </div>
                </div>

                <div class="rc-sidebar__section" v-if="view==='folios'">
                    <div class="rc-sidebar__label">Issue Type</div>
                    <div class="rc-chip-group">
                        <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='all'}" @click="filterMismatchType='all'">All</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='amount'}" @click="filterMismatchType='amount'">Amount</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='revenue'}" @click="filterMismatchType='revenue'">Revenue</button>
                        <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='payment'}" @click="filterMismatchType='payment'">Payment</button>
                    </div>
                </div>

                <div class="rc-sidebar__section" v-if="isBookingView && uniqueSources.length > 0">
                    <div class="rc-sidebar__label">Sources</div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label v-for="src in uniqueSources" :key="src" style="margin:0; font-size:12px; font-weight:500; cursor:pointer; display:flex; align-items:center;">
                            <input type="checkbox" :checked="filterSources.includes(src)" @click.stop="toggleSource(src)" style="margin:0 6px 0 0;" />
                            {{ src }}
                        </label>
                    </div>
                </div>

                <div class="rc-sidebar__section">
                    <div class="rc-sidebar__label">Sort</div>
                    <select class="form-control input-xs" v-model="sortBy" style="width:100%; margin:0;">
                        <option value="none">Default</option>
                        <option value="discrepancy">Discrepancy ↓</option>
                        <option value="pms">PMS Amount ↓</option>
                        <option value="erp">ERP Amount ↓</option>
                        <option value="guest">Guest A–Z</option>
                    </select>
                </div>

                <div class="rc-sidebar__section">
                    <div class="rc-sidebar__label">Display Options</div>
                    <label style="display:flex; align-items:center; gap:6px; cursor: pointer; color: var(--red-500); font-weight: 600; font-size: 11px; margin-bottom: 12px;">
                        <input type="checkbox" v-model="errorsOnly" style="margin:0" /> Error Rows Only
                    </label>
                    
                    <div class="rc-sidebar__label">Diff Amount > {{ filterMinDiff > 0 ? filterMinDiff : 'Any' }}</div>
                    <input type="range" class="rc-range" min="0" max="5000" step="50" v-model.number="filterMinDiff" style="width:100%" />
                </div>

                <div class="rc-sidebar__footer" style="padding: 10px 0;">
                    <button class="btn btn-xs btn-default" style="width:100%;" @click="clearAllFilters">Reset View</button>
                </div>
            </template>
        </div>
    </Teleport>

    <!-- ════════ MAIN CONTENT ════════ -->
    <div class="rc-main" style="flex:1; min-width:0;">
        <div class="rc-bar" style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div class="rc-bar__l" style="display: flex; align-items: center;">
                <button v-if="!sidebarOpen" class="btn btn-xs btn-default" @click="sidebarOpen = true" style="margin-right: 8px;">☰</button>
                <button v-if="sel_booking" class="btn btn-xs btn-default" @click="goBack">← All Bookings</button>
                <template v-if="!sel_booking">
                    <button class="btn btn-xs" :class="view==='group_bookings' ? 'btn-primary':'btn-default'"
                            @click="setView('group_bookings')" :disabled="!has_bk">Group</button>
                    <button class="btn btn-xs" :class="view==='individual_bookings' ? 'btn-primary':'btn-default'"
                            @click="setView('individual_bookings')" :disabled="!has_bk">Individual</button>
                    <button class="btn btn-xs" :class="view==='tpa_bookings' ? 'btn-primary':'btn-default'"
                            @click="setView('tpa_bookings')" :disabled="!has_bk">TPA</button>
                    <button class="btn btn-xs" :class="view==='company_bookings' ? 'btn-primary':'btn-default'"
                            @click="setView('company_bookings')" :disabled="!has_bk">Company</button>
                    <button class="btn btn-xs" :class="view==='folios' ? 'btn-primary':'btn-default'"
                            @click="setView('folios')">Folios</button>
                </template>
                <span v-if="sel_booking" class="rc-crumb" style="margin-left: 8px;">{{ sel_booking }}</span>
            </div>
            
            <div class="rc-bar__c" v-if="result" style="text-align: center; flex: 1; margin: 0 16px;">
                <h4 style="margin: 0 0 2px 0; font-size: 18px; font-weight: 700; color: var(--heading-color);">{{ selectedCompany }}</h4>
                <div style="font-size: 13px; color: var(--text-muted); font-weight: 500;">
                    {{ formatDate(selectedFrom) }} — {{ formatDate(selectedTo) }}
                </div>
            </div>

            <div class="rc-bar__r" style="display: flex; justify-content: flex-end; align-items: center;">
                <div style="width: 280px; margin-right: 12px;" v-if="result">
                    <input class="form-control input-xs rc-search" placeholder="Search invoices/guests…" v-model="search" style="width:100%" />
                </div>
                <!-- Settings Gear -->
                <div class="rc-settings-wrap" ref="settingsWrap">
                    <button class="btn btn-xs btn-default rc-settings-btn" @click.stop="toggleSettings" title="Data color settings">
                        ⚙️
                        <span v-if="pmsColor" class="rc-color-dot" :style="{background: pmsColor}"></span>
                        <span v-if="erpColor" class="rc-color-dot" :style="{background: erpColor}"></span>
                    </button>
                    <div v-if="showSettings" class="rc-settings-popover" @click.stop>
                        <div class="rc-settings-popover__hdr">
                            <span>Data Colors</span>
                            <button class="btn btn-xs btn-default" @click="resetColors" v-if="pmsColor || erpColor">Reset</button>
                        </div>
                        <div class="rc-settings-popover__section">
                            <div class="rc-settings-popover__label">PMS</div>
                            <div class="rc-color-row">
                                <input type="color" class="rc-color-input" :value="pmsInputColor" @input="onPmsInput" title="Pick PMS color" />
                                <span class="rc-color-preview" v-if="pmsColor" :style="{background: pmsColor}"></span>
                                <span v-if="pmsColor" class="rc-color-hex">{{ pmsColor }}</span>
                                <span v-else class="rc-color-hex rc-color-hex--muted">Not set</span>
                            </div>
                            <div v-if="pmsWarning" class="rc-color-warn">⚠ {{ pmsWarning }}</div>
                        </div>
                        <div class="rc-settings-popover__section">
                            <div class="rc-settings-popover__label">ERP</div>
                            <div class="rc-color-row">
                                <input type="color" class="rc-color-input" :value="erpInputColor" @input="onErpInput" title="Pick ERP color" />
                                <span class="rc-color-preview" v-if="erpColor" :style="{background: erpColor}"></span>
                                <span v-if="erpColor" class="rc-color-hex">{{ erpColor }}</span>
                                <span v-else class="rc-color-hex rc-color-hex--muted">Not set</span>
                            </div>
                            <div v-if="erpWarning" class="rc-color-warn">⚠ {{ erpWarning }}</div>
                        </div>
                        <div class="rc-settings-popover__hint">
                            Avoid reds & greens — they're reserved for status indicators
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="!result && !loading" class="rc-placeholder">
            <div class="rc-placeholder__icon">📊</div>
            <h5>Fetch data to begin</h5>
            <p>Select the company and date range in the sidebar, then click Reconcile.</p>
        </div>

        <template v-if="result">
            <!-- ════════ OVERVIEW STRIP ════════ -->
            <div class="rc-overview">
                <div class="rc-stat rc-stat--accent">
                    <div style="display:flex; justify-content:center; align-items:baseline; gap:10px;">
                        <span class="rc-stat__n" :style="pmsStyle">{{ s.pms_folio_count }}</span>
                        <span style="color:var(--text-muted); font-size:18px; font-weight:200;">|</span>
                        <span class="rc-stat__n" :style="erpStyle">{{ s.erp_folio_count }}</span>
                    </div>
                    <div style="display:flex; justify-content:center; gap:20px;">
                        <span class="rc-stat__l" :style="pmsStyle">PMS</span>
                        <span class="rc-stat__l" :style="erpStyle">ERP</span>
                    </div>
                </div>
                <div class="rc-stat" :class="s.match_percent >= 90 ? 'rc-stat--ok' : 'rc-stat--err'">
                    <span class="rc-stat__n">{{ s.match_percent }}%</span>
                    <span class="rc-stat__l">Overall Match</span>
                </div>
                <div class="rc-stat rc-stat--clickable" :class="[s.levels.folio.amount_mismatched ? 'rc-stat--err' : 'rc-stat--ok', {'rc-stat--active': view==='folios' && filterMismatchType==='amount' && filter==='mismatch'}]" @click="filterByIssueType('amount')">
                    <span class="rc-stat__n">{{ s.levels.folio.amount_mismatched }}</span>
                    <span class="rc-stat__l">Amount Issues</span>
                </div>
                <div class="rc-stat rc-stat--clickable" :class="[s.levels.revenue.mismatched ? 'rc-stat--err' : 'rc-stat--ok', {'rc-stat--active': view==='folios' && filterMismatchType==='revenue' && filter==='mismatch'}]" @click="filterByIssueType('revenue')">
                    <span class="rc-stat__n">{{ s.levels.revenue.mismatched }}</span>
                    <span class="rc-stat__l">Revenue Issues</span>
                </div>
                <div class="rc-stat rc-stat--clickable" :class="[s.levels.payment.mismatched ? 'rc-stat--err' : 'rc-stat--ok', {'rc-stat--active': view==='folios' && filterMismatchType==='payment' && filter==='mismatch'}]" @click="filterByIssueType('payment')">
                    <span class="rc-stat__n">{{ s.levels.payment.mismatched }}</span>
                    <span class="rc-stat__l">Payment Issues</span>
                </div>
            </div>

            <!-- ════════ BREAKDOWN PANELS ════════ -->
            <div class="rc-breakdown-panel" v-if="rev_bk && col_bk && isBookingView && !sel_booking">
                <!-- Revenue Breakdown -->
                <div class="rc-breakdown-card">
                    <div class="rc-breakdown-card__hdr">
                        <span>Revenue Breakdown</span>
                        <span class="rc-breakdown-card__date">{{ formatDate(selectedFrom) }} — {{ formatDate(selectedTo) }}</span>
                    </div>
                    <table class="table rc-bk-tbl">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>PMS</th>
                                <th :style="pmsHeadStyle">PMS Amt</th>
                                <th>ERP</th>
                                <th :style="erpHeadStyle">ERP Amt</th>
                                <th>Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="cat in ['Walk-in', 'OTA', 'TPA']" :key="cat" :class="isIssueDiff(rev_bk[cat].bs_amt - rev_bk[cat].si_amt) ? 'rc-row-err' : ''">
                                <td>{{ cat }}</td>
                                <td>{{ rev_bk[cat].bs_ct }}</td>
                                <td :style="pmsStyle">{{ amt(rev_bk[cat].bs_amt) }}</td>
                                <td>{{ rev_bk[cat].si_ct }}</td>
                                <td :style="erpStyle">{{ amt(rev_bk[cat].si_amt) }}</td>
                                <td :class="isIssueDiff(rev_bk[cat].bs_amt - rev_bk[cat].si_amt) ? 'rc-diff' : ''">{{ diff(rev_bk[cat].bs_amt - rev_bk[cat].si_amt) }}</td>
                            </tr>
                            <tr class="rc-row-total">
                                <td>Total</td>
                                <td>{{ ['Walk-in', 'OTA', 'TPA'].reduce((s, c) => s + rev_bk[c].bs_ct, 0) }}</td>
                                <td :style="pmsStyle">{{ amt(['Walk-in', 'OTA', 'TPA'].reduce((s, c) => s + rev_bk[c].bs_amt, 0)) }}</td>
                                <td>{{ ['Walk-in', 'OTA', 'TPA'].reduce((s, c) => s + rev_bk[c].si_ct, 0) }}</td>
                                <td :style="erpStyle">{{ amt(['Walk-in', 'OTA', 'TPA'].reduce((s, c) => s + rev_bk[c].si_amt, 0)) }}</td>
                                <td>{{ diff(['Walk-in', 'OTA', 'TPA'].reduce((s, c) => s + rev_bk[c].bs_amt, 0) - ['Walk-in', 'OTA', 'TPA'].reduce((s, c) => s + rev_bk[c].si_amt, 0)) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Collection Breakdown -->
                <div class="rc-breakdown-card">
                    <div class="rc-breakdown-card__hdr">
                        <span>Collection Breakdown</span>
                        <span class="rc-breakdown-card__date">{{ formatDate(selectedFrom) }} — {{ formatDate(selectedTo) }}</span>
                    </div>
                    <table class="table rc-bk-tbl">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>PMS</th>
                                <th :style="pmsHeadStyle">PMS Amt</th>
                                <th>ERP</th>
                                <th :style="erpHeadStyle">ERP Amt</th>
                                <th>Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="cat in ['Cash', 'UPI', 'Debit/Credit', 'Other']" :key="cat" :class="isIssueDiff(col_bk[cat].bs_amt - col_bk[cat].si_amt) ? 'rc-row-err' : ''">
                                <td>{{ cat }}</td>
                                <td>{{ col_bk[cat].bs_ct }}</td>
                                <td :style="pmsStyle">{{ amt(col_bk[cat].bs_amt) }}</td>
                                <td>{{ col_bk[cat].si_ct }}</td>
                                <td :style="erpStyle">{{ amt(col_bk[cat].si_amt) }}</td>
                                <td :class="isIssueDiff(col_bk[cat].bs_amt - col_bk[cat].si_amt) ? 'rc-diff' : ''">{{ diff(col_bk[cat].bs_amt - col_bk[cat].si_amt) }}</td>
                            </tr>
                            <tr class="rc-row-total">
                                <td>Total</td>
                                <td>{{ ['Cash', 'UPI', 'Debit/Credit', 'Other'].reduce((s, c) => s + col_bk[c].bs_ct, 0) }}</td>
                                <td :style="pmsStyle">{{ amt(['Cash', 'UPI', 'Debit/Credit', 'Other'].reduce((s, c) => s + col_bk[c].bs_amt, 0)) }}</td>
                                <td>{{ ['Cash', 'UPI', 'Debit/Credit', 'Other'].reduce((s, c) => s + col_bk[c].si_ct, 0) }}</td>
                                <td :style="erpStyle">{{ amt(['Cash', 'UPI', 'Debit/Credit', 'Other'].reduce((s, c) => s + col_bk[c].si_amt, 0)) }}</td>
                                <td>{{ diff(['Cash', 'UPI', 'Debit/Credit', 'Other'].reduce((s, c) => s + col_bk[c].bs_amt, 0) - ['Cash', 'UPI', 'Debit/Credit', 'Other'].reduce((s, c) => s + col_bk[c].si_amt, 0)) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

<!-- ════════ BOOKING TABLE ════════ -->
<div v-if="isBookingView" class="rc-card" style="margin-bottom: 30px">
    <table class="table rc-tbl">
        <thead><tr>
            <th>Booking</th><th>Guest</th><th>Source</th><th class="r">Folios</th>
            <th class="r" :style="pmsHeadStyle">PMS Total</th><th class="r" :style="erpHeadStyle">ERP Total</th><th class="r">Diff</th><th>Tags</th><th>Status</th>
        </tr></thead>
        <tbody>
        <tr v-for="b in paged" :key="b.booking_id" class="rc-clickrow"
            :class="{'rc-row-err':b.status==='mismatch','rc-row-warn':b.status==='bs_only'}"
            @click="drillBooking(b.booking_id)">
            <td class="rc-id">
                <div style="display:flex; align-items:center;">
                    <span>{{ b.booking_id }}</span>
                    <button class="rc-copy-badge" @click.stop="copyIdentifier(b.booking_id, 'Booking ID', $event)">Copy</button>
                </div>
            </td>
            <td>{{ b.bs_guest || '—' }}</td>
            <td>{{ b.bs_source || '—' }}</td>
            <td class="r">{{ b.bs_folio_count }}</td>
            <td class="r" :style="pmsStyle">{{ amt(b.bs_total) }}</td>
            <td class="r" :style="erpStyle">{{ amt(b.si_total) }}</td>
            <td class="r" :class="isIssueDiff(b.difference)?'rc-diff':''">{{ diff(b.difference) }}</td>
            <td>
                <div style="display:flex; gap:3px; flex-wrap:wrap;">
                    <span v-for="tag in (b.booking_tags || [])" :key="tag" class="rc-tag" :class="'rc-tag--' + tag.toLowerCase()">{{ tag }}</span>
                </div>
            </td>
            <td v-html="badge(b.status)"></td>
        </tr>
        <tr v-if="!paged.length"><td colspan="9" class="rc-empty-row">No records match your filters.</td></tr>
        </tbody>
    </table>
</div>

<!-- ════════ FOLIO (INVOICE) TABLE ════════ -->
<div v-if="view==='folios'" class="rc-card" style="margin-bottom: 30px">
    <table class="table rc-tbl">
        <thead><tr>
            <th style="width:24px"></th><th>Folio</th><th>Guest</th><th>Room</th><th>Tags</th>
            <th class="r" :style="pmsHeadStyle">PMS Amount</th><th class="r" :style="erpHeadStyle">ERP Amount</th><th class="r">Diff</th>
            <th>Checks</th><th>Status</th>
        </tr></thead>
        <tbody>
        <template v-for="f in paged" :key="f.folio">
        <tr class="rc-clickrow"
            :class="{'rc-row-err':f.status==='mismatch','rc-row-warn':f.status==='bs_only'}"
            @click="toggleDetail(f.folio)">
            <td class="rc-caret" style="width: 32px; text-align: center;">
                <div v-html="getFolioIcon(f)" 
                     :style="{ transform: expanded === f.folio ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }">
                </div>
            </td>
            <td class="rc-id">
                <span>{{ f.folio }}</span>
                <button class="rc-copy-badge" @click.stop="copyIdentifier(f.folio, 'Folio', $event)">Copy</button>
            </td>
            <td>{{ f.bs_guest_name || f.si_customer || '—' }}</td>
            <td>{{ f.bs_room || '—' }}</td>
            <td>
                <div style="display:flex; gap:3px; flex-wrap:wrap;">
                    <template v-for="tag in (f.booking_tags || [])" :key="tag">
                        <span v-if="tag !== 'Individual'" class="rc-tag" :class="'rc-tag--' + tag.toLowerCase()">{{ tag }}</span>
                    </template>
                </div>
            </td>
            <td class="r" :style="pmsStyle">{{ amt(f.bs_grand_total) }}</td>
            <td class="r" :style="erpStyle">{{ amt(f.si_grand_total) }}</td>
            <td class="r" :class="isIssueDiff(f.difference)?'rc-diff':''">{{ diff(f.difference) }}</td>
            <td>
                <div style="font-size: 11px; display: flex; gap: 4px; align-items:center;">
                    <span v-html="statusIcon('amount', f.amount_match)"></span>
                    <span v-if="f.revenue" v-html="statusIcon('revenue', f.revenue.status==='matched')"></span>
                    <span v-if="f.payment" v-html="statusIcon('payment', f.payment.status==='matched')"></span>
                </div>
            </td>
            <td v-html="badge(f.status)"></td>
        </tr>

        <!-- ══ DETAIL PANEL ══ -->
        <tr v-if="expanded===f.folio && f.revenue !== null" class="rc-detail-row">
            <td colspan="10" class="rc-detail-cell">
                <div style="text-align: right; margin-bottom: 8px;">
                    <button class="btn btn-xs btn-default" @click="copyDispute(f)">📋 Copy Dispute Note</button>
                </div>
                <div class="rc-panels">

                    <!-- Revenue Comparison -->
                    <div class="rc-panel">
                        <div class="rc-panel__hdr">
                            Revenue Comparison
                            <span v-html="badge(f.revenue?.status)" style="margin-left:8px"></span>
                        </div>
                        <div v-if="f.revenue" style="padding: 12px;">
                            <table class="table rc-sub-tbl rc-sub-tbl--revenue" style="margin-bottom: 12px;">
                                <thead><tr><th>Component</th><th class="r" :style="pmsHeadStyle">PMS</th><th class="r" :style="erpHeadStyle">ERP</th><th class="r">Diff</th><th>Result</th></tr></thead>
                                <tbody>
                                <tr :class="!f.revenue.pretax_match ? 'rc-row-err' : ''">
                                    <td>Pre-tax Revenue</td>
                                    <td class="r" :style="pmsStyle">{{ amt(f.revenue.bs_pretax) }}</td>
                                    <td class="r" :style="erpStyle">{{ amt(f.revenue.si_pretax) }}</td>
                                    <td class="r" :class="isIssueDiff(f.revenue.bs_pretax - f.revenue.si_pretax)?'rc-diff':''">{{ diff(f.revenue.bs_pretax - f.revenue.si_pretax) }}</td>
                                    <td v-html="badge(f.revenue.pretax_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                <tr :class="!f.revenue.tax_match ? 'rc-row-err' : ''">
                                    <td>Tax</td>
                                    <td class="r" :style="pmsStyle">{{ amt(f.revenue.bs_tax) }}</td>
                                    <td class="r" :style="erpStyle">{{ amt(f.revenue.si_tax) }}</td>
                                    <td class="r" :class="isIssueDiff(f.revenue.bs_tax - f.revenue.si_tax)?'rc-diff':''">{{ diff(f.revenue.bs_tax - f.revenue.si_tax) }}</td>
                                    <td v-html="badge(f.revenue.tax_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                <tr class="rc-row-total">
                                    <td><strong>Total</strong></td>
                                    <td class="r" :style="pmsStyle"><strong>{{ amt(f.revenue.bs_total) }}</strong></td>
                                    <td class="r" :style="erpStyle"><strong>{{ amt(f.revenue.si_total) }}</strong></td>
                                    <td class="r" :class="isIssueDiff(f.revenue.bs_total - f.revenue.si_total)?'rc-diff':''">{{ diff(f.revenue.bs_total - f.revenue.si_total) }}</td>
                                    <td v-html="badge(f.revenue.total_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                </tbody>
                            </table>
                            
                            <div style="display: flex; gap: 24px; font-size: 11px;">
                                <div class="rc-breakdown-box" :style="pmsBorder" style="flex: 1;">
                                    <strong class="rc-breakdown-box__label" :style="pmsColor ? {color: pmsColor} : {}">PMS Breakdown</strong>
                                    <div v-for="b in f.revenue.bs_breakdown" :key="b.category" style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                        <span>{{ b.category }}</span><span class="r">{{ amt(b.amount) }}</span>
                                    </div>
                                    <div v-if="!f.revenue.bs_breakdown?.length" style="color:var(--text-muted)">No data</div>
                                </div>
                                <div class="rc-breakdown-box" :style="erpBorder" style="flex: 1;">
                                    <strong class="rc-breakdown-box__label" :style="erpColor ? {color: erpColor} : {}">ERP Sub-Accounts</strong>
                                    <div v-for="b in f.revenue.si_breakdown" :key="b.category" style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;" :title="b.category">{{ b.category }}</span><span class="r">{{ amt(b.amount) }}</span>
                                    </div>
                                    <div v-if="!f.revenue.si_breakdown?.length" style="color:var(--text-muted)">No data</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Payment Comparison -->
                    <div class="rc-panel">
                        <div class="rc-panel__hdr">
                            Payment Comparison
                            <span v-html="badge(f.payment?.status)" style="margin-left:8px"></span>
                        </div>
                        <table v-if="f.payment" class="table rc-sub-tbl">
                            <thead><tr><th>Mode</th><th class="r" :style="pmsHeadStyle">PMS Count</th><th class="r" :style="erpHeadStyle">ERP Count</th><th>Result</th></tr></thead>
                            <tbody>
                            <tr v-for="m in f.payment.modes" :key="m.mode"
                                :class="!m.match ? 'rc-row-err' : ''">
                                <td>{{ m.mode }}</td>
                                <td class="r" :style="pmsStyle">{{ m.bs_count }}</td>
                                <td class="r" :style="erpStyle">{{ m.si_count }}</td>
                                <td v-html="badge(m.match ? 'matched' : 'mismatch')"></td>
                            </tr>
                            <tr class="rc-row-total">
                                <td><strong>Total Paid</strong></td>
                                <td class="r" :style="pmsStyle"><strong>{{ amt(f.payment.bs_total_paid) }}</strong></td>
                                <td class="r" :style="erpStyle"><strong>{{ amt(f.payment.si_total_paid) }}</strong></td>
                                <td v-html="badge(f.payment.total_match ? 'matched' : 'mismatch')"></td>
                            </tr>
                            <tr v-if="f.payment.si_is_fully_paid || f.payment.erp_exceeds_pms">
                                <td><strong>Rule</strong></td>
                                <td colspan="3">
                                    <span v-if="f.payment.si_is_fully_paid">ERP marked fully paid because outstanding amount is zero.</span>
                                    <span v-else-if="f.payment.erp_exceeds_pms">ERP paid total exceeds PMS total.</span>
                                </td>
                            </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </td>
        </tr>
        </template>
        <tr v-if="!paged.length"><td colspan="10" class="rc-empty-row">No records match your filters.</td></tr>
        </tbody>
    </table>
</div>

<!-- ════════ PAGINATION ════════ -->
<div class="rc-pager" v-if="rows.length>0">
    <span class="text-muted small">{{ (page-1)*perPage+1 }}–{{ Math.min(page*perPage, rows.length) }} of {{ rows.length }}</span>
    <div>
        <button class="btn btn-xs btn-default" @click="page--" :disabled="page<=1">← Prev</button>
        <span class="rc-pager__cur">{{ page }} / {{ pages }}</span>
        <button class="btn btn-xs btn-default" @click="page++" :disabled="page>=pages">Next →</button>
    </div>
</div>

</template>
        </div> <!-- end .rc-main -->
    </div> <!-- end .rc-layout -->
</div> <!-- end .rc -->
        `,
    }).mount("#recon-app");
}
