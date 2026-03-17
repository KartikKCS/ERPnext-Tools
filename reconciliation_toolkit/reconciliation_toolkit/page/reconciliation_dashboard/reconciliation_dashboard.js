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
    page.body.append(`<div id="recon-app"></div>`);
    mount_vue_app();
}

/* ── Helpers ── */

function badge(status) {
    const m = {
        matched:  ["✓ Matched",  "badge--ok"],
        mismatch: ["✗ Mismatch", "badge--err"],
        bs_only:  ["Missing in ERP", "badge--warn"],
        si_only:  ["Missing in PMS", "badge--warn"],
        no_data:  ["Unavailable",    "badge--muted"],
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

function pct(n, total) {
    if (!total) return "0%";
    return Math.round((n / total) * 100) + "%";
}

/* ── Color Validation (block green/red/amber hue zones) ── */

function _hexToHue(hex) {
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    if (d === 0) return 0;
    let h = 0;
    if (max === r) h = ((g-b)/d + 6) % 6;
    else if (max === g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    return h * 60;
}

function _hexToSat(hex) {
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
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
    const c = (1 - Math.abs(2*l - 1)) * s;
    const x = c * (1 - Math.abs(((target/60) % 2) - 1));
    const m = l - c/2;
    let r1, g1, b1;
    if (target < 60)       { r1=c; g1=x; b1=0; }
    else if (target < 120) { r1=x; g1=c; b1=0; }
    else if (target < 180) { r1=0; g1=c; b1=x; }
    else if (target < 240) { r1=0; g1=x; b1=c; }
    else if (target < 300) { r1=x; g1=0; b1=c; }
    else                   { r1=c; g1=0; b1=x; }
    const toHex = v => Math.round((v+m)*255).toString(16).padStart(2,'0');
    return '#' + toHex(r1) + toHex(g1) + toHex(b1);
}

/* ── Vue App ── */

function mount_vue_app() {
    const { createApp } = Vue;

    createApp({
        data() {
            return {
                bs_ctl: null, si_ctl: null, tol_ctl: null,
                result: null,
                loading: false,
                view: "bookings",
                search: "",
                filter: "all",
                errorsOnly: false,
                expanded: null,
                sel_booking: null,
                page: 1,
                perPage: 20,
                // Sort & Filter panel state
                showSortPanel: false,
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
            };
        },

        computed: {
            s()       { return this.result?.summary || null; },
            bk_list() { return this.result?.bookings?.bookings || []; },
            fo_all()  { return this.result?.folios || []; },
            has_bk()  { return this.result?.bookings?.status !== "no_data"; },

            rows() {
                let source = this.view === "bookings"
                    ? this.bk_list
                    : (this.sel_booking
                        ? (this.bk_list.find(b => b.booking_id === this.sel_booking)?.folios || [])
                        : this.fo_all);

                let items = source.slice();

                // Status filter
                if (this.filter === "matched")
                    items = items.filter(x => x.status === "matched");
                else if (this.filter === "mismatch")
                    items = items.filter(x => x.status === "mismatch");
                else if (this.filter === "missing")
                    items = items.filter(x => x.status === "bs_only" || x.status === "si_only");

                if (this.errorsOnly) {
                    items = items.filter(x => x.status !== "matched");
                }

                // Text search
                if (this.search) {
                    const q = this.search.toLowerCase();
                    items = items.filter(x => {
                        const fields = this.view === "bookings"
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
                if (this.filterSources.length > 0 && this.view === 'bookings') {
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
                    const pri = { bs_only: 0, si_only: 0, mismatch: 1, matched: 2 };
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
            pmsStyle()    { return this.pmsColor ? { color: this.pmsColor } : {}; },
            erpStyle()    { return this.erpColor ? { color: this.erpColor } : {}; },
            pmsBorder()   { return this.pmsColor ? { borderLeftColor: this.pmsColor } : {}; },
            erpBorder()   { return this.erpColor ? { borderLeftColor: this.erpColor } : {}; },
            pmsHeadStyle(){ return this.pmsColor ? { color: this.pmsColor, fontWeight: 700 } : {}; },
            erpHeadStyle(){ return this.erpColor ? { color: this.erpColor, fontWeight: 700 } : {}; },

            pmsInputColor() { return this.pmsColor || '#2563eb'; },
            erpInputColor() { return this.erpColor || '#ea580c'; },
        },

        methods: {
            run() {
                const bs = this.bs_ctl.get_value();
                const si = this.si_ctl.get_value();
                if (!bs || !si) { frappe.msgprint("Upload both JSON files to proceed."); return; }
                this.loading = true;
                this.result = null;
                this.expanded = null;
                this.sel_booking = null;
                this.view = "bookings";
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
                    args: { bs_file: bs, si_file: si, tolerance: this.tol_ctl.get_value() || 1 },
                    freeze: true,
                    freeze_message: "Analysing data across all reconciliation layers…",
                    callback: r => {
                        this.result = r.message;
                        this.loading = false;
                        if (!this.has_bk) this.view = "folios";
                    },
                    error: () => { this.loading = false; },
                });
            },

            setFilter(f) { this.filter = f; this.page = 1; },
            setView(v)   { this.view = v; this.sel_booking = null; this.expanded = null; this.page = 1; this.filter = "all"; this.search = ""; },
            drillBooking(id) { this.sel_booking = id; this.view = "folios"; this.expanded = null; this.page = 1; this.filter = "all"; },
            toggleDetail(f)  { this.expanded = this.expanded === f ? null : f; },
            goBack()         { this.sel_booking = null; this.view = "bookings"; this.expanded = null; },

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
                        if (py.modes && py.modes.length) {
                            for (const m of py.modes) {
                                const mark = m.bs_amount === m.si_amount ? '✓' : '✗';
                                ln.push(`  ${pad(m.mode || '—', 16)} ${a(m.bs_amount).padStart(12)}  ${a(m.si_amount).padStart(12)}  ${mark}`);
                            }
                        }
                        ln.push(`  ${pad('Total', 16)} ${a(py.bs_total_paid).padStart(12)}  ${a(py.si_total_paid).padStart(12)}  ${py.bs_total_paid === py.si_total_paid ? '✓' : '✗'}`);
                    }
                    ln.push('');
                }

                ln.push(HR);
                const text = ln.join('\n');
                navigator.clipboard.writeText(text).then(() => {
                    frappe.show_alert({message: 'Dispute note copied', indicator: 'green'});
                });
            },

            // Sort/filter panel methods
            toggleSortPanel() { this.showSortPanel = !this.showSortPanel; },
            closeSortPanel()  { this.showSortPanel = false; },
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

            badge, amt, diff, pct,
        },

        mounted() {
            this.bs_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_bs"), df: { label: "Bill Summary (JSON)", fieldtype: "Attach" }, render_input: true,
            });
            this.si_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_si"), df: { label: "Sales Invoice (JSON)", fieldtype: "Attach" }, render_input: true,
            });
            this.tol_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_tol"), df: { label: "Tolerance (₹)", fieldtype: "Float", default: 1 }, render_input: true,
            });
            // Load saved colors from localStorage
            const savedPms = localStorage.getItem('rc_pms_color');
            const savedErp = localStorage.getItem('rc_erp_color');
            if (savedPms) this.pmsColor = savedPms;
            if (savedErp) this.erpColor = savedErp;
            // Click-outside listener for settings popover
            document.addEventListener('click', this.closeSettings);
        },
        beforeUnmount() {
            document.removeEventListener('click', this.closeSettings);
        },

        template: `
<div class="rc">

<!-- ════════ UPLOAD ════════ -->
<div class="rc-upload">
    <div class="rc-upload__fields">
        <div id="rc_bs" class="rc-upload__f"></div>
        <div id="rc_si" class="rc-upload__f"></div>
        <div id="rc_tol" class="rc-upload__f rc-upload__f--sm"></div>
    </div>
    <button class="btn btn-primary btn-sm rc-upload__btn" @click="run" :disabled="loading">
        {{ loading ? "Analysing…" : "Reconcile" }}
    </button>
</div>

<div v-if="!result && !loading" class="rc-placeholder">
    <div class="rc-placeholder__icon">📊</div>
    <h5>Upload files to begin</h5>
    <p>Drag & drop your Bill Summary and Sales Invoice JSON files above, then click Reconcile.</p>
</div>

<template v-if="result">

<!-- ════════ OVERVIEW STRIP ════════ -->
<div class="rc-overview">
    <div class="rc-stat rc-stat--accent">
        <span class="rc-stat__n">{{ s.total_folios }}</span>
        <span class="rc-stat__l">Folios</span>
    </div>
    <div class="rc-stat" :class="s.match_percent >= 90 ? 'rc-stat--ok' : 'rc-stat--err'">
        <span class="rc-stat__n">{{ s.match_percent }}%</span>
        <span class="rc-stat__l">Overall Match</span>
    </div>
    <div class="rc-stat" :class="s.levels.folio.mismatched ? 'rc-stat--err' : 'rc-stat--ok'">
        <span class="rc-stat__n">{{ s.levels.folio.matched }}</span>
        <span class="rc-stat__l">Folios OK</span>
    </div>
    <div class="rc-stat" :class="s.levels.folio.mismatched ? 'rc-stat--err' : 'rc-stat--ok'">
        <span class="rc-stat__n">{{ s.levels.folio.mismatched }}</span>
        <span class="rc-stat__l">Amount Issues</span>
    </div>
    <div class="rc-stat" :class="s.levels.revenue.mismatched ? 'rc-stat--err' : 'rc-stat--ok'">
        <span class="rc-stat__n">{{ s.levels.revenue.mismatched }}</span>
        <span class="rc-stat__l">Revenue Issues</span>
    </div>
    <div class="rc-stat" :class="s.levels.payment.mismatched ? 'rc-stat--err' : 'rc-stat--ok'">
        <span class="rc-stat__n">{{ s.levels.payment.mismatched }}</span>
        <span class="rc-stat__l">Payment Issues</span>
    </div>
</div>

<!-- ════════ TOOLBAR ════════ -->
<div class="rc-bar">
    <div class="rc-bar__l">
        <button v-if="sel_booking" class="btn btn-xs btn-default" @click="goBack">← All Bookings</button>
        <template v-if="!sel_booking">
            <button class="btn btn-xs" :class="view==='bookings' ? 'btn-primary':'btn-default'"
                    @click="setView('bookings')" :disabled="!has_bk">Bookings</button>
            <button class="btn btn-xs" :class="view==='folios' ? 'btn-primary':'btn-default'"
                    @click="setView('folios')">Folios</button>
        </template>
        <span v-if="sel_booking" class="rc-crumb">{{ sel_booking }}</span>
    </div>
    <div class="rc-bar__r">
        <button class="btn btn-xs btn-default rc-sort-btn" @click="toggleSortPanel">
            🔀 Sort & Filter
            <span v-if="activeFilterCount" class="rc-filter-badge">{{ activeFilterCount }}</span>
        </button>
        <label style="display:inline-flex; align-items:center; gap:6px; margin-right: 12px; cursor: pointer; color: var(--red-500); font-weight: 600;">
            <input type="checkbox" v-model="errorsOnly" /> Only Show Errors
        </label>
        <input class="form-control input-xs rc-search" placeholder="Search…" v-model="search" />
        <span class="rc-filters">
            <button class="btn btn-xs" :class="filter==='all'?'btn-default active':'btn-default'" @click="setFilter('all')">All</button>
            <button class="btn btn-xs" :class="filter==='matched'?'btn-success active':'btn-default'" @click="setFilter('matched')">Matched</button>
            <button class="btn btn-xs" :class="filter==='mismatch'?'btn-danger active':'btn-default'" @click="setFilter('mismatch')">Issues</button>
            <button class="btn btn-xs" :class="filter==='missing'?'btn-warning active':'btn-default'" @click="setFilter('missing')">Missing</button>
        </span>

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

<!-- ════════ BOOKING TABLE ════════ -->
<div v-if="view==='bookings'" class="rc-card">
    <table class="table rc-tbl">
        <thead><tr>
            <th>Booking</th><th>Guest</th><th>Source</th><th class="r">Folios</th>
            <th class="r" :style="pmsHeadStyle">PMS Total</th><th class="r" :style="erpHeadStyle">ERP Total</th><th class="r">Diff</th><th>Status</th>
        </tr></thead>
        <tbody>
        <tr v-for="b in paged" :key="b.booking_id" class="rc-clickrow"
            :class="{'rc-row-err':b.status==='mismatch','rc-row-warn':b.status==='bs_only'||b.status==='si_only'}"
            @click="drillBooking(b.booking_id)">
            <td class="rc-id">{{ b.booking_id }}</td>
            <td>{{ b.bs_guest || '—' }}</td>
            <td>{{ b.bs_source || '—' }}</td>
            <td class="r">{{ b.bs_folio_count }}</td>
            <td class="r" :style="pmsStyle">{{ amt(b.bs_total) }}</td>
            <td class="r" :style="erpStyle">{{ amt(b.si_total) }}</td>
            <td class="r" :class="b.difference?'rc-diff':''">{{ diff(b.difference) }}</td>
            <td v-html="badge(b.status)"></td>
        </tr>
        <tr v-if="!paged.length"><td colspan="8" class="rc-empty-row">No records match your filters.</td></tr>
        </tbody>
    </table>
</div>

<!-- ════════ FOLIO TABLE ════════ -->
<div v-if="view==='folios'" class="rc-card">
    <table class="table rc-tbl">
        <thead><tr>
            <th style="width:24px"></th><th>Folio</th><th>Guest</th><th>Room</th>
            <th class="r" :style="pmsHeadStyle">PMS Amount</th><th class="r" :style="erpHeadStyle">ERP Amount</th><th class="r">Diff</th>
            <th>Payment</th><th>Status</th>
        </tr></thead>
        <tbody>
        <template v-for="f in paged" :key="f.folio">
        <tr class="rc-clickrow"
            :class="{'rc-row-err':f.status==='mismatch','rc-row-warn':f.status==='bs_only'||f.status==='si_only'}"
            @click="toggleDetail(f.folio)">
            <td class="rc-caret">{{ expanded===f.folio?'▾':'▸' }}</td>
            <td class="rc-id">{{ f.folio }}</td>
            <td>{{ f.bs_guest_name || f.si_customer || '—' }}</td>
            <td>{{ f.bs_room || '—' }}</td>
            <td class="r" :style="pmsStyle">{{ amt(f.bs_grand_total) }}</td>
            <td class="r" :style="erpStyle">{{ amt(f.si_grand_total) }}</td>
            <td class="r" :class="f.difference&&f.difference!==0?'rc-diff':''">{{ diff(f.difference) }}</td>
            <td>
                <div style="font-size: 11px; display: flex; gap: 4px;">
                    <span :title="'Amount: ' + (f.amount_match ? 'OK' : 'Error')">{{ f.amount_match ? '🔘' : '🔴' }}</span>
                    <span v-if="f.revenue" :title="'Revenue: ' + (f.revenue.status==='matched' ? 'OK' : 'Error')">{{ f.revenue.status==='matched' ? '🔘' : '🔴' }}</span>
                    <span v-if="f.payment" :title="'Payment: ' + (f.payment.status==='matched' ? 'OK' : 'Error')">{{ f.payment.status==='matched' ? '🔘' : '🔴' }}</span>
                </div>
            </td>
            <td v-html="badge(f.status)"></td>
        </tr>

        <!-- ══ DETAIL PANEL ══ -->
        <tr v-if="expanded===f.folio && f.revenue !== null" class="rc-detail-row">
            <td colspan="9" class="rc-detail-cell">
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
                                    <td class="r" :class="(f.revenue.bs_pretax-f.revenue.si_pretax)?'rc-diff':''">{{ diff(f.revenue.bs_pretax - f.revenue.si_pretax) }}</td>
                                    <td v-html="badge(f.revenue.pretax_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                <tr :class="!f.revenue.tax_match ? 'rc-row-err' : ''">
                                    <td>Tax</td>
                                    <td class="r" :style="pmsStyle">{{ amt(f.revenue.bs_tax) }}</td>
                                    <td class="r" :style="erpStyle">{{ amt(f.revenue.si_tax) }}</td>
                                    <td class="r" :class="(f.revenue.bs_tax-f.revenue.si_tax)?'rc-diff':''">{{ diff(f.revenue.bs_tax - f.revenue.si_tax) }}</td>
                                    <td v-html="badge(f.revenue.tax_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                <tr class="rc-row-total">
                                    <td><strong>Total</strong></td>
                                    <td class="r" :style="pmsStyle"><strong>{{ amt(f.revenue.bs_total) }}</strong></td>
                                    <td class="r" :style="erpStyle"><strong>{{ amt(f.revenue.si_total) }}</strong></td>
                                    <td class="r" :class="(f.revenue.bs_total-f.revenue.si_total)?'rc-diff':''">{{ diff(f.revenue.bs_total - f.revenue.si_total) }}</td>
                                    <td v-html="badge(f.revenue.total_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                </tbody>
                            </table>
                            
                            <div style="display: flex; gap: 12px; font-size: 11px;">
                                <div class="rc-breakdown-box" :style="pmsBorder">
                                    <strong class="rc-breakdown-box__label" :style="pmsColor ? {color: pmsColor} : {}">PMS Breakdown</strong>
                                    <div v-for="b in f.revenue.bs_breakdown" :key="b.category" style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                        <span>{{ b.category }}</span><span class="r">{{ amt(b.amount) }}</span>
                                    </div>
                                    <div v-if="!f.revenue.bs_breakdown?.length" style="color:var(--text-muted)">No data</div>
                                </div>
                                <div class="rc-breakdown-box" :style="erpBorder">
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
                            <thead><tr><th>Mode</th><th class="r" :style="pmsHeadStyle">PMS</th><th class="r" :style="erpHeadStyle">ERP</th><th class="r">Diff</th><th>Result</th></tr></thead>
                            <tbody>
                            <tr v-for="m in f.payment.modes" :key="m.mode"
                                :class="!m.match ? 'rc-row-err' : ''">
                                <td>{{ m.mode }}</td>
                                <td class="r" :style="pmsStyle">{{ amt(m.bs_amount) }}</td>
                                <td class="r" :style="erpStyle">{{ amt(m.si_amount) }}</td>
                                <td class="r" :class="m.difference?'rc-diff':''">{{ diff(m.difference) }}</td>
                                <td v-html="badge(m.match ? 'matched' : 'mismatch')"></td>
                            </tr>
                            <tr class="rc-row-total">
                                <td><strong>Total Paid</strong></td>
                                <td class="r" :style="pmsStyle"><strong>{{ amt(f.payment.bs_total_paid) }}</strong></td>
                                <td class="r" :style="erpStyle"><strong>{{ amt(f.payment.si_total_paid) }}</strong></td>
                                <td></td>
                                <td v-html="badge(f.payment.total_match ? 'matched' : 'mismatch')"></td>
                            </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </td>
        </tr>
        </template>
        <tr v-if="!paged.length"><td colspan="9" class="rc-empty-row">No records match your filters.</td></tr>
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

<!-- ════════ SORT & FILTER PANEL ════════ -->
<div v-if="showSortPanel" class="rc-panel-overlay" @click="closeSortPanel"></div>
<transition name="rc-slide">
<div v-if="showSortPanel" class="rc-sort-panel">
    <div class="rc-sort-panel__hdr">
        <span>Sort & Filter</span>
        <button class="btn btn-xs btn-default" @click="closeSortPanel">✕</button>
    </div>

    <div class="rc-sort-panel__section">
        <div class="rc-sort-panel__label">SORT BY</div>
        <div class="rc-radio-group">
            <label class="rc-radio" :class="{'rc-radio--active': sortBy==='none'}">
                <input type="radio" v-model="sortBy" value="none" /> Default
            </label>
            <label class="rc-radio" :class="{'rc-radio--active': sortBy==='discrepancy'}">
                <input type="radio" v-model="sortBy" value="discrepancy" /> Discrepancy ↓
            </label>
            <label class="rc-radio" :class="{'rc-radio--active': sortBy==='pms'}">
                <input type="radio" v-model="sortBy" value="pms" /> PMS Amount ↓
            </label>
            <label class="rc-radio" :class="{'rc-radio--active': sortBy==='erp'}">
                <input type="radio" v-model="sortBy" value="erp" /> ERP Amount ↓
            </label>
            <label class="rc-radio" :class="{'rc-radio--active': sortBy==='guest'}">
                <input type="radio" v-model="sortBy" value="guest" /> Guest A–Z
            </label>
            <label class="rc-radio" :class="{'rc-radio--active': sortBy==='status'}">
                <input type="radio" v-model="sortBy" value="status" /> Status Priority
            </label>
        </div>
    </div>

    <div class="rc-sort-panel__section">
        <div class="rc-sort-panel__label">MINIMUM DIFFERENCE</div>
        <div class="rc-range-row">
            <input type="range" class="rc-range" v-model.number="filterMinDiff" min="0" max="50000" step="100" />
            <span class="rc-range-val">{{ filterMinDiff > 0 ? '₹' + filterMinDiff.toLocaleString('en-IN') : 'Off' }}</span>
        </div>
    </div>

    <div class="rc-sort-panel__section">
        <div class="rc-sort-panel__label">MISMATCH TYPE</div>
        <div class="rc-chip-group">
            <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='all'}" @click="filterMismatchType='all'">All</button>
            <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='revenue'}" @click="filterMismatchType='revenue'">Revenue</button>
            <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='payment'}" @click="filterMismatchType='payment'">Payment</button>
            <button class="rc-chip" :class="{'rc-chip--active': filterMismatchType==='amount'}" @click="filterMismatchType='amount'">Amount</button>
        </div>
    </div>

    <div class="rc-sort-panel__section" v-if="view==='bookings' && uniqueSources.length > 1">
        <div class="rc-sort-panel__label">SOURCE</div>
        <div class="rc-source-list">
            <label class="rc-source-item" v-for="src in uniqueSources" :key="src">
                <input type="checkbox" :checked="filterSources.includes(src)" @change="toggleSource(src)" />
                <span>{{ src }}</span>
            </label>
        </div>
    </div>

    <div class="rc-sort-panel__footer" v-if="activeFilterCount > 0">
        <button class="btn btn-xs btn-default rc-clear-btn" @click="clearAllFilters">Clear All Filters</button>
    </div>
</div>
</transition>

</div>
        `,
    }).mount("#recon-app");
}