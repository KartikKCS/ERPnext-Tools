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
                sortDiscrepancy: false,
                expanded: null,
                sel_booking: null,
                page: 1,
                perPage: 20,
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

                let items = source.slice(); // Copy array to avoid mutating state

                if (this.filter === "matched")
                    items = items.filter(x => x.status === "matched");
                else if (this.filter === "mismatch")
                    items = items.filter(x => x.status === "mismatch");
                else if (this.filter === "missing")
                    items = items.filter(x => x.status === "bs_only" || x.status === "si_only");

                if (this.errorsOnly) {
                    items = items.filter(x => x.status !== "matched");
                }

                if (this.search) {
                    const q = this.search.toLowerCase();
                    items = items.filter(x => {
                        const fields = this.view === "bookings"
                            ? [x.booking_id, x.bs_guest]
                            : [x.folio, x.bs_guest_name, x.si_customer];
                        return fields.some(f => f && f.toLowerCase().includes(q));
                    });
                }

                if (this.sortDiscrepancy) {
                    items.sort((a, b) => Math.abs(b.difference || 0) - Math.abs(a.difference || 0));
                }

                return items;
            },

            paged() {
                const s = (this.page - 1) * this.perPage;
                return this.rows.slice(s, s + this.perPage);
            },

            pages() { return Math.max(1, Math.ceil(this.rows.length / this.perPage)); },
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
                this.sortDiscrepancy = false;
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
                const lines = [
                    `Folio: ${f.folio}`,
                    `Discrepancy: ${this.diff(f.difference)}`,
                ];
                if (f.revenue && f.revenue.status !== 'matched') {
                    lines.push(`Revenue: PMS ${this.amt(f.revenue.bs_total)} vs ERP ${this.amt(f.revenue.si_total)}`);
                }
                if (f.payment && f.payment.status !== 'matched') {
                    lines.push(`Payments: PMS ${this.amt(f.payment.bs_total_paid)} vs ERP ${this.amt(f.payment.si_total_paid)}`);
                }
                const text = lines.join("\\n");
                navigator.clipboard.writeText(text).then(() => {
                    frappe.show_alert({message: 'Dispute note copied to clipboard', indicator: 'green'});
                });
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
        <label style="display:inline-flex; align-items:center; gap:6px; margin-right: 12px; cursor: pointer;">
            <input type="checkbox" v-model="sortDiscrepancy" /> Smart Sort
        </label>
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
    </div>
</div>

<!-- ════════ BOOKING TABLE ════════ -->
<div v-if="view==='bookings'" class="rc-card">
    <table class="table rc-tbl">
        <thead><tr>
            <th>Booking</th><th>Guest</th><th>Source</th><th class="r">Folios</th>
            <th class="r">PMS Total</th><th class="r">ERP Total</th><th class="r">Diff</th><th>Status</th>
        </tr></thead>
        <tbody>
        <tr v-for="b in paged" :key="b.booking_id" class="rc-clickrow"
            :class="{'rc-row-err':b.status==='mismatch','rc-row-warn':b.status==='bs_only'||b.status==='si_only'}"
            @click="drillBooking(b.booking_id)">
            <td class="rc-id">{{ b.booking_id }}</td>
            <td>{{ b.bs_guest || '—' }}</td>
            <td>{{ b.bs_source || '—' }}</td>
            <td class="r">{{ b.bs_folio_count }}</td>
            <td class="r">{{ amt(b.bs_total) }}</td>
            <td class="r">{{ amt(b.si_total) }}</td>
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
            <th class="r">PMS Amount</th><th class="r">ERP Amount</th><th class="r">Diff</th>
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
            <td class="r">{{ amt(f.bs_grand_total) }}</td>
            <td class="r">{{ amt(f.si_grand_total) }}</td>
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
                            <table class="table rc-sub-tbl" style="margin-bottom: 12px;">
                                <thead><tr><th>Component</th><th class="r">PMS</th><th class="r">ERP</th><th class="r">Diff</th><th>Result</th></tr></thead>
                                <tbody>
                                <tr :class="!f.revenue.pretax_match ? 'rc-row-err' : ''">
                                    <td>Pre-tax Revenue</td>
                                    <td class="r">{{ amt(f.revenue.bs_pretax) }}</td>
                                    <td class="r">{{ amt(f.revenue.si_pretax) }}</td>
                                    <td class="r" :class="(f.revenue.bs_pretax-f.revenue.si_pretax)?'rc-diff':''">{{ diff(f.revenue.bs_pretax - f.revenue.si_pretax) }}</td>
                                    <td v-html="badge(f.revenue.pretax_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                <tr :class="!f.revenue.tax_match ? 'rc-row-err' : ''">
                                    <td>Tax</td>
                                    <td class="r">{{ amt(f.revenue.bs_tax) }}</td>
                                    <td class="r">{{ amt(f.revenue.si_tax) }}</td>
                                    <td class="r" :class="(f.revenue.bs_tax-f.revenue.si_tax)?'rc-diff':''">{{ diff(f.revenue.bs_tax - f.revenue.si_tax) }}</td>
                                    <td v-html="badge(f.revenue.tax_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                <tr class="rc-row-total">
                                    <td><strong>Total</strong></td>
                                    <td class="r"><strong>{{ amt(f.revenue.bs_total) }}</strong></td>
                                    <td class="r"><strong>{{ amt(f.revenue.si_total) }}</strong></td>
                                    <td class="r" :class="(f.revenue.bs_total-f.revenue.si_total)?'rc-diff':''">{{ diff(f.revenue.bs_total - f.revenue.si_total) }}</td>
                                    <td v-html="badge(f.revenue.total_match ? 'matched' : 'mismatch')"></td>
                                </tr>
                                </tbody>
                            </table>
                            
                            <div style="display: flex; gap: 12px; font-size: 11px;">
                                <div style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                                    <strong style="color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; display: block;">PMS Breakdown</strong>
                                    <div v-for="b in f.revenue.bs_breakdown" :key="b.category" style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                        <span>{{ b.category }}</span><span class="r">{{ amt(b.amount) }}</span>
                                    </div>
                                    <div v-if="!f.revenue.bs_breakdown?.length" style="color:var(--text-muted)">No data</div>
                                </div>
                                <div style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                                    <strong style="color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; display: block;">ERP Sub-Accounts</strong>
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
                            <thead><tr><th>Mode</th><th class="r">PMS</th><th class="r">ERP</th><th class="r">Diff</th><th>Result</th></tr></thead>
                            <tbody>
                            <tr v-for="m in f.payment.modes" :key="m.mode"
                                :class="!m.match ? 'rc-row-err' : ''">
                                <td>{{ m.mode }}</td>
                                <td class="r">{{ amt(m.bs_amount) }}</td>
                                <td class="r">{{ amt(m.si_amount) }}</td>
                                <td class="r" :class="m.difference?'rc-diff':''">{{ diff(m.difference) }}</td>
                                <td v-html="badge(m.match ? 'matched' : 'mismatch')"></td>
                            </tr>
                            <tr class="rc-row-total">
                                <td><strong>Total Paid</strong></td>
                                <td class="r"><strong>{{ amt(f.payment.bs_total_paid) }}</strong></td>
                                <td class="r"><strong>{{ amt(f.payment.si_total_paid) }}</strong></td>
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
</div>
        `,
    }).mount("#recon-app");
}