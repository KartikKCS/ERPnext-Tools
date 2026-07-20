frappe.pages['purchase-reconciliation-dashboard'] = frappe.pages['purchase-reconciliation-dashboard'] || {};
frappe.pages['purchase-reconciliation-dashboard'].on_page_load = function (wrapper) {
    frappe.require(
        ["https://unpkg.com/vue@3/dist/vue.global.js"],
        () => init_page(wrapper)
    );
};

function init_page(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Purchase Reconciliation Dashboard",
        single_column: true
    });


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

    setTimeout(() => clearInterval(breakContainer), 5000);

    page.body.append(`<div id="recon-app"></div>`);
    mount_vue_app(page);
}

/* ── Helpers ── */

function badge(recon_status, doc_status) {
    // Determine badge class and text based on reconciliation and linkage status
    let label = recon_status;
    let cls = "badge--muted";

    if (doc_status === 'MISSING_SQ' || doc_status === 'PENDING_INVOICE' || doc_status === 'MISSING_SQ_PENDING_INVOICE') {
        label = "Missing Docs";
        cls = "badge--warn";
    } else if (recon_status === 'MATCHED') {
        label = "✓ Matched";
        cls = "badge--ok";
    } else if (recon_status === 'OVERCHARGED' || recon_status === 'PRICE_VARIANCE' || recon_status === 'QTY_VARIANCE') {
        label = "✗ Mismatch";
        cls = "badge--err";
    } else if (recon_status === 'FAVORABLE_VARIANCE') {
        label = "Favorable";
        cls = "badge--ok"; // Savings are good
    } else if (recon_status === 'VARIANCE_FLAGGED') {
        label = "✗ Mismatch";
        cls = "badge--err";
    }

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

function statusIcon(type, isOk) {
    const iconMap = {
        amount: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path></svg>`, // 💰
        quantity: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`, // 📦
        tax: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>` // ⚖️
    };
    if (!iconMap[type]) return '';
    const color = isOk ? 'var(--green-500, #10b981)' : 'var(--red-500, #ef4444)';
    const titleText = type.charAt(0).toUpperCase() + type.slice(1);
    const resultText = isOk ? 'OK' : 'Error';
    return `<span class="rc-icon" style="color: ${color}; display: inline-flex; vertical-align: middle; margin: 0 2px;" title="${titleText}: ${resultText}">${iconMap[type]}</span>`;
}


/* ── Mock Data Generator ── */
/* ──────────────────────────────────────────────────────────────────────────────
 * HOW TO REMOVE MOCK DATA:
 *   1. In the Vue data() function below, change  useMockData: true  →  useMockData: false
 *      (or delete the line entirely)
 *   2. Optionally delete this entire _generateMockData() function
 *   That's it — the dashboard will then use the real API.
 * ────────────────────────────────────────────────────────────────────────────── */

function _generateMockData() {
    const suppliers = [
        { name: "SUP-0001", label: "Metro Wholesale Supplies" },
        { name: "SUP-0002", label: "GreenLeaf Organics Pvt Ltd" },
        { name: "SUP-0003", label: "TechVision Components" },
        { name: "SUP-0004", label: "Pinnacle Industrial Co." },
        { name: "SUP-0005", label: "Sunrise Packaging Ltd" },
        { name: "SUP-0006", label: "Coastal Seafoods Inc" },
        { name: "SUP-0007", label: "Bharat Steel Works" },
        { name: "SUP-0008", label: "Excel Chemicals Corp" },
    ];

    const items = [
        { code: "ITEM-001", name: "Premium Raw Material A", baseRate: 450, baseQty: 100 },
        { code: "ITEM-002", name: "Industrial Component B", baseRate: 1200, baseQty: 50 },
        { code: "ITEM-003", name: "Organic Extract C", baseRate: 780, baseQty: 75 },
        { code: "ITEM-004", name: "Packaging Film D", baseRate: 95, baseQty: 500 },
        { code: "ITEM-005", name: "Steel Rod E (8mm)", baseRate: 2200, baseQty: 25 },
        { code: "ITEM-006", name: "Chemical Reagent F", baseRate: 3500, baseQty: 10 },
    ];

    const transactions = [];
    const today = new Date();
    const numTransactions = 42;

    for (let i = 0; i < numTransactions; i++) {
        const supplier = suppliers[i % suppliers.length];
        const daysAgo = Math.floor(Math.random() * 360);
        const txnDate = new Date(today);
        txnDate.setDate(txnDate.getDate() - daysAgo);
        const dateStr = txnDate.toISOString().split('T')[0];

        // Pick 1-3 items for this PO
        const numItems = 1 + Math.floor(Math.random() * 3);
        const selectedItems = [];
        const usedIndices = new Set();
        for (let j = 0; j < numItems; j++) {
            let idx;
            do { idx = Math.floor(Math.random() * items.length); } while (usedIndices.has(idx));
            usedIndices.add(idx);
            selectedItems.push(items[idx]);
        }

        // Generate PO items
        const poItems = selectedItems.map(it => {
            const rawQty = it.baseQty * (0.8 + Math.random() * 0.4);
            const rawRate = it.baseRate * (0.95 + Math.random() * 0.1);
            const qty = Math.round(rawQty);
            const rate = Math.round(rawRate * 100) / 100;
            return {
                item_code: it.code,
                item_name: it.name,
                qty: qty,
                rate: rate,
                amount: Math.round(qty * rate * 100) / 100,
                net_amount: Math.round(qty * rate * 100) / 100,
                uom: "Nos",
            };
        });

        const poNetTotal = poItems.reduce((s, it) => s + it.amount, 0);
        const poTax = Math.round(poNetTotal * 0.18 * 100) / 100;
        const poGrandTotal = Math.round((poNetTotal + poTax) * 100) / 100;

        // Decide reconciliation outcome
        const roll = Math.random();
        let reconStatus, hasPriceVar = false, hasQtyVar = false, isFavorable = false;
        if (roll < 0.45) {
            reconStatus = 'MATCHED';
        } else if (roll < 0.60) {
            reconStatus = 'OVERCHARGED';
        } else if (roll < 0.75) {
            reconStatus = 'PRICE_VARIANCE';
            hasPriceVar = true;
        } else if (roll < 0.87) {
            reconStatus = 'QTY_VARIANCE';
            hasQtyVar = true;
        } else if (roll < 0.93) {
            reconStatus = 'FAVORABLE_VARIANCE';
            isFavorable = true;
        } else {
            reconStatus = 'VARIANCE_FLAGGED';
        }

        const linkageStatus = (roll > 0.92 && Math.random() > 0.5) ? 'PENDING_INVOICE' :
            (roll > 0.95) ? 'MISSING_SQ' : 'FULLY_LINKED';

        // Generate PI items (with variance if applicable)
        const piItems = poItems.map(poIt => {
            let piRate = poIt.rate;
            let piQty = poIt.qty;

            if (hasPriceVar && Math.random() > 0.4) {
                piRate = poIt.rate * (1 + (0.03 + Math.random() * 0.12));
            }
            if (hasQtyVar && Math.random() > 0.4) {
                piQty = poIt.qty + Math.floor(Math.random() * 10) - 3;
            }
            if (reconStatus === 'OVERCHARGED') {
                piRate = poIt.rate * (1.05 + Math.random() * 0.15);
            }
            if (isFavorable) {
                piRate = poIt.rate * (0.85 + Math.random() * 0.1);
            }

            piRate = Math.round(piRate * 100) / 100;
            piQty = Math.max(1, piQty);

            return {
                item_code: poIt.item_code,
                item_name: poIt.item_name,
                qty: piQty,
                rate: piRate,
                amount: Math.round(piQty * piRate * 100) / 100,
                net_amount: Math.round(piQty * piRate * 100) / 100,
                uom: "Nos",
            };
        });

        const piNetTotal = piItems.reduce((s, it) => s + it.amount, 0);
        const piTax = Math.round(piNetTotal * 0.18 * 100) / 100;
        const piGrandTotal = Math.round((piNetTotal + piTax) * 100) / 100;

        const hasPI = linkageStatus !== 'PENDING_INVOICE';
        const hasSQ = linkageStatus !== 'MISSING_SQ' && linkageStatus !== 'MISSING_SQ_PENDING_INVOICE';

        // Build exceptions
        const exceptions = [];
        const itemDiscrepancies = { pi_vs_po: [], pi_vs_sq: [] };

        if (reconStatus !== 'MATCHED' && reconStatus !== 'NOT_RECONCILABLE' && hasPI) {
            if (reconStatus === 'OVERCHARGED' || reconStatus === 'VARIANCE_FLAGGED') {
                exceptions.push({
                    exception_type: reconStatus,
                    severity: reconStatus === 'OVERCHARGED' ? 'CRITICAL' : 'MEDIUM',
                    po_number: `PUR-ORD-2026-${String(i + 1).padStart(5, '0')}`,
                    supplier: supplier.label,
                    reference_total: poGrandTotal,
                    invoice_total: piGrandTotal,
                    variance_amount: Math.round((piGrandTotal - poGrandTotal) * 100) / 100,
                    variance_pct: Math.round(((piGrandTotal - poGrandTotal) / poGrandTotal) * 10000) / 100,
                    description: `Invoice total exceeds PO total`,
                });
            }
            if (reconStatus === 'FAVORABLE_VARIANCE') {
                exceptions.push({
                    exception_type: 'FAVORABLE_VARIANCE',
                    severity: 'LOW',
                    po_number: `PUR-ORD-2026-${String(i + 1).padStart(5, '0')}`,
                    supplier: supplier.label,
                    reference_total: poGrandTotal,
                    invoice_total: piGrandTotal,
                    variance_amount: Math.round((piGrandTotal - poGrandTotal) * 100) / 100,
                    description: `Favorable variance — invoice below PO`,
                });
            }
            if (hasPriceVar) {
                poItems.forEach((poIt, idx) => {
                    const piIt = piItems[idx];
                    if (piIt && piIt.rate !== poIt.rate) {
                        exceptions.push({
                            exception_type: 'PRICE_VARIANCE',
                            severity: 'HIGH',
                            po_number: `PUR-ORD-2026-${String(i + 1).padStart(5, '0')}`,
                            supplier: supplier.label,
                            item_code: poIt.item_code,
                            item_name: poIt.item_name,
                            rate_diff: Math.round((piIt.rate - poIt.rate) * 100) / 100,
                            description: `Rate variance on ${poIt.item_code}`,
                        });
                        itemDiscrepancies.pi_vs_po.push({
                            item_code: poIt.item_code, item_name: poIt.item_name,
                            po_rate: poIt.rate, pi_rate: piIt.rate,
                            rate_diff: Math.round((piIt.rate - poIt.rate) * 100) / 100,
                            po_qty: poIt.qty, pi_qty: piIt.qty, qty_diff: piIt.qty - poIt.qty,
                            po_amount: poIt.amount, pi_amount: piIt.amount,
                            amount_diff: Math.round((piIt.amount - poIt.amount) * 100) / 100,
                            variance_type: 'RATE',
                        });
                    }
                });
            }
            if (hasQtyVar) {
                poItems.forEach((poIt, idx) => {
                    const piIt = piItems[idx];
                    if (piIt && piIt.qty !== poIt.qty) {
                        exceptions.push({
                            exception_type: 'QTY_VARIANCE',
                            severity: 'MEDIUM',
                            po_number: `PUR-ORD-2026-${String(i + 1).padStart(5, '0')}`,
                            supplier: supplier.label,
                            item_code: poIt.item_code,
                            item_name: poIt.item_name,
                            qty_diff: piIt.qty - poIt.qty,
                            description: `Quantity variance on ${poIt.item_code}`,
                        });
                        itemDiscrepancies.pi_vs_po.push({
                            item_code: poIt.item_code, item_name: poIt.item_name,
                            po_rate: poIt.rate, pi_rate: piIt.rate, rate_diff: 0,
                            po_qty: poIt.qty, pi_qty: piIt.qty, qty_diff: piIt.qty - poIt.qty,
                            po_amount: poIt.amount, pi_amount: piIt.amount,
                            amount_diff: Math.round((piIt.amount - poIt.amount) * 100) / 100,
                            variance_type: 'QTY',
                        });
                    }
                });
            }
        }

        let paymentStatus = "Unpaid";
        let paidAmount = 0;
        let outstandingAmount = hasPI ? piGrandTotal : 0;

        if (hasPI) {
            const payRoll = Math.random();
            if (payRoll > 0.6) {
                paymentStatus = "Paid";
                paidAmount = piGrandTotal;
                outstandingAmount = 0;
            } else if (payRoll > 0.3) {
                paymentStatus = "Partially Paid";
                paidAmount = Math.round(piGrandTotal * (0.2 + Math.random() * 0.6) * 100) / 100;
                outstandingAmount = Math.round((piGrandTotal - paidAmount) * 100) / 100;
            }
        }

        const sqGrandTotal = hasSQ ? Math.round(poGrandTotal * (0.97 + Math.random() * 0.06) * 100) / 100 : null;

        transactions.push({
            po_number: `PUR-ORD-2026-${String(i + 1).padStart(5, '0')}`,
            supplier: supplier.name,
            supplier_name: supplier.label,
            transaction_date: dateStr,
            currency: "INR",
            status: linkageStatus,
            po_is_draft: false,
            po_doc_status: "Submitted",
            po_data: {
                grand_total: poGrandTotal, net_total: poNetTotal, tax_total: poTax,
                per_billed: hasPI ? 100 : 0, per_received: hasPI ? 100 : 0,
                po_status: hasPI ? "Completed" : "To Bill", items: poItems,
            },
            quotation_data: hasSQ ? {
                sq_number: `SUP-QTN-2026-${String(i + 1).padStart(5, '0')}`,
                supplier: supplier.name, supplier_name: supplier.label,
                grand_total: sqGrandTotal,
                net_total: sqGrandTotal ? Math.round(sqGrandTotal / 1.18 * 100) / 100 : null,
                tax_total: sqGrandTotal ? Math.round((sqGrandTotal - sqGrandTotal / 1.18) * 100) / 100 : null,
                items: poItems,
            } : null,
            invoice_data: hasPI ? {
                invoices: [{
                    pi_number: `PUR-INV-2026-${String(i + 1).padStart(5, '0')}`,
                    supplier: supplier.name, supplier_name: supplier.label,
                    grand_total: piGrandTotal, net_total: piNetTotal, tax_total: piTax,
                    status: paymentStatus,
                    outstanding_amount: outstandingAmount,
                    paid_amount: paidAmount,
                    posting_date: dateStr, items: piItems,
                }],
                combined_grand_total: piGrandTotal,
                combined_paid_amount: paidAmount,
                combined_outstanding_amount: outstandingAmount,
                payment_status: paymentStatus
            } : null,
            variance: {
                sq_to_po: hasSQ ? Math.round((poGrandTotal - sqGrandTotal) * 100) / 100 : null,
                po_to_pi: hasPI ? Math.round((piGrandTotal - poGrandTotal) * 100) / 100 : null,
                sq_to_pi: (hasSQ && hasPI) ? Math.round((piGrandTotal - sqGrandTotal) * 100) / 100 : null,
            },
            reconciliation: {
                recon_status: hasPI ? reconStatus : 'NOT_RECONCILABLE',
                severity: reconStatus === 'OVERCHARGED' ? 'CRITICAL' :
                    reconStatus === 'PRICE_VARIANCE' ? 'HIGH' :
                        reconStatus === 'QTY_VARIANCE' ? 'MEDIUM' : 'INFO',
                grand_total_comparison: {
                    po_grand_total: poGrandTotal,
                    sq_grand_total: sqGrandTotal,
                    pi_grand_total: hasPI ? piGrandTotal : null,
                    pi_vs_po: hasPI ? Math.round((piGrandTotal - poGrandTotal) * 100) / 100 : null,
                    pi_vs_sq: (hasSQ && hasPI) ? Math.round((piGrandTotal - sqGrandTotal) * 100) / 100 : null,
                    po_vs_sq: hasSQ ? Math.round((poGrandTotal - sqGrandTotal) * 100) / 100 : null,
                },
                item_discrepancies: itemDiscrepancies,
                exceptions: exceptions,
                is_flagged: exceptions.length > 0,
            },
        });
    }

    // Sort by date
    transactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    // Build summary
    const totalPOs = transactions.length;
    const reconCounts = {};
    const statusCounts = {};
    let totalPOValue = 0, totalPIValue = 0;

    transactions.forEach(t => {
        const rs = t.reconciliation.recon_status;
        reconCounts[rs] = (reconCounts[rs] || 0) + 1;
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        totalPOValue += t.po_data.grand_total;
        if (t.invoice_data) totalPIValue += t.invoice_data.combined_grand_total;
    });

    const matched = reconCounts['MATCHED'] || 0;
    const notRecon = reconCounts['NOT_RECONCILABLE'] || 0;
    const reconcilable = totalPOs - notRecon;
    const matchPct = reconcilable > 0 ? Math.round((matched / reconcilable) * 1000) / 10 : 0;

    const supplier_scorecards = {};
    suppliers.forEach(s => {
        const total_shipments = 10 + Math.floor(Math.random() * 50);
        const on_time_shipment_num = Math.floor(total_shipments * (0.6 + Math.random() * 0.4));
        const total_working_days = 250;
        const tot_days_late = Math.floor((total_shipments - on_time_shipment_num) * (1 + Math.random() * 5));

        const total_received_items = 1000 + Math.floor(Math.random() * 5000);
        const total_accepted_items = Math.floor(total_received_items * (0.85 + Math.random() * 0.15));
        const total_rejected_items = total_received_items - total_accepted_items;

        const total_ordered = total_received_items + Math.floor(Math.random() * 500);

        const rfq_response_days = Math.floor(Math.random() * 20);

        const tot_cost_shipments = 100000 + Math.floor(Math.random() * 500000);
        const cost_of_on_time_shipments = Math.floor(tot_cost_shipments * (on_time_shipment_num / total_shipments) * (0.9 + Math.random() * 0.2));

        supplier_scorecards[s.name] = {
            total_ordered, total_shipments, tot_days_late, tot_cost_shipments, total_working_days, cost_of_on_time_shipments,
            cost_of_delayed_shipments: tot_cost_shipments - cost_of_on_time_shipments,
            on_time_shipment_num, total_item_days: total_working_days,
            rfq_total_items: total_ordered, rfq_total_number: total_shipments, sq_total_number: total_shipments, sq_total_items: total_ordered,
            rfq_response_days,
            total_received_amount: tot_cost_shipments, total_received_items, total_rejected_amount: (tot_cost_shipments * (total_rejected_items / total_received_items)),
            total_rejected_items, total_accepted_amount: (tot_cost_shipments * (total_accepted_items / total_received_items)),
            total_accepted_items
        };
    });

    return {
        summary: {
            total_purchase_orders: totalPOs,
            draft_po_count: 0, submitted_po_count: totalPOs,
            match_percent: matchPct,
            status_counts: statusCounts,
            totals: { po_value: Math.round(totalPOValue * 100) / 100, pi_value: Math.round(totalPIValue * 100) / 100, sq_value: 0 },
            aggregate_variance: { sq_to_po: 0, po_to_pi: 0, sq_to_pi: 0 },
            reconciliation: {
                recon_match_percent: matchPct,
                recon_counts: reconCounts,
                severity_counts: {},
                total_flagged: transactions.filter(t => t.reconciliation.is_flagged).length,
                total_exceptions: transactions.reduce((s, t) => s + t.reconciliation.exceptions.length, 0),
                total_variance_amount: 0, total_overcharge_amount: 0, total_favorable_amount: 0,
                supplier_scorecards: supplier_scorecards,
            },
            compliance: {
                score: 5,
                max_score: 10,
                suggestions: [
                    "Making Purchase Receipt mandatory for Invoices will increase your score by 3.",
                    "Setting the action to 'Stop' when the same rate is not maintained will increase your score by 2."
                ]
            },
            operational_efficiency: {
                "Purchase Order": { counts: { Draft: 12, Submitted: 42, Cancelled: 3 }, total: 57, cancellation_rate: 5.3, bottleneck_warning: false },
                "Purchase Receipt": { counts: { Draft: 5, Submitted: 38, Cancelled: 8 }, total: 51, cancellation_rate: 15.7, bottleneck_warning: true },
                "Purchase Invoice": { counts: { Draft: 8, Submitted: 35, Cancelled: 2 }, total: 45, cancellation_rate: 4.4, bottleneck_warning: false }
            }
        },
        transactions: transactions,
    };
}


/* ── Vue App ── */

function mount_vue_app(page) {
    const { createApp } = Vue;

    const app = createApp({
        data() {
            const today = frappe.datetime.get_today();
            const fromDate = frappe.datetime.add_days(today, -30); // default last 30 days
            return {
                sidebarOpen: true,
                result: null,
                loading: false,

                // Filters
                selectedFrom: fromDate,
                selectedTo: today,
                tolerance: 1.0,
                search: "",
                statusFilter: "all",
                issueFilter: "all",
                paymentFilter: "all",

                expanded: null,
                txnPage: 1,
                itemPage: 1,
                supplierPage: 1,
                perPage: 20,

                from_ctl: null,
                to_ctl: null,
                tol_ctl: null,
                company_ctl: null,
                selectedCompany: "",
                viewLevel: "po",

                // ── Chart state ──
                _trendChart: null,
                _supplierChart: null,
                _varianceChart: null,
                _itemChart: null,
                _supplierScoreChart: null,
                chartFilterSupplier: null,
                chartFilterExceptionType: null,
                chartFilterItem: null,
                itemIssueFilter: "all",
                supplierScoreFilter: "all",

                // ── Settings ──
                ratingWeights: {
                    delivery: 0.25,
                    delay: 0.10,
                    quality: 0.25,
                    rejection: 0.10,
                    rfq: 0.10,
                    cost: 0.10,
                    fulfillment: 0.10
                },

                // ── Mock data toggle ──
                // Set to true to use generated mock data for testing charts.
                // To remove: set this to false or delete this line + the _generateMockData function above.
                useMockData: false,

                complianceDrawerOpen: false,
            };
        },

        computed: {
            s() { return this.result?.summary || null; },
            txns() { return this.result?.transactions || []; },

            kpis() {
                if (!this.s) return null;
                const rec = this.s.reconciliation;
                const docs = this.s.status_counts;
                const txns = this.txns;

                const missingCount = (docs.MISSING_SQ || 0) + (docs.PENDING_INVOICE || 0) +
                    (docs.MISSING_SQ_PENDING_INVOICE || 0) + (docs.MISSING_SQ_PARTIAL_INVOICE || 0);

                // Count amount issues the same way the 'amount' issueFilter works:
                // transactions that have ANY exception of type OVERCHARGED, PRICE_VARIANCE, or VARIANCE_FLAGGED
                const amountIssues = txns.filter(r => {
                    const excs = r.reconciliation?.exceptions || [];
                    return excs.some(e => ['OVERCHARGED', 'PRICE_VARIANCE', 'VARIANCE_FLAGGED'].includes(e.exception_type));
                }).length;

                // Count qty issues the same way the 'quantity' issueFilter works
                const qtyIssues = txns.filter(r => {
                    const excs = r.reconciliation?.exceptions || [];
                    return excs.some(e => e.exception_type === 'QTY_VARIANCE');
                }).length;

                return {
                    vol: `${this.s.total_purchase_orders}`,
                    matchRate: `${rec.recon_match_percent || 0}%`,
                    amountIssues: amountIssues,
                    qtyIssues: qtyIssues,
                    missingDocs: missingCount
                };
            },

            itemKpis() {
                const rows = this.itemLevelRows;
                const totalItems = rows.length;
                const mismatchItems = rows.filter(r => r.hasMismatch).length;
                const matchPct = totalItems > 0 ? Math.round(((totalItems - mismatchItems) / totalItems) * 100) : 0;

                let poValue = 0, piValue = 0;
                rows.forEach(r => {
                    poValue += (r.po_amount || 0);
                    piValue += (r.pi_amount || 0);
                });

                return {
                    totalItems: totalItems,
                    matchPct: `${matchPct}%`,
                    mismatchItems: mismatchItems,
                    poValue: poValue,
                    piValue: piValue,
                    variance: piValue - poValue
                };
            },

            supplierScorecardsCalculated() {
                if (!this.s || !this.s.reconciliation || !this.s.reconciliation.supplier_scorecards) return {};
                const sc = this.s.reconciliation.supplier_scorecards;
                const weights = this.ratingWeights;
                const results = {};

                const clamp = (val) => Math.max(0, Math.min(100, val));

                Object.keys(sc).forEach(sup => {
                    const data = sc[sup];

                    const deliveryScore = data.scores ? data.scores.delivery : 0;
                    const delayScore = data.scores ? data.scores.delay : 0;
                    const qualityScore = data.scores ? data.scores.quality : 0;
                    const rejectionScore = data.scores ? data.scores.rejection : 0;
                    const rfqScore = data.scores ? data.scores.rfq : 0;
                    const costScore = data.scores ? data.scores.cost : 0;
                    const fulfillmentScore = data.scores ? data.scores.fulfillment : 0;

                    const clampedScore = data.rating || 0;

                    let band = "Poor", stars = "★☆☆☆☆";
                    if (clampedScore >= 95) { band = "Excellent"; stars = "★★★★★"; }
                    else if (clampedScore >= 85) { band = "Very Good"; stars = "★★★★☆"; }
                    else if (clampedScore >= 70) { band = "Good"; stars = "★★★☆☆"; }
                    else if (clampedScore >= 55) { band = "Average"; stars = "★★☆☆☆"; }

                    let reason = "";
                    if (clampedScore < 70) {
                        if (deliveryScore < 60) reason += "Frequent late deliveries. ";
                        if (qualityScore < 70) reason += "High rejection rate. ";
                        if (rfqScore < 60) reason += "Slow RFQ responses. ";
                        if (fulfillmentScore < 80) reason += "Incomplete fulfillments. ";
                        if (!reason) reason = "Overall poor performance across metrics.";
                    } else if (clampedScore < 85) {
                        reason = "Room for improvement in consistency.";
                    } else {
                        reason = "Reliable performance.";
                    }

                    results[sup] = {
                        scores: {
                            delivery: Math.round(deliveryScore * 10) / 10,
                            delay: Math.round(delayScore * 10) / 10,
                            quality: Math.round(qualityScore * 10) / 10,
                            rejection: Math.round(rejectionScore * 10) / 10,
                            rfq: Math.round(rfqScore * 10) / 10,
                            cost: Math.round(costScore * 10) / 10,
                            fulfillment: Math.round(fulfillmentScore * 10) / 10
                        },
                        rating: clampedScore,
                        band: band,
                        stars: stars,
                        reason: reason
                    };
                });
                return results;
            },

            supplierLevelRows() {
                // Group the filtered transactions by supplier
                const map = {};
                this.filteredRows.forEach(t => {
                    const s = t.supplier;
                    if (!map[s]) {
                        map[s] = {
                            supplier: s,
                            supplier_name: t.supplier_name,
                            total_pos: 0,
                            po_amount: 0,
                            pi_amount: 0,
                            exceptions: 0,
                            missing_docs: 0
                        };
                    }
                    map[s].total_pos += 1;
                    map[s].po_amount += t.po_data.grand_total;
                    if (t.invoice_data) {
                        map[s].pi_amount += t.invoice_data.combined_grand_total;
                    }
                    if (t.status === 'MISSING_SQ' || t.status === 'PENDING_INVOICE' || t.status === 'MISSING_SQ_PENDING_INVOICE') {
                        map[s].missing_docs += 1;
                    }
                    if (t.reconciliation && t.reconciliation.exceptions) {
                        map[s].exceptions += t.reconciliation.exceptions.length;
                    }
                });

                return Object.values(map).map(row => {
                    const ratingData = this.supplierScorecardsCalculated[row.supplier];
                    row.rating = ratingData ? ratingData.rating : 0;
                    row.band = ratingData ? ratingData.band : "N/A";
                    row.stars = ratingData ? ratingData.stars : "";
                    row.reason = ratingData ? ratingData.reason : "";
                    row.scores = ratingData ? ratingData.scores : {};
                    row.variance = row.pi_amount - row.po_amount;
                    return row;
                }).sort((a, b) => b.rating - a.rating);
            },

            supplierKpis() {
                const rows = this.supplierLevelRows;
                if (!rows.length) return null;
                const totalSuppliers = rows.length;
                const avgRating = Math.round(rows.reduce((sum, r) => sum + r.rating, 0) / totalSuppliers * 10) / 10;
                const topSupplier = rows[0];
                const poorSuppliers = rows.filter(r => r.rating < 70).length;
                return {
                    totalSuppliers,
                    avgRating,
                    topSupplierName: topSupplier.supplier_name,
                    topSupplierRating: topSupplier.rating,
                    poorSuppliers
                };
            },

            complianceScore() {
                return this.s?.compliance?.score || 0;
            },

            complianceSuggestions() {
                return this.s?.compliance?.suggestions || [];
            },

            operationalEfficiency() {
                return this.s?.operational_efficiency || null;
            },

            // ── Chart Data Computeds ──

            trendData() {
                if (!this.txns.length) return null;
                const monthMap = {};
                this.txns.forEach(t => {
                    if (!t.transaction_date) return;
                    const monthKey = t.transaction_date.substring(0, 7);
                    if (!monthMap[monthKey]) monthMap[monthKey] = { poTotal: 0, piTotal: 0 };
                    monthMap[monthKey].poTotal += t.po_data?.grand_total || 0;
                    if (t.invoice_data) monthMap[monthKey].piTotal += t.invoice_data.combined_grand_total || 0;
                });

                const sortedMonths = Object.keys(monthMap).sort();
                const months = sortedMonths.slice(-12);
                const labels = months.map(m => {
                    const [y, mo] = m.split('-');
                    const dt = new Date(parseInt(y), parseInt(mo) - 1);
                    return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                });

                return {
                    labels,
                    poValues: months.map(m => Math.round(monthMap[m].poTotal)),
                    piValues: months.map(m => Math.round(monthMap[m].piTotal)),
                    rawMonths: months,
                    monthMap,
                };
            },

            topSupplierData() {
                if (!this.txns.length) return null;
                const supplierMap = {};
                this.txns.forEach(t => {
                    const name = t.supplier_name || t.supplier || 'Unknown';
                    if (!supplierMap[name]) supplierMap[name] = { poTotal: 0, piTotal: 0 };
                    supplierMap[name].poTotal += t.po_data?.grand_total || 0;
                    if (t.invoice_data) supplierMap[name].piTotal += t.invoice_data.combined_grand_total || 0;
                });

                const sorted = Object.entries(supplierMap)
                    .map(([name, data]) => ({
                        name,
                        poTotal: Math.round(data.poTotal),
                        piTotal: Math.round(data.piTotal),
                        variance: Math.round(data.piTotal - data.poTotal),
                    }))
                    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
                    .slice(0, 5);

                return {
                    labels: sorted.map(s => s.name.length > 22 ? s.name.substring(0, 20) + '…' : s.name),
                    fullNames: sorted.map(s => s.name),
                    poValues: sorted.map(s => s.poTotal),
                    piValues: sorted.map(s => s.piTotal),
                    variances: sorted.map(s => s.variance),
                };
            },

            topSupplierScoreData() {
                if (!this.supplierLevelRows.length) return null;

                const sorted = this.supplierLevelRows.slice(0, 10);
                return {
                    labels: sorted.map(s => s.supplier_name.length > 22 ? s.supplier_name.substring(0, 20) + '…' : s.supplier_name),
                    fullNames: sorted.map(s => s.supplier_name),
                    scores: sorted.map(s => s.rating),
                    variances: sorted.map(s => s.variance)
                };
            },

            topItemData() {
                if (!this.itemLevelRows.length) return null;
                const itemMap = {};
                this.itemLevelRows.forEach(r => {
                    const name = r.item_name || r.item_code || 'Unknown';
                    if (!itemMap[name]) itemMap[name] = { poTotal: 0, piTotal: 0 };
                    itemMap[name].poTotal += r.po_amount || 0;
                    itemMap[name].piTotal += r.pi_amount || 0;
                });

                const sorted = Object.entries(itemMap)
                    .map(([name, data]) => ({
                        name,
                        poTotal: Math.round(data.poTotal),
                        piTotal: Math.round(data.piTotal),
                        variance: Math.round(data.piTotal - data.poTotal),
                    }))
                    .filter(s => s.variance !== 0)
                    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
                    .slice(0, 10);

                return {
                    labels: sorted.map(s => s.name.length > 22 ? s.name.substring(0, 20) + '…' : s.name),
                    fullNames: sorted.map(s => s.name),
                    poValues: sorted.map(s => s.poTotal),
                    piValues: sorted.map(s => s.piTotal),
                    variances: sorted.map(s => s.variance),
                };
            },

            varianceBreakdown() {
                if (!this.txns.length) return null;
                const typeMap = {
                    'QTY_VARIANCE': 'Quantity Variance',
                    'PRICE_VARIANCE': 'Price Variance',
                    'OVERCHARGED': 'Overcharged',
                    'FAVORABLE_VARIANCE': 'Favorable Variance',
                    'VARIANCE_FLAGGED': 'Other Variance',
                };

                const counts = {};
                this.txns.forEach(t => {
                    const excs = t.reconciliation?.exceptions || [];
                    excs.forEach(e => {
                        const label = typeMap[e.exception_type] || 'Other';
                        counts[label] = (counts[label] || 0) + 1;
                    });
                });

                if (Object.keys(counts).length === 0) return null;
                const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                return {
                    labels: entries.map(e => e[0]),
                    values: entries.map(e => e[1]),
                };
            },

            activeChartFilter() {
                if (this.chartFilterSupplier) return { type: 'Supplier', value: this.chartFilterSupplier, count: this.filteredRows.length };
                if (this.chartFilterExceptionType) return { type: 'Exception', value: this.chartFilterExceptionType, count: this.filteredRows.length };
                if (this.chartFilterItem) return { type: 'Item', value: this.chartFilterItem, count: this.filteredItemRows.length };
                if (this.itemIssueFilter && this.itemIssueFilter !== 'all') {
                    return { type: 'Item Issue', value: this.itemIssueFilter === 'mismatched' ? 'Mismatched Items' : 'Matched Items', count: this.filteredItemRows.length };
                }
                return null;
            },

            filteredRows() {
                let items = this.txns.slice();

                if (this.search) {
                    const q = this.search.toLowerCase();
                    items = items.filter(r =>
                        (r.supplier_name && r.supplier_name.toLowerCase().includes(q)) ||
                        (r.po_number && r.po_number.toLowerCase().includes(q)) ||
                        (r.quotation_data?.sq_number && r.quotation_data.sq_number.toLowerCase().includes(q)) ||
                        (r.invoice_data?.invoices?.some(inv => inv.pi_number.toLowerCase().includes(q)))
                    );
                }

                if (this.statusFilter !== 'all') {
                    if (this.statusFilter === 'matched') {
                        items = items.filter(r => r.reconciliation?.recon_status === 'MATCHED');
                    } else if (this.statusFilter === 'issues') {
                        items = items.filter(r => r.reconciliation?.is_flagged);
                    } else if (this.statusFilter === 'missing_pi') {
                        items = items.filter(r => r.status.includes('PENDING_INVOICE') || r.status.includes('PARTIAL_INVOICE'));
                    } else if (this.statusFilter === 'missing_po') {
                        items = items.filter(r => r.status.includes('MISSING_SQ')); // Mapping to missing SQ for now
                    }
                }

                if (this.paymentFilter !== 'all') {
                    items = items.filter(r => {
                        const ps = r.invoice_data?.payment_status;
                        if (this.paymentFilter === 'paid') return ps === 'Paid';
                        if (this.paymentFilter === 'partial') return ps === 'Partially Paid';
                        if (this.paymentFilter === 'unpaid') return ps === 'Unpaid';
                        return true;
                    });
                }

                if (this.issueFilter !== 'all') {
                    items = items.filter(r => {
                        const excs = r.reconciliation?.exceptions || [];
                        if (this.issueFilter === 'amount') return excs.some(e => ['OVERCHARGED', 'PRICE_VARIANCE', 'VARIANCE_FLAGGED'].includes(e.exception_type));
                        if (this.issueFilter === 'quantity') return excs.some(e => e.exception_type === 'QTY_VARIANCE');
                        if (this.issueFilter === 'tax') return false; // Not explicitly flagged in backend yet, but placeholder
                        return true;
                    });
                }

                // ── Chart-based filters ──
                if (this.chartFilterSupplier) {
                    items = items.filter(r => (r.supplier_name || r.supplier) === this.chartFilterSupplier);
                }

                if (this.chartFilterExceptionType) {
                    const typeReverseMap = {
                        'Quantity Variance': 'QTY_VARIANCE',
                        'Price Variance': 'PRICE_VARIANCE',
                        'Overcharged': 'OVERCHARGED',
                        'Favorable Variance': 'FAVORABLE_VARIANCE',
                        'Other Variance': 'VARIANCE_FLAGGED',
                    };
                    const rawType = typeReverseMap[this.chartFilterExceptionType] || this.chartFilterExceptionType;
                    items = items.filter(r => {
                        const excs = r.reconciliation?.exceptions || [];
                        return excs.some(e => e.exception_type === rawType);
                    });
                }

                return items;
            },

            paginatedRows() {
                const start = (this.txnPage - 1) * this.perPage;
                return this.filteredRows.slice(start, start + this.perPage);
            },

            totalPages() {
                return Math.ceil(this.filteredRows.length / this.perPage);
            },

            // ── Item-level flattened rows ──
            itemLevelRows() {
                const rows = [];
                this.filteredRows.forEach(txn => {
                    const poItems = txn.po_data?.items || [];
                    // Build PI items lookup
                    const piByCode = {};
                    if (txn.invoice_data?.invoices) {
                        txn.invoice_data.invoices.forEach(inv => {
                            (inv.items || []).forEach(it => {
                                const c = it.item_code || '';
                                if (!piByCode[c]) piByCode[c] = { qty: 0, rate: it.rate, amount: 0 };
                                piByCode[c].qty += it.qty || 0;
                                piByCode[c].amount += it.amount || 0;
                            });
                        });
                    }
                    const discByCode = {};
                    (txn.reconciliation?.item_discrepancies?.pi_vs_po || []).forEach(d => {
                        discByCode[d.item_code] = d;
                    });

                    poItems.forEach(poIt => {
                        const pi = piByCode[poIt.item_code];
                        const disc = discByCode[poIt.item_code];
                        const piAmt = pi ? pi.amount : null;
                        const diffVal = (piAmt != null) ? Math.round((piAmt - poIt.amount) * 100) / 100 : null;
                        const hasMismatch = disc || (diffVal && diffVal !== 0);
                        rows.push({
                            _parent: txn,
                            supplier_name: txn.supplier_name || txn.supplier,
                            po_number: txn.po_number,
                            item_code: poIt.item_code,
                            item_name: poIt.item_name || poIt.item_code,
                            po_qty: poIt.qty,
                            po_rate: poIt.rate,
                            po_amount: poIt.amount,
                            pi_qty: pi ? pi.qty : null,
                            pi_rate: pi ? pi.rate : null,
                            pi_amount: piAmt,
                            diff: diffVal,
                            hasMismatch: hasMismatch,
                            variance_type: disc?.variance_type || null,
                            recon_status: txn.reconciliation?.recon_status,
                        });
                    });
                });
                return rows;
            },

            filteredItemRows() {
                let items = this.itemLevelRows.slice();
                if (this.itemIssueFilter === 'mismatched') {
                    items = items.filter(r => r.hasMismatch);
                } else if (this.itemIssueFilter === 'matched') {
                    items = items.filter(r => !r.hasMismatch);
                }
                if (this.chartFilterItem) {
                    items = items.filter(r => (r.item_name || r.item_code) === this.chartFilterItem);
                }
                return items;
            },

            paginatedItemRows() {
                const start = (this.itemPage - 1) * this.perPage;
                return this.filteredItemRows.slice(start, start + this.perPage);
            },

            totalItemPages() {
                return Math.ceil(this.filteredItemRows.length / this.perPage);
            },

            filteredSupplierRows() {
                let items = this.supplierLevelRows.slice();
                if (this.supplierScoreFilter === 'poor') {
                    items = items.filter(r => r.rating < 70);
                }
                if (this.search) {
                    const q = this.search.toLowerCase();
                    items = items.filter(r => r.supplier_name.toLowerCase().includes(q));
                }
                return items;
            },

            paginatedSupplierRows() {
                const start = (this.supplierPage - 1) * this.perPage;
                return this.filteredSupplierRows.slice(start, start + this.perPage);
            },

            totalSupplierPages() {
                return Math.ceil(this.filteredSupplierRows.length / this.perPage);
            }
        },

        watch: {
            perPage() {
                this.txnPage = 1;
                this.itemPage = 1;
                this.supplierPage = 1;
            },
            viewLevel() {
                this.txnPage = 1;
                this.itemPage = 1;
                this.supplierPage = 1;
                this.expanded = null;
                this.$nextTick(() => this.renderAllCharts());
            }
        },

        mounted() {
            // Setup Frappe form controls for native look
            this.company_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_company"),
                df: { label: "Company", fieldtype: "Link", options: "Company", reqd: 1, default: this.selectedCompany },
                render_input: true,
            });
            this.from_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_from"),
                df: { label: "From Date", fieldtype: "Date", default: this.selectedFrom },
                render_input: true,
            });
            this.to_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_to"),
                df: { label: "To Date", fieldtype: "Date", default: this.selectedTo },
                render_input: true,
            });
            this.tol_ctl = frappe.ui.form.make_control({
                parent: document.getElementById("rc_tol"),
                df: { label: "Tolerance (₹)", fieldtype: "Float", default: this.tolerance },
                render_input: true,
            });

            // Auto fetch on load with defaults
            this.fetchData();
        },

        methods: {
            amt, diff, isIssueDiff, badge, statusIcon, pct,

            openFilteredList(docType, statusLabel) {
                const statusMap = {
                    'Draft': 0,
                    'Submitted': 1,
                    'Cancelled': 2
                };

                frappe.route_options = {
                    "docstatus": statusMap[statusLabel]
                };

                // Apply the exact date filters from the dashboard so the list matches the count
                const dateField = (docType === 'Purchase Order') ? 'transaction_date' : 'posting_date';
                if (this.selectedFrom && this.selectedTo) {
                    frappe.route_options[dateField] = ['between', [this.selectedFrom, this.selectedTo]];
                }

                frappe.set_route("List", docType);
            },

            toggleComplianceDrawer() {
                this.complianceDrawerOpen = !this.complianceDrawerOpen;
            },

            toggleSidebar() {
                this.sidebarOpen = !this.sidebarOpen;
            },

            toggleRow(po_number) {
                if (this.expanded === po_number) {
                    this.expanded = null;
                } else {
                    this.expanded = po_number;
                }
            },

            isRowError(row) {
                return row.reconciliation?.is_flagged;
            },

            hasItemMismatch(item_code, row) {
                const excs = row.reconciliation?.exceptions || [];
                return excs.some(e => e.item_code === item_code);
            },

            checkAmountMatch(row) {
                const rs = row.reconciliation?.recon_status;
                if (!row.invoice_data) return false;
                return !['OVERCHARGED', 'PRICE_VARIANCE', 'VARIANCE_FLAGGED'].includes(rs);
            },
            checkQtyMatch(row) {
                const rs = row.reconciliation?.recon_status;
                if (!row.invoice_data) return false;
                return rs !== 'QTY_VARIANCE';
            },
            checkTaxMatch(row) {
                if (!row.invoice_data || !row.po_data) return false;
                // Simple tax compare
                return this.amt(row.po_data.tax_total) === this.amt(row.invoice_data.combined_grand_total - row.invoice_data.invoices.reduce((acc, i) => acc + i.net_total, 0));
            },

            /**
             * Build a merged item comparison for the drill-down view.
             * Matches PO items with PI items by item_code and shows side-by-side.
             */
            getItemComparison(row) {
                const poItems = row.po_data?.items || [];
                const piAllItems = [];
                if (row.invoice_data?.invoices) {
                    row.invoice_data.invoices.forEach(inv => {
                        (inv.items || []).forEach(it => piAllItems.push(it));
                    });
                }

                // Aggregate PI items by item_code (multiple invoices may have same item)
                const piByCode = {};
                piAllItems.forEach(it => {
                    const code = it.item_code || '';
                    if (!piByCode[code]) {
                        piByCode[code] = { item_code: code, item_name: it.item_name, qty: 0, rate: it.rate, amount: 0, net_amount: 0 };
                    }
                    piByCode[code].qty += it.qty || 0;
                    piByCode[code].amount += it.amount || 0;
                    piByCode[code].net_amount += it.net_amount || 0;
                });

                // Discrepancy lookup for richer annotations
                const discByCode = {};
                const discs = row.reconciliation?.item_discrepancies?.pi_vs_po || [];
                discs.forEach(d => { discByCode[d.item_code] = d; });

                const allCodes = new Set();
                poItems.forEach(it => allCodes.add(it.item_code));
                Object.keys(piByCode).forEach(c => allCodes.add(c));

                const results = [];
                allCodes.forEach(code => {
                    const po = poItems.find(it => it.item_code === code);
                    const pi = piByCode[code];
                    const disc = discByCode[code];

                    const po_qty = po ? po.qty : null;
                    const pi_qty = pi ? pi.qty : null;
                    const po_rate = po ? po.rate : null;
                    const pi_rate = pi ? pi.rate : null;
                    const po_amount = po ? po.amount : null;
                    const pi_amount = pi ? pi.amount : null;
                    const rate_diff = (po_rate != null && pi_rate != null) ? Math.round((pi_rate - po_rate) * 100) / 100 : null;
                    const qty_diff = (po_qty != null && pi_qty != null) ? Math.round((pi_qty - po_qty) * 100) / 100 : null;
                    const amount_diff = (po_amount != null && pi_amount != null) ? Math.round((pi_amount - po_amount) * 100) / 100 : null;
                    const hasMismatch = (rate_diff && rate_diff !== 0) || (qty_diff && qty_diff !== 0);

                    let variance_label = '';
                    let variance_class = '';
                    if (disc) {
                        if (disc.variance_type === 'RATE') { variance_label = 'Rate Variance'; variance_class = 'price'; }
                        else if (disc.variance_type === 'QTY') { variance_label = 'Qty Variance'; variance_class = 'qty'; }
                        else if (disc.variance_type?.startsWith('MISSING')) { variance_label = disc.variance_type.replace(/_/g, ' '); variance_class = 'missing'; }
                    } else if (!po) {
                        variance_label = 'Only in Invoice'; variance_class = 'missing';
                    } else if (!pi && row.invoice_data) {
                        variance_label = 'Not Invoiced'; variance_class = 'missing';
                    }

                    results.push({
                        item_code: code,
                        item_name: (po?.item_name || pi?.item_name || code),
                        po_qty, pi_qty, po_rate, pi_rate, po_amount, pi_amount,
                        rate_diff, qty_diff, amount_diff,
                        hasMismatch,
                        variance_label, variance_class,
                    });
                });

                return results;
            },

            // ── Chart Methods ──

            clearChartFilter() {
                this.chartFilterSupplier = null;
                this.chartFilterExceptionType = null;
                this.chartFilterItem = null;
                this.itemIssueFilter = "all";
                this.supplierScoreFilter = "all";
                this.txnPage = 1;
                this.itemPage = 1;
                this.supplierPage = 1;
            },

            destroyCharts() {
                ['rc-trend-chart', 'rc-supplier-chart', 'rc-variance-chart', 'rc-item-chart', 'rc-supplier-score-chart'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '';
                });
                this._trendChart = null;
                this._supplierChart = null;
                this._varianceChart = null;
                this._itemChart = null;
                this._supplierScoreChart = null;
            },

            renderAllCharts() {
                this.destroyCharts();
                this.$nextTick(() => {
                    requestAnimationFrame(() => {
                        if (this.viewLevel === 'po') {
                            this.renderTrendChart();
                            requestAnimationFrame(() => {
                                this.renderSupplierChart();
                                requestAnimationFrame(() => {
                                    this.renderVarianceChart();
                                });
                            });
                        } else if (this.viewLevel === 'item') {
                            this.renderItemChart();
                        } else if (this.viewLevel === 'supplier') {
                            this.renderSupplierScoreChart();
                        }
                    });
                });
            },

            renderTrendChart() {
                const data = this.trendData;
                if (!data || !data.labels.length) return;
                const el = document.getElementById('rc-trend-chart');
                if (!el) return;

                try {
                    this._trendChart = new frappe.Chart(el, {
                        data: {
                            labels: data.labels,
                            datasets: [
                                { name: "PO Amount", type: "line", values: data.poValues },
                                { name: "Invoice Amount", type: "line", values: data.piValues },
                            ],
                        },
                        type: 'axis-mixed',
                        height: 220,
                        colors: ['#475569', '#818cf8'],
                        lineOptions: {
                            regionFill: 1,
                            hideDots: 0,
                            dotSize: 4,
                            spline: 1,
                        },
                        axisOptions: {
                            xIsSeries: true,
                            shortenYAxisNumbers: 1,
                        },
                        tooltipOptions: {
                            formatTooltipY: (d) => '₹' + Number(d).toLocaleString('en-IN'),
                        },
                    });
                } catch (e) {
                    console.warn('Failed to render trend chart:', e);
                }
            },

            renderSupplierChart() {
                const data = this.topSupplierData;
                if (!data || !data.labels.length) return;
                const el = document.getElementById('rc-supplier-chart');
                if (!el) return;

                const self = this;
                try {
                    this._supplierChart = new frappe.Chart(el, {
                        data: {
                            labels: data.labels,
                            datasets: [
                                { name: "PO Amount", values: data.poValues },
                                { name: "Invoice Amount", values: data.piValues },
                            ],
                        },
                        type: 'bar',
                        height: 220,
                        colors: ['#475569', '#f87171'],
                        barOptions: {
                            spaceRatio: 0.4,
                        },
                        axisOptions: {
                            shortenYAxisNumbers: 1,
                        },
                        tooltipOptions: {
                            formatTooltipY: (d) => '₹' + Number(d).toLocaleString('en-IN'),
                        },
                        isNavigable: true,
                    });

                    // Use native click event as fallback for interaction
                    el.addEventListener('click', (e) => {
                        let idx = null;
                        let target = e.target;
                        while (target && target !== el) {
                            if (target.hasAttribute('data-point-index')) {
                                idx = parseInt(target.getAttribute('data-point-index'));
                                break;
                            }
                            target = target.parentNode;
                        }

                        // Fallback for shapes without data-point-index
                        if (idx === null && e.target.tagName === 'rect') {
                            const parent = e.target.closest('g.dataset-units');
                            if (parent) {
                                const rects = Array.from(parent.querySelectorAll('rect'));
                                idx = rects.indexOf(e.target);
                            }
                        }

                        if (idx !== null && idx >= 0 && data.fullNames[idx]) {
                            self.chartFilterExceptionType = null;
                            self.chartFilterSupplier = data.fullNames[idx];
                            self.txnPage = 1;
                            self.itemPage = 1;
                            self.supplierPage = 1;
                        }
                    });
                } catch (e) {
                    console.warn('Failed to render supplier chart:', e);
                }
            },

            renderVarianceChart() {
                const data = this.varianceBreakdown;
                if (!data || !data.labels.length) return;
                const el = document.getElementById('rc-variance-chart');
                if (!el) return;

                const self = this;
                const colorMap = {
                    'Quantity Variance': '#818cf8',
                    'Price Variance': '#fb923c',
                    'Overcharged': '#f87171',
                    'Favorable Variance': '#4ade80',
                    'Other Variance': '#a1a1aa',
                };
                const colors = data.labels.map(l => colorMap[l] || '#a1a1aa');
                const total = data.values.reduce((s, v) => s + v, 0);

                // ── Custom SVG Donut ──
                const size = 180, cx = size / 2, cy = size / 2, radius = 68, stroke = 28;
                let cumulativeAngle = -90; // start from top

                function describeArc(startAngle, sweepAngle) {
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = ((startAngle + sweepAngle) * Math.PI) / 180;
                    const x1 = cx + radius * Math.cos(startRad);
                    const y1 = cy + radius * Math.sin(startRad);
                    const x2 = cx + radius * Math.cos(endRad);
                    const y2 = cy + radius * Math.sin(endRad);
                    const largeArc = sweepAngle > 180 ? 1 : 0;
                    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
                }

                let pathsHTML = '';
                data.values.forEach((val, i) => {
                    const sweep = (val / total) * 360;
                    // Clamp sweep to prevent full-circle rendering artifacts
                    const actualSweep = Math.min(sweep, 359.9);
                    const path = describeArc(cumulativeAngle, actualSweep);
                    pathsHTML += `<path d="${path}" fill="none" stroke="${colors[i]}" stroke-width="${stroke}"
                        data-idx="${i}" class="rc-donut-segment"
                        style="cursor:pointer; transition: stroke-width 0.2s ease, opacity 0.2s ease;"/>`;
                    cumulativeAngle += sweep;
                });

                el.innerHTML = `
                    <div class="rc-donut-wrapper" style="position:relative; width:${size}px; height:${size}px; margin: 8px auto 0;">
                        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
                            ${pathsHTML}
                        </svg>
                        <div class="rc-donut-center">
                            <div class="rc-donut-center__count">${total}</div>
                            <div class="rc-donut-center__label">Exceptions</div>
                        </div>
                        <div class="rc-donut-tooltip" id="rc-donut-tooltip" style="display:none;"></div>
                    </div>
                `;

                // Add interactions
                const segments = el.querySelectorAll('.rc-donut-segment');
                const tooltip = el.querySelector('#rc-donut-tooltip');

                segments.forEach(seg => {
                    const idx = parseInt(seg.getAttribute('data-idx'));
                    const pctVal = total > 0 ? Math.round((data.values[idx] / total) * 100) : 0;

                    seg.addEventListener('mouseenter', (e) => {
                        seg.style.strokeWidth = stroke + 6;
                        seg.style.opacity = '1';
                        segments.forEach(s => { if (s !== seg) s.style.opacity = '0.45'; });
                        tooltip.innerHTML = `<strong>${data.labels[idx]}</strong><br>${data.values[idx]} (${pctVal}%)`;
                        tooltip.style.display = 'block';
                    });

                    seg.addEventListener('mousemove', (e) => {
                        const rect = el.querySelector('.rc-donut-wrapper').getBoundingClientRect();
                        tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
                        tooltip.style.top = (e.clientY - rect.top - 30) + 'px';
                    });

                    seg.addEventListener('mouseleave', () => {
                        seg.style.strokeWidth = stroke;
                        segments.forEach(s => s.style.opacity = '1');
                        tooltip.style.display = 'none';
                    });

                    seg.addEventListener('click', () => {
                        self.chartFilterSupplier = null;
                        self.chartFilterExceptionType = data.labels[idx];
                        self.page = 1;
                    });
                });

                // Build custom legend below the chart
                const legendEl = document.getElementById('rc-variance-legend');
                if (legendEl) {
                    let legendHTML = '';
                    data.labels.forEach((label, i) => {
                        const pctVal = total > 0 ? Math.round((data.values[i] / total) * 100) : 0;
                        const color = colorMap[label] || '#a1a1aa';
                        legendHTML += `<div class="rc-legend-item" data-idx="${i}" style="cursor:pointer;">`
                            + `<span class="rc-legend-dot" style="background:${color};"></span>`
                            + `<span class="rc-legend-label">${label}</span>`
                            + `<span class="rc-legend-value">${data.values[i]} (${pctVal}%)</span>`
                            + `</div>`;
                    });
                    legendEl.innerHTML = legendHTML;

                    // Add click handlers to legend items
                    legendEl.querySelectorAll('.rc-legend-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const idx = parseInt(item.dataset.idx);
                            if (!isNaN(idx) && data.labels[idx]) {
                                self.chartFilterSupplier = null;
                                self.chartFilterExceptionType = data.labels[idx];
                                self.txnPage = 1;
                            self.itemPage = 1;
                            self.supplierPage = 1;
                            }
                        });
                    });
                }
            },

            renderItemChart() {
                const data = this.topItemData;
                if (!data || !data.labels.length) return;
                const el = document.getElementById('rc-item-chart');
                if (!el) return;

                const self = this;
                try {
                    this._itemChart = new frappe.Chart(el, {
                        data: {
                            labels: data.labels,
                            datasets: [
                                { name: "PO Amount", values: data.poValues },
                                { name: "Invoice Amount", values: data.piValues },
                            ],
                        },
                        type: 'bar',
                        height: 220,
                        colors: ['#475569', '#f87171'],
                        barOptions: {
                            spaceRatio: 0.4,
                        },
                        axisOptions: {
                            shortenYAxisNumbers: 1,
                        },
                        tooltipOptions: {
                            formatTooltipY: (d) => '₹' + Number(d).toLocaleString('en-IN'),
                        },
                        isNavigable: true,
                    });

                    // Use native click event as fallback for interaction
                    el.addEventListener('click', (e) => {
                        let idx = null;
                        let target = e.target;
                        while (target && target !== el) {
                            if (target.hasAttribute('data-point-index')) {
                                idx = parseInt(target.getAttribute('data-point-index'));
                                break;
                            }
                            target = target.parentNode;
                        }

                        // Fallback for shapes without data-point-index
                        if (idx === null && e.target.tagName && e.target.tagName.toLowerCase() === 'rect') {
                            const parent = e.target.closest('g.dataset-units');
                            if (parent) {
                                const rects = Array.from(parent.querySelectorAll('rect'));
                                idx = rects.indexOf(e.target);
                            }
                        }

                        if (idx !== null && idx >= 0 && data.fullNames[idx]) {
                            self.itemIssueFilter = 'all';
                            self.chartFilterItem = data.fullNames[idx];
                            self.txnPage = 1;
                            self.itemPage = 1;
                            self.supplierPage = 1;
                        }
                    });
                } catch (e) {
                    console.warn('Failed to render item chart:', e);
                }
            },

            renderSupplierScoreChart() {
                const data = this.topSupplierScoreData;
                if (!data || !data.labels.length) return;
                const el = document.getElementById('rc-supplier-score-chart');
                if (!el) return;

                const self = this;
                try {
                    this._supplierScoreChart = new frappe.Chart(el, {
                        data: {
                            labels: data.labels,
                            datasets: [
                                { name: "Supplier Rating", values: data.scores },
                            ],
                        },
                        type: 'bar',
                        height: 220,
                        colors: ['#10b981'],
                        barOptions: {
                            spaceRatio: 0.4,
                        },
                        axisOptions: {
                            yAxisMode: 'tick',
                            xAxisMode: 'tick'
                        },
                        tooltipOptions: {
                            formatTooltipY: (d) => Number(d).toLocaleString('en-IN') + ' / 100',
                        },
                        isNavigable: true,
                    });
                } catch (e) {
                    console.warn('Failed to render supplier score chart:', e);
                }
            },

            fetchData() {
                // Sync values from Frappe controls back to Vue state
                if (this.from_ctl) this.selectedFrom = this.from_ctl.get_value();
                if (this.to_ctl) this.selectedTo = this.to_ctl.get_value();
                if (this.tol_ctl) this.tolerance = this.tol_ctl.get_value();
                if (this.company_ctl) this.selectedCompany = this.company_ctl.get_value();

                // ── MOCK DATA PATH ──
                // When useMockData is true, we bypass the real API and generate fake data.
                // This is useful for testing the charts when no real PO/PI data exists.
                if (this.useMockData) {
                    this.loading = true;
                    this.result = null;
                    this.expanded = null;
                    this.txnPage = 1;
                this.itemPage = 1;
                this.supplierPage = 1;
                    this.clearChartFilter();
                    this.selectedCompany = this.selectedCompany || "Demo Company";

                    setTimeout(() => {
                        this.result = _generateMockData();
                        this.loading = false;
                        this.$nextTick(() => this.renderAllCharts());
                    }, 600);
                    return;
                }

                // ── REAL DATA PATH ──
                if (!this.selectedCompany) {
                    frappe.msgprint("Please select a Company");
                    return;
                }
                if (!this.selectedFrom || !this.selectedTo) {
                    frappe.msgprint("Please select From and To dates");
                    return;
                }

                this.loading = true;
                this.result = null;
                this.expanded = null;
                this.txnPage = 1;
                this.itemPage = 1;
                this.supplierPage = 1;
                this.clearChartFilter();

                frappe.call({
                    method: "reconciliation_toolkit.reconciliation_toolkit.services.purchase_recon_engine.run_purchase_reconciliation",
                    args: {
                        from_date: this.selectedFrom,
                        to_date: this.selectedTo,
                        tolerance: this.tolerance,
                        company: this.selectedCompany
                    },
                    callback: (r) => {
                        this.loading = false;
                        if (r.message) {
                            this.result = r.message;
                            this.$nextTick(() => this.renderAllCharts());
                        }
                    },
                    error: (r) => {
                        this.loading = false;
                        frappe.msgprint("Error fetching reconciliation data.");
                    }
                });
            },

            copyDisputeNote(row) {
                const pms_id = row.po_number;
                const po_amt = amt(row.po_data?.grand_total);
                const pi_amt = amt(row.invoice_data?.combined_grand_total);

                let details = '';
                if (row.reconciliation?.exceptions?.length > 0) {
                    details = row.reconciliation.exceptions.map(e => e.description).join('\\n');
                }

                const text = `Discrepancy for PO: ${pms_id}\nPO Total: ${po_amt}\nInvoice Total: ${pi_amt}\n\nDetails:\n${details}`;

                frappe.utils.copy_to_clipboard(text);
                frappe.show_alert({ message: 'Dispute Note Copied', indicator: 'green' });
            }
        },

        template: `
        <div class="rc">
            <!-- Compliance Drawer Overlay -->
            <div v-if="complianceDrawerOpen" class="rc-drawer-overlay" @click="complianceDrawerOpen = false" style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1040;"></div>
            
            <!-- Compliance Drawer -->
            <div class="rc-drawer" :style="{ right: complianceDrawerOpen ? '0' : '-400px' }" style="position: fixed; top: 0; width: 400px; height: 100vh; background: var(--bg-color, #fff); box-shadow: -4px 0 15px rgba(0,0,0,0.1); z-index: 1050; transition: right 0.3s ease; display: flex; flex-direction: column;">
                <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--heading-color);">Compliance Checklist</h3>
                    <button @click="complianceDrawerOpen = false" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-muted);">&times;</button>
                </div>
                <div style="padding: 20px; flex: 1; overflow-y: auto;">
                    <div style="margin-bottom: 30px;">
                        <div style="font-size: 42px; font-weight: 700; color: var(--text-color); display: flex; align-items: baseline;">
                            {{ complianceScore }}<span style="font-size: 18px; color: var(--text-muted); font-weight: 500;">/10</span>
                        </div>
                        <div style="font-size: 14px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Best Practices Score</div>
                    </div>

                    <div v-if="complianceScore >= 10" style="padding: 15px; background: rgba(16, 185, 129, 0.1); color: #10b981; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
                        <div style="font-weight: 600; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Excellent!
                        </div>
                        Your system is fully compliant with standard buying best practices.
                    </div>
                    <div v-else>
                        <div style="font-weight: 600; margin-bottom: 15px; color: var(--heading-color);">Required Actions to Improve Score:</div>
                        <div v-for="(s, i) in complianceSuggestions" :key="i" style="display: flex; gap: 12px; margin-bottom: 15px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--control-bg);">
                            <div style="color: #f59e0b; flex-shrink: 0; padding-top: 2px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            </div>
                            <div style="font-size: 13px; line-height: 1.5; color: var(--text-color);">{{ s }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rc-layout" style="display: flex; flex-direction: row; align-items: flex-start;">
                <!-- Sidebar -->
                <aside id="rc-injected-sidebar" class="rc-injected-sidebar rc-sidebar" :class="{'rc-sidebar--closed': !sidebarOpen}"
                       style="width: 280px; flex-shrink: 0; padding: 10px 15px; border-right: 1px solid var(--border-color); min-height: 100%; box-sizing: border-box;">
                    <div class="rc-sidebar__hdr" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--border-color); background: transparent; padding-left: 0; padding-right: 0;">
                        RECONCILIATION PARAMS
                    </div>

                    <div class="rc-sidebar__section" style="padding: 0 0 10px 0; border: none;">
                        <div class="rc-sidebar__field" id="rc_company" style="margin-top: 4px;"></div>
                        <div class="rc-sidebar__field" id="rc_from" style="margin-top: 4px;"></div>
                        <div class="rc-sidebar__field" id="rc_to" style="margin-top: 4px;"></div>
                        <div class="rc-sidebar__field" id="rc_tol" style="margin-top: 4px;"></div>
                        
                        <button class="btn btn-primary btn-sm" @click="fetchData" :disabled="loading" style="margin-top: 12px; width: 100%;">
                            {{ loading ? 'Reconciling...' : 'Reconcile' }}
                        </button>
                    </div>

                    <!-- Quick Filters -->
                    <div class="rc-sidebar__section" v-if="result">
                        <div class="rc-sidebar__label">Status Filter</div>
                        <div class="rc-chip-group">
                            <button class="rc-chip" :class="{'rc-chip--active': statusFilter === 'all'}" @click="statusFilter = 'all'">All</button>
                            <button class="rc-chip" :class="{'rc-chip--active': statusFilter === 'matched'}" @click="statusFilter = 'matched'">Matched</button>
                            <button class="rc-chip" :class="{'rc-chip--active': statusFilter === 'issues'}" @click="statusFilter = 'issues'">Issues</button>
                            <button class="rc-chip" :class="{'rc-chip--active': statusFilter === 'missing_pi'}" @click="statusFilter = 'missing_pi'">Missing PI</button>
                            <button class="rc-chip" :class="{'rc-chip--active': statusFilter === 'missing_po'}" @click="statusFilter = 'missing_po'">Missing SQ</button>
                        </div>
                        
                        <div v-if="viewLevel === 'po'">
                            <div class="rc-sidebar__label" style="margin-top:15px;">Issue Type</div>
                            <div class="rc-chip-group">
                                <button class="rc-chip" :class="{'rc-chip--active': issueFilter === 'all'}" @click="issueFilter = 'all'">All</button>
                                <button class="rc-chip" :class="{'rc-chip--active': issueFilter === 'amount'}" @click="issueFilter = 'amount'">Amount</button>
                                <button class="rc-chip" :class="{'rc-chip--active': issueFilter === 'quantity'}" @click="issueFilter = 'quantity'">Quantity</button>
                                <button class="rc-chip" :class="{'rc-chip--active': issueFilter === 'tax'}" @click="issueFilter = 'tax'">Tax</button>
                            </div>
                        </div>

                        <div v-if="viewLevel === 'item'">
                            <div class="rc-sidebar__label" style="margin-top:15px;">Item Match Status</div>
                            <div class="rc-chip-group">
                                <button class="rc-chip" :class="{'rc-chip--active': itemIssueFilter === 'all'}" @click="itemIssueFilter = 'all'">All Items</button>
                                <button class="rc-chip" :class="{'rc-chip--active': itemIssueFilter === 'matched'}" @click="itemIssueFilter = 'matched'">Matched</button>
                                <button class="rc-chip" :class="{'rc-chip--active': itemIssueFilter === 'mismatched'}" @click="itemIssueFilter = 'mismatched'">Mismatched</button>
                            </div>
                        </div>
                        
                        <div class="rc-sidebar__label" style="margin-top:15px;">Payment Status</div>
                        <div class="rc-chip-group">
                            <button class="rc-chip" :class="{'rc-chip--active': paymentFilter === 'all'}" @click="paymentFilter = 'all'">All</button>
                            <button class="rc-chip" :class="{'rc-chip--active': paymentFilter === 'paid'}" @click="paymentFilter = 'paid'">Paid</button>
                            <button class="rc-chip" :class="{'rc-chip--active': paymentFilter === 'partial'}" @click="paymentFilter = 'partial'">Partial</button>
                            <button class="rc-chip" :class="{'rc-chip--active': paymentFilter === 'unpaid'}" @click="paymentFilter = 'unpaid'">Unpaid</button>
                        </div>
                    </div>
                </aside>

                <!-- Main Content -->
                <main class="rc-main" style="flex:1; min-width:0;">
                    <!-- Top Navigation Bar -->
                    <div class="rc-bar" style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
                        <div class="rc-bar__l" style="display: flex; align-items: center;">
                            <button class="btn btn-xs btn-default" @click="toggleSidebar" title="Toggle Sidebar" style="margin-right: 12px; padding: 4px 6px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <div style="display: inline-flex; background: var(--control-bg, rgba(0,0,0,0.05)); padding: 2px; border-radius: 6px; margin-right: 12px;">
                                <button class="btn btn-xs" :class="viewLevel==='po' ? 'btn-primary':'btn-default'" style="border:none; box-shadow:none; font-weight:600;" @click="viewLevel='po'">PO Level</button>
                                <button class="btn btn-xs" :class="viewLevel==='item' ? 'btn-primary':'btn-default'" style="border:none; box-shadow:none; font-weight:600;" @click="viewLevel='item'">Item Level</button>
                                <button class="btn btn-xs" :class="viewLevel==='supplier' ? 'btn-primary':'btn-default'" style="border:none; box-shadow:none; font-weight:600;" @click="viewLevel='supplier'">Supplier Level</button>
                            </div>
                        </div>

                        <div class="rc-bar__c" v-if="result" style="text-align: center; flex: 1; margin: 0 16px;">
                            <h4 style="margin: 0 0 2px 0; font-size: 18px; font-weight: 700; color: var(--heading-color);">{{ selectedCompany }}</h4>
                            <div style="font-size: 13px; color: var(--text-muted); font-weight: 500;">
                                {{ selectedFrom }} — {{ selectedTo }}
                            </div>
                        </div>
                        <div class="rc-bar__c" v-else style="text-align: center; flex: 1; margin: 0 16px;">
                            <h4 style="margin: 0 0 2px 0; font-size: 18px; font-weight: 700; color: var(--heading-color);">Purchase Reconciliation</h4>
                        </div>

                        <div class="rc-bar__r">
                            <input class="form-control input-xs rc-search" placeholder="Search suppliers/POs..." v-model="search" style="width:100%" />
                        </div>
                    </div>

                    <div v-if="loading" class="rc-empty" style="min-height: 400px; display:flex; align-items:center; justify-content:center;">
                         <div style="text-align:center; color: var(--text-muted)">Loading Reconciliation Engine...</div>
                    </div>
                    <div v-else-if="!result" class="rc-empty" style="min-height: 400px; display:flex; align-items:center; justify-content:center;">
                        <div style="text-align:center; color: var(--text-muted)">Configure parameters and click Reconcile.</div>
                    </div>
                    <div v-else>
                        
                        <!-- KPI Cards -->
                        <div class="rc-overview" v-if="viewLevel === 'po'">
                            <div class="rc-stat rc-stat--accent">
                                <span class="rc-stat__n">{{ kpis.vol }}</span>
                                <span class="rc-stat__l">TOTAL POs</span>
                            </div>
                            <div class="rc-stat" :class="(parseFloat(kpis.matchRate) >= 90) ? 'rc-stat--ok' : 'rc-stat--err'">
                                <span class="rc-stat__n">{{ kpis.matchRate }}</span>
                                <span class="rc-stat__l">OVERALL MATCH</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="(kpis.amountIssues > 0) ? 'rc-stat--err' : 'rc-stat--ok'" @click="issueFilter = 'amount'">
                                <span class="rc-stat__n">{{ kpis.amountIssues }}</span>
                                <span class="rc-stat__l">AMOUNT ISSUES</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="(kpis.qtyIssues > 0) ? 'rc-stat--err' : 'rc-stat--ok'" @click="issueFilter = 'quantity'">
                                <span class="rc-stat__n">{{ kpis.qtyIssues }}</span>
                                <span class="rc-stat__l">QTY VARIANCES</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="(kpis.missingDocs > 0) ? 'rc-stat--err' : 'rc-stat--ok'" @click="statusFilter = 'missing_pi'">
                                <span class="rc-stat__n">{{ kpis.missingDocs }}</span>
                                <span class="rc-stat__l">MISSING DOCS</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="complianceScore >= 8 ? 'rc-stat--ok' : 'rc-stat--err'" @click="toggleComplianceDrawer()">
                                <span class="rc-stat__n">{{ complianceScore }}/10</span>
                                <span class="rc-stat__l">COMPLIANCE SCORE</span>
                            </div>
                        </div>

                        <!-- ITEM LEVEL KPI Cards -->
                        <div class="rc-overview" v-if="viewLevel === 'item'">
                            <div class="rc-stat rc-stat--accent rc-stat--clickable" @click="itemIssueFilter = 'all'; chartFilterItem = null">
                                <span class="rc-stat__n">{{ itemKpis.totalItems }}</span>
                                <span class="rc-stat__l">TOTAL ITEMS</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="(parseFloat(itemKpis.matchPct) >= 90) ? 'rc-stat--ok' : 'rc-stat--err'" @click="itemIssueFilter = 'matched'">
                                <span class="rc-stat__n">{{ itemKpis.matchPct }}</span>
                                <span class="rc-stat__l">ITEM MATCH RATE</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="(itemKpis.mismatchItems > 0) ? 'rc-stat--err' : 'rc-stat--ok'" @click="itemIssueFilter = 'mismatched'">
                                <span class="rc-stat__n">{{ itemKpis.mismatchItems }}</span>
                                <span class="rc-stat__l">MISMATCHED ITEMS</span>
                            </div>
                            <div class="rc-stat">
                                <span class="rc-stat__n">{{ amt(itemKpis.poValue) }}</span>
                                <span class="rc-stat__l">PO VALUE (ITEMS)</span>
                            </div>
                            <div class="rc-stat">
                                <span class="rc-stat__n">{{ amt(itemKpis.piValue) }}</span>
                                <span class="rc-stat__l">PI VALUE (ITEMS)</span>
                            </div>
                            <div class="rc-stat" :class="itemKpis.variance > 0 ? 'rc-stat--err' : (itemKpis.variance < 0 ? 'rc-stat--ok' : '')">
                                <span class="rc-stat__n">{{ diff(itemKpis.variance) }}</span>
                                <span class="rc-stat__l">NET VARIANCE</span>
                            </div>
                        </div>

                        <!-- SUPPLIER LEVEL KPI Cards -->
                        <div class="rc-overview" v-if="viewLevel === 'supplier' && supplierKpis">
                            <div class="rc-stat rc-stat--accent rc-stat--clickable" @click="supplierScoreFilter = 'all'">
                                <span class="rc-stat__n">{{ supplierKpis.totalSuppliers }}</span>
                                <span class="rc-stat__l">TOTAL SUPPLIERS</span>
                            </div>
                            <div class="rc-stat" :class="supplierKpis.avgRating >= 85 ? 'rc-stat--ok' : supplierKpis.avgRating >= 70 ? '' : 'rc-stat--err'">
                                <span class="rc-stat__n">{{ supplierKpis.avgRating }} / 100</span>
                                <span class="rc-stat__l">AVG SUPPLIER RATING</span>
                            </div>
                            <div class="rc-stat rc-stat--ok">
                                <span class="rc-stat__n">{{ supplierKpis.topSupplierRating }}</span>
                                <span class="rc-stat__l">TOP RATING ({{ supplierKpis.topSupplierName.substring(0, 15) }})</span>
                            </div>
                            <div class="rc-stat rc-stat--clickable" :class="(supplierKpis.poorSuppliers > 0) ? 'rc-stat--err' : 'rc-stat--ok'" @click="supplierScoreFilter = 'poor'">
                                <span class="rc-stat__n">{{ supplierKpis.poorSuppliers }}</span>
                                <span class="rc-stat__l">POOR RATINGS (&lt;70)</span>
                            </div>
                        </div>

                        <!-- ═══════════════════════════════════════ -->
                        <!-- OPERATIONAL EFFICIENCY ANALYTICS        -->
                        <!-- ═══════════════════════════════════════ -->
                        <div class="rc-oe-grid" v-if="operationalEfficiency && viewLevel === 'po'" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 24px;">
                            <div v-for="(data, docType) in operationalEfficiency" :key="docType" class="rc-chart-card" style="padding: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <div style="font-weight: 600; font-size: 15px; color: var(--heading-color);">{{ docType }} Efficiency</div>
                                    <span v-if="data.bottleneck_warning" class="rc-badge badge--err" title="High cancellation rate indicates a bottleneck" style="font-size: 11px;">⚠️ Bottleneck</span>
                                    <span v-else class="rc-badge badge--ok" style="font-size: 11px;">Healthy</span>
                                </div>
                                <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px;">
                                    <span style="font-size: 28px; font-weight: 700; color: var(--text-color);">{{ data.cancellation_rate }}%</span>
                                    <span style="font-size: 13px; color: var(--text-muted); text-transform: uppercase;">Cancellation Rate</span>
                                </div>
                                
                                <!-- Progress Bar representation of ratios -->
                                <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 12px; background: #e2e8f0;">
                                    <div v-if="data.total > 0" :style="{ width: (data.counts.Submitted / data.total * 100) + '%', background: '#10b981' }" title="Submitted"></div>
                                    <div v-if="data.total > 0" :style="{ width: (data.counts.Draft / data.total * 100) + '%', background: '#94a3b8' }" title="Draft"></div>
                                    <div v-if="data.total > 0" :style="{ width: (data.counts.Cancelled / data.total * 100) + '%', background: '#ef4444' }" title="Cancelled"></div>
                                </div>
                                
                                <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
                                    <div @click="openFilteredList(docType, 'Submitted')" style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='rgba(16, 185, 129, 0.1)'" onmouseout="this.style.background='transparent'">
                                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
                                        <span style="font-weight: 600; color: var(--text-color);">{{ data.counts.Submitted }}</span> Sub
                                    </div>
                                    <div @click="openFilteredList(docType, 'Draft')" style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='rgba(148, 163, 184, 0.1)'" onmouseout="this.style.background='transparent'">
                                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #94a3b8;"></span>
                                        <span style="font-weight: 600; color: var(--text-color);">{{ data.counts.Draft }}</span> Draft
                                    </div>
                                    <div @click="openFilteredList(docType, 'Cancelled')" style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='transparent'">
                                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
                                        <span style="font-weight: 600; color: var(--text-color);">{{ data.counts.Cancelled }}</span> Canc
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ═══════════════════════════════════════ -->
                        <!-- ANALYTICS CHARTS SECTION               -->
                        <!-- ═══════════════════════════════════════ -->
                        <div class="rc-charts-grid" v-if="viewLevel === 'po'">
                            <!-- Trend Line: Spend vs Invoice over Time -->
                            <div class="rc-chart-card rc-chart-card--span2">
                                <div class="rc-chart-card__hdr">
                                    <div>
                                        <span class="rc-chart-card__title">Spend vs Invoice Trend</span>
                                        <span class="rc-chart-card__subtitle" style="margin-left: 8px;">Last 12 Months</span>
                                    </div>
                                </div>
                                <div class="rc-chart-card__body" id="rc-trend-chart"></div>
                            </div>

                            <!-- Top Suppliers by Variance -->
                            <div class="rc-chart-card">
                                <div class="rc-chart-card__hdr">
                                    <div>
                                        <span class="rc-chart-card__title">Top Suppliers by Variance</span>
                                        <span class="rc-chart-card__subtitle" style="margin-left: 8px;">Click bar to filter</span>
                                    </div>
                                </div>
                                <div class="rc-chart-card__body" id="rc-supplier-chart"></div>
                            </div>

                            <!-- Variance Breakdown -->
                            <div class="rc-chart-card">
                                <div class="rc-chart-card__hdr">
                                    <div>
                                        <span class="rc-chart-card__title">Exception Breakdown</span>
                                        <span class="rc-chart-card__subtitle" style="margin-left: 8px;">Click to filter</span>
                                    </div>
                                </div>
                                <div class="rc-chart-card__body" style="min-height: auto; padding-bottom: 0;">
                                    <div id="rc-variance-chart"></div>
                                    <div id="rc-variance-legend" class="rc-legend"></div>
                                </div>
                            </div>
                        </div>

                        <div class="rc-charts-grid" v-if="viewLevel === 'item'">
                            <!-- Top Items by Variance -->
                            <div class="rc-chart-card" style="grid-column: span 3;">
                                <div class="rc-chart-card__hdr">
                                    <div>
                                        <span class="rc-chart-card__title">Top Items by Variance</span>
                                        <span class="rc-chart-card__subtitle" style="margin-left: 8px;">Items with highest absolute variance</span>
                                    </div>
                                </div>
                                <div class="rc-chart-card__body" id="rc-item-chart"></div>
                            </div>
                        </div>

                        <div class="rc-charts-grid" v-if="viewLevel === 'supplier'">
                            <!-- Top Suppliers by Score -->
                            <div class="rc-chart-card" style="grid-column: span 3;">
                                <div class="rc-chart-card__hdr">
                                    <div>
                                        <span class="rc-chart-card__title">Supplier Ratings</span>
                                        <span class="rc-chart-card__subtitle" style="margin-left: 8px;">Overall performance scores</span>
                                    </div>
                                </div>
                                <div class="rc-chart-card__body" id="rc-supplier-score-chart"></div>
                            </div>
                        </div>

                        <!-- Chart Filter Banner -->
                        <div v-if="activeChartFilter" class="rc-chart-filter-banner">
                            <div class="rc-chart-filter-banner__text">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                                Filtered by {{ activeChartFilter.type }}:
                                <span class="rc-chart-filter-banner__tag">{{ activeChartFilter.value }}</span>
                                <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">
                                    ({{ activeChartFilter.count }} result{{ activeChartFilter.count !== 1 ? 's' : '' }})
                                </span>
                            </div>
                            <button class="rc-chart-filter-banner__clear" @click="clearChartFilter">✕ Clear</button>
                        </div>

                        <!-- ═══ PO LEVEL TABLE ═══ -->
                        <div class="rc-tbl-wrapper" v-if="viewLevel === 'po'">
                            <table class="table rc-tbl">
                                <thead>
                                    <tr>
                                        <th>Supplier</th>
                                        <th>PO Number</th>
                                        <th class="right">Quoted Amt</th>
                                        <th class="right">PO Amt</th>
                                        <th class="right">Invoice Amt</th>
                                        <th class="right">Diff</th>
                                        <th class="center">Checks</th>
                                        <th>Payment</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <template v-for="row in paginatedRows" :key="row.po_number">
                                        <!-- Main Row -->
                                        <tr @click="toggleRow(row.po_number)" 
                                            class="rc-row" 
                                            :class="{'rc-row-err': isRowError(row), 'rc-row--expanded': expanded === row.po_number}">
                                            
                                            <td><strong>{{ row.supplier_name || row.supplier }}</strong></td>
                                            <td>
                                                <div style="display:flex; align-items:center; gap:8px;">
                                                    {{ row.po_number }}
                                                    <span class="rc-copy-btn" @click.stop="frappe.utils.copy_to_clipboard(row.po_number)" title="Copy ID">Copy</span>
                                                </div>
                                            </td>
                                            
                                            <td class="right text-muted">{{ amt(row.quotation_data?.grand_total) }}</td>
                                            <td class="right">{{ amt(row.po_data?.grand_total) }}</td>
                                            <td class="right"><strong>{{ amt(row.invoice_data?.combined_grand_total) }}</strong></td>
                                            <td class="right">
                                                <span :class="isIssueDiff(row.reconciliation?.grand_total_comparison?.pi_vs_po) ? 'text-red font-medium' : ''">
                                                    {{ diff(row.reconciliation?.grand_total_comparison?.pi_vs_po) }}
                                                </span>
                                            </td>
                                            <td class="center">
                                                <span v-html="statusIcon('amount', checkAmountMatch(row))"></span>
                                                <span v-html="statusIcon('quantity', checkQtyMatch(row))"></span>
                                                <span v-html="statusIcon('tax', checkTaxMatch(row))"></span>
                                            </td>
                                            <td>
                                                <span v-if="row.invoice_data" class="rc-badge" :class="{
                                                    'badge--ok': row.invoice_data.payment_status === 'Paid',
                                                    'badge--warn': row.invoice_data.payment_status === 'Partially Paid',
                                                    'badge--muted': row.invoice_data.payment_status === 'Unpaid'
                                                }">{{ row.invoice_data.payment_status }}</span>
                                                <span v-else class="text-muted">—</span>
                                            </td>
                                            <td>
                                                <span v-html="badge(row.reconciliation?.recon_status, row.status)"></span>
                                            </td>
                                        </tr>

                                        <!-- Expanded Details -->
                                        <tr v-if="expanded === row.po_number" class="rc-detail-row">
                                            <td colspan="8" class="rc-detail-cell">
                                                <div class="rc-drill">

                                                    <!-- Header strip with summary + action -->
                                                    <div class="rc-drill__header">
                                                        <div class="rc-drill__header-left">
                                                            <span class="rc-drill__po-id">{{ row.po_number }}</span>
                                                            <span v-html="badge(row.reconciliation?.recon_status, row.status)"></span>
                                                            <span v-if="row.reconciliation?.severity && row.reconciliation.severity !== 'INFO'" class="rc-drill__severity"
                                                                  :class="'rc-drill__severity--' + row.reconciliation.severity.toLowerCase()">
                                                                {{ row.reconciliation.severity }}
                                                            </span>
                                                        </div>
                                                        <div class="rc-drill__header-right">
                                                            <button class="btn btn-xs btn-default" @click.stop="copyDisputeNote(row)" style="display:inline-flex; align-items:center; gap:4px;">
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                                Copy Dispute Note
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <!-- Grand Total Comparison Strip -->
                                                    <div class="rc-drill__totals">
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PO Total</div>
                                                            <div class="rc-drill__total-value">{{ amt(row.po_data?.grand_total) }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item" v-if="row.quotation_data">
                                                            <div class="rc-drill__total-label">SQ Total</div>
                                                            <div class="rc-drill__total-value">{{ amt(row.quotation_data?.grand_total) }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Invoice Total</div>
                                                            <div class="rc-drill__total-value" :class="{'rc-drill__total-value--err': isIssueDiff(row.reconciliation?.grand_total_comparison?.pi_vs_po)}">
                                                                {{ amt(row.invoice_data?.combined_grand_total) }}
                                                            </div>
                                                        </div>
                                                        <div class="rc-drill__total-item rc-drill__total-item--diff">
                                                            <div class="rc-drill__total-label">Variance</div>
                                                            <div class="rc-drill__total-value" :class="isIssueDiff(row.reconciliation?.grand_total_comparison?.pi_vs_po) ? 'rc-drill__total-value--err' : 'rc-drill__total-value--ok'">
                                                                {{ diff(row.reconciliation?.grand_total_comparison?.pi_vs_po) }}
                                                            </div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PO Tax</div>
                                                            <div class="rc-drill__total-value" style="font-size: 13px;">{{ amt(row.po_data?.tax_total) }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PI Tax</div>
                                                            <div class="rc-drill__total-value" style="font-size: 13px;">{{ row.invoice_data ? amt(row.invoice_data.combined_grand_total - row.invoice_data.invoices.reduce((acc, i) => acc + i.net_total, 0)) : '\u2014' }}</div>
                                                        </div>
                                                    </div>

                                                    <!-- Item-Level Comparison Table -->
                                                    <div class="rc-drill__items">
                                                        <div class="rc-drill__items-title">Item-Level Comparison</div>
                                                        <table class="table rc-drill__tbl">
                                                            <thead>
                                                                <tr>
                                                                    <th>Item</th>
                                                                    <th class="right">PO Qty</th>
                                                                    <th class="right">PI Qty</th>
                                                                    <th class="right">PO Rate</th>
                                                                    <th class="right">PI Rate</th>
                                                                    <th class="right">PO Amt</th>
                                                                    <th class="right">PI Amt</th>
                                                                    <th class="right">Diff</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                <tr v-for="cmp in getItemComparison(row)" :key="cmp.item_code"
                                                                    :class="{'rc-drill__row--mismatch': cmp.hasMismatch, 'rc-drill__row--ok': !cmp.hasMismatch}">
                                                                    <td>
                                                                        <div style="font-weight: 600;">{{ cmp.item_name || cmp.item_code }}</div>
                                                                        <div v-if="cmp.variance_label" class="rc-drill__var-badge" :class="'rc-drill__var-badge--' + cmp.variance_class">
                                                                            {{ cmp.variance_label }}
                                                                        </div>
                                                                    </td>
                                                                    <td class="right">{{ cmp.po_qty != null ? cmp.po_qty : '\u2014' }}</td>
                                                                    <td class="right" :class="{'rc-drill__cell--diff': cmp.qty_diff}">
                                                                        {{ cmp.pi_qty != null ? cmp.pi_qty : '\u2014' }}
                                                                    </td>
                                                                    <td class="right">{{ cmp.po_rate != null ? amt(cmp.po_rate) : '\u2014' }}</td>
                                                                    <td class="right" :class="{'rc-drill__cell--diff': cmp.rate_diff}">
                                                                        {{ cmp.pi_rate != null ? amt(cmp.pi_rate) : '\u2014' }}
                                                                    </td>
                                                                    <td class="right">{{ cmp.po_amount != null ? amt(cmp.po_amount) : '\u2014' }}</td>
                                                                    <td class="right" :class="{'rc-drill__cell--diff': cmp.hasMismatch}">
                                                                        {{ cmp.pi_amount != null ? amt(cmp.pi_amount) : '\u2014' }}
                                                                    </td>
                                                                    <td class="right">
                                                                        <span v-if="cmp.amount_diff != null" :class="cmp.amount_diff > 0 ? 'text-red' : cmp.amount_diff < 0 ? 'text-green' : ''" style="font-weight:600;">
                                                                            {{ diff(cmp.amount_diff) }}
                                                                        </span>
                                                                        <span v-else class="text-muted">\u2014</span>
                                                                    </td>
                                                                </tr>
                                                                <tr v-if="!row.invoice_data">
                                                                    <td colspan="8" style="text-align:center; color: var(--text-muted); padding: 20px; font-style: italic;">No Purchase Invoice linked to this PO</td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <!-- Exception Details -->
                                                    <div v-if="row.reconciliation?.exceptions?.length > 0" class="rc-drill__exceptions">
                                                        <div class="rc-drill__items-title">Flagged Exceptions</div>
                                                        <div v-for="(exc, ei) in row.reconciliation.exceptions" :key="'exc'+ei" class="rc-drill__exc-item">
                                                            <div class="rc-drill__exc-icon" :class="'rc-drill__exc-icon--' + (exc.severity || 'INFO').toLowerCase()">
                                                                <svg v-if="exc.severity === 'CRITICAL'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                                                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                                            </div>
                                                            <div class="rc-drill__exc-content">
                                                                <div class="rc-drill__exc-desc">{{ exc.description }}</div>
                                                                <div class="rc-drill__exc-meta" v-if="exc.variance_amount">
                                                                    Variance: <strong>{{ amt(Math.abs(exc.variance_amount)) }}</strong>
                                                                    <span v-if="exc.variance_pct"> ({{ exc.variance_pct }}%)</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                </div>
                                            </td>
                                        </tr>
                                    </template>
                                </tbody>
                            </table>
                            
                            <!-- Pagination -->
                            <div class="rc-pagination" v-if="totalPages > 1 || filteredRows.length > 20" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <div>
                                    <button class="rc-btn" :disabled="txnPage === 1" @click="txnPage--">Prev</button>
                                    <span style="font-size: 13px; font-weight: 500; padding: 0 15px;">Page {{ txnPage }} of {{ totalPages }}</span>
                                    <button class="rc-btn" :disabled="txnPage === totalPages" @click="txnPage++">Next</button>
                                </div>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 20}" @click="perPage = 20">20</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 100}" @click="perPage = 100">100</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 500}" @click="perPage = 500">500</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 2500}" @click="perPage = 2500">2500</button>
                                </div>
                            </div>
                        </div>

                        <!-- ═══ ITEM LEVEL TABLE ═══ -->
                        <div class="rc-tbl-wrapper" v-if="viewLevel === 'item'">
                            <table class="table rc-tbl">
                                <thead>
                                    <tr>
                                        <th>Supplier</th>
                                        <th>PO Number</th>
                                        <th>Item</th>
                                        <th class="right">PO Qty</th>
                                        <th class="right">PO Rate</th>
                                        <th class="right">PO Amt</th>
                                        <th class="right">PI Qty</th>
                                        <th class="right">PI Rate</th>
                                        <th class="right">PI Amt</th>
                                        <th class="right">Diff</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <template v-for="(it, idx) in paginatedItemRows" :key="it.po_number + '-' + it.item_code + '-' + idx">
                                        <tr class="rc-row rc-row--clickable" :class="{'rc-row-err': it.hasMismatch, 'rc-row--expanded': expanded === it.po_number + '-' + it.item_code}" @click="toggleRow(it.po_number + '-' + it.item_code)">
                                            <td><strong>{{ it.supplier_name }}</strong></td>
                                            <td style="font-size: 12px;">{{ it.po_number }}</td>
                                            <td>
                                                <div style="font-weight: 600;">{{ it.item_name }}</div>
                                                <div v-if="it.variance_type" style="font-size: 10px; color: #ea580c; font-weight: 600; text-transform: uppercase;">{{ it.variance_type }}</div>
                                            </td>
                                            <td class="right">{{ it.po_qty }}</td>
                                            <td class="right">{{ amt(it.po_rate) }}</td>
                                            <td class="right">{{ amt(it.po_amount) }}</td>
                                            <td class="right" :class="{'rc-drill__cell--diff': it.pi_qty != null && it.pi_qty !== it.po_qty}">{{ it.pi_qty != null ? it.pi_qty : '\u2014' }}</td>
                                            <td class="right" :class="{'rc-drill__cell--diff': it.pi_rate != null && it.pi_rate !== it.po_rate}">{{ it.pi_rate != null ? amt(it.pi_rate) : '\u2014' }}</td>
                                            <td class="right" :class="{'rc-drill__cell--diff': it.hasMismatch}">{{ it.pi_amount != null ? amt(it.pi_amount) : '\u2014' }}</td>
                                            <td class="right">
                                                <span v-if="it.diff != null" :class="it.diff > 0 ? 'text-red font-medium' : it.diff < 0 ? 'text-green font-medium' : ''" style="font-weight:600;">
                                                    {{ diff(it.diff) }}
                                                </span>
                                                <span v-else class="text-muted">\u2014</span>
                                            </td>
                                            <td>
                                                <span v-html="badge(it.recon_status)"></span>
                                            </td>
                                        </tr>
                                        <tr v-if="expanded === it.po_number + '-' + it.item_code" class="rc-detail-row">
                                            <td colspan="11" class="rc-detail-cell">
                                                <div class="rc-drill">
                                                    <div class="rc-drill__header">
                                                        <div class="rc-drill__header-left">
                                                            <span class="rc-drill__po-id">PO: {{ it.po_number }}</span>
                                                            <span v-html="badge(it.recon_status)"></span>
                                                        </div>
                                                    </div>
                                                    <div class="rc-drill__totals">
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PO Qty</div>
                                                            <div class="rc-drill__total-value">{{ it.po_qty }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PI Qty</div>
                                                            <div class="rc-drill__total-value">{{ it.pi_qty != null ? it.pi_qty : '\u2014' }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PO Rate</div>
                                                            <div class="rc-drill__total-value">{{ amt(it.po_rate) }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PI Rate</div>
                                                            <div class="rc-drill__total-value">{{ it.pi_rate != null ? amt(it.pi_rate) : '\u2014' }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PO Amount</div>
                                                            <div class="rc-drill__total-value">{{ amt(it.po_amount) }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">PI Amount</div>
                                                            <div class="rc-drill__total-value">{{ it.pi_amount != null ? amt(it.pi_amount) : '\u2014' }}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    </template>
                                    <tr v-if="paginatedItemRows.length === 0">
                                        <td colspan="11" style="text-align:center; padding: 30px; color: var(--text-muted); font-style: italic;">No items match current filters</td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <!-- Item-level Pagination -->
                            <div class="rc-pagination" v-if="totalItemPages > 1 || filteredItemRows.length > 20" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <div>
                                    <button class="rc-btn" :disabled="itemPage === 1" @click="itemPage--">Prev</button>
                                    <span style="font-size: 13px; font-weight: 500; padding: 0 15px;">Page {{ itemPage }} of {{ totalItemPages }}</span>
                                    <button class="rc-btn" :disabled="itemPage === totalItemPages" @click="itemPage++">Next</button>
                                </div>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 20}" @click="perPage = 20">20</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 100}" @click="perPage = 100">100</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 500}" @click="perPage = 500">500</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 2500}" @click="perPage = 2500">2500</button>
                                </div>
                            </div>
                        </div>

                        <!-- ═══ SUPPLIER LEVEL TABLE ═══ -->
                        <div class="rc-tbl-wrapper" v-if="viewLevel === 'supplier'">
                            <table class="table rc-tbl">
                                <thead>
                                    <tr>
                                        <th>Supplier Name</th>
                                        <th class="right">Total POs</th>
                                        <th class="right">PO Value</th>
                                        <th class="right">PI Value</th>
                                        <th class="right">Net Variance</th>
                                        <th class="right">Exceptions</th>
                                        <th class="center">Rating Band</th>
                                        <th class="right">Rating Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <template v-for="(it, idx) in paginatedSupplierRows" :key="it.supplier + '-' + idx">
                                        <tr class="rc-row rc-row--clickable" :class="{'rc-row-err': it.rating < 70, 'rc-row--expanded': expanded === it.supplier}" @click="toggleRow(it.supplier)">
                                            <td>
                                                <div style="font-weight: 600;">{{ it.supplier_name }}</div>
                                                <div v-if="it.reason" style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">{{ it.reason }}</div>
                                            </td>
                                            <td class="right" style="font-weight: 500;">{{ it.total_pos }}</td>
                                            <td class="right">{{ amt(it.po_amount) }}</td>
                                            <td class="right">{{ amt(it.pi_amount) }}</td>
                                            <td class="right">
                                                <span :class="it.variance > 0 ? 'text-red font-medium' : it.variance < 0 ? 'text-green font-medium' : ''" style="font-weight:600;">
                                                    {{ diff(it.variance) }}
                                                </span>
                                            </td>
                                            <td class="right">
                                                <span v-if="it.exceptions > 0" class="rc-badge badge--err">{{ it.exceptions }}</span>
                                                <span v-else class="text-muted">\u2014</span>
                                            </td>
                                            <td class="center">
                                                <div :class="{
                                                    'text-green': it.rating >= 85,
                                                    'text-orange': it.rating >= 70 && it.rating < 85,
                                                    'text-red': it.rating < 70
                                                }" style="font-weight: 600;">{{ it.band }}</div>
                                                <div style="color: #fbbf24; font-size: 14px; letter-spacing: 2px; line-height: 1;">{{ it.stars }}</div>
                                            </td>
                                            <td class="right" style="font-weight: 700; font-size: 15px;" :class="{
                                                'text-green': it.rating >= 85,
                                                'text-orange': it.rating >= 70 && it.rating < 85,
                                                'text-red': it.rating < 70
                                            }">
                                                <div style="position: relative; display: inline-block; cursor: help;" title="See hover breakdown for details">
                                                    {{ it.rating }}
                                                    <!-- Scorecard Hover Box -->
                                                    <div class="rc-scorecard-hover" style="display: none; position: absolute; right: 0; bottom: 100%; margin-bottom: 8px; width: 260px; background: #fff; border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 12px; z-index: 100; text-align: left; font-size: 12px; color: var(--text-color); font-weight: 400;">
                                                        <div style="font-weight: 600; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--border-color);">Scorecard Breakdown</div>
                                                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Delivery Score:</span> <span style="font-weight: 600">{{ it.scores?.delivery }}</span></div>
                                                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Delay Penalty:</span> <span style="font-weight: 600">{{ it.scores?.delay }}</span></div>
                                                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Quality Score:</span> <span style="font-weight: 600">{{ it.scores?.quality }}</span></div>
                                                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Rejection Penalty:</span> <span style="font-weight: 600">{{ it.scores?.rejection }}</span></div>
                                                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>RFQ Response:</span> <span style="font-weight: 600">{{ it.scores?.rfq }}</span></div>
                                                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Cost Performance:</span> <span style="font-weight: 600">{{ it.scores?.cost }}</span></div>
                                                        <div style="display: flex; justify-content: space-between;"><span>Fulfillment Score:</span> <span style="font-weight: 600">{{ it.scores?.fulfillment }}</span></div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr v-if="expanded === it.supplier" class="rc-detail-row">
                                            <td colspan="8" class="rc-detail-cell">
                                                <div class="rc-drill">
                                                    <div class="rc-drill__header">
                                                        <div class="rc-drill__header-left">
                                                            <span class="rc-drill__po-id">{{ it.supplier_name }} Scorecard Breakdown</span>
                                                        </div>
                                                    </div>
                                                    <div class="rc-drill__totals">
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Delivery Score</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.delivery }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Delay Penalty</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.delay }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Quality Score</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.quality }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Rejection Penalty</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.rejection }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">RFQ Response</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.rfq }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Cost Performance</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.cost }}</div>
                                                        </div>
                                                        <div class="rc-drill__total-item">
                                                            <div class="rc-drill__total-label">Fulfillment Score</div>
                                                            <div class="rc-drill__total-value">{{ it.scores?.fulfillment }}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    </template>
                                    <tr v-if="paginatedSupplierRows.length === 0">
                                        <td colspan="8" style="text-align:center; padding: 30px; color: var(--text-muted); font-style: italic;">No suppliers match current filters</td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <!-- Supplier-level Pagination -->
                            <div class="rc-pagination" v-if="totalSupplierPages > 1 || filteredSupplierRows.length > 20" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <div>
                                    <button class="rc-btn" :disabled="supplierPage === 1" @click="supplierPage--">Prev</button>
                                    <span style="font-size: 13px; font-weight: 500; padding: 0 15px;">Page {{ supplierPage }} of {{ totalSupplierPages }}</span>
                                    <button class="rc-btn" :disabled="supplierPage === totalSupplierPages" @click="supplierPage++">Next</button>
                                </div>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 20}" @click="perPage = 20">20</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 100}" @click="perPage = 100">100</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 500}" @click="perPage = 500">500</button>
                                    <button type="button" class="btn btn-default btn-xs" :class="{active: perPage === 2500}" @click="perPage = 2500">2500</button>
                                </div>
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
        `
    });

    app.mount("#recon-app");
}
