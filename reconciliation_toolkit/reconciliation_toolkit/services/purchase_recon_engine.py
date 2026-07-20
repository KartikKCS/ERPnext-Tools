"""
Purchase Reconciliation Engine

Fetches Purchase Order (PO) records within a date range and links them
to their upstream Supplier Quotation (SQ) and downstream Purchase
Invoice (PI) documents, producing a hierarchical reconciliation
data structure with financial matching and exception flagging.

Document Linking Model:
    PO → SQ:  via Purchase Order Item.supplier_quotation
    PI → PO:  via Purchase Invoice Item.purchase_order
    PO → SQ:  also via Purchase Order.ref_sq (parent-level shortcut)

Linkage Status Classification:
    FULLY_LINKED              — SQ + PO + PI all present
    MISSING_SQ                — PO without upstream Supplier Quotation
    PENDING_INVOICE           — PO without downstream Purchase Invoice
    PARTIAL_INVOICE           — PO partially invoiced (per_billed < 100)
    MISSING_SQ_PENDING_INVOICE — Both SQ and PI missing
    MISSING_SQ_PARTIAL_INVOICE — SQ missing + partially invoiced

Reconciliation Status (Financial Matching):
    MATCHED                   — All totals match within tolerance
    OVERCHARGED               — PI grand total exceeds PO/SQ total
    PRICE_VARIANCE            — Item-level rate differences detected
    QTY_VARIANCE              — Item-level quantity differences detected
    FAVORABLE_VARIANCE        — PI total is LESS than PO/SQ (savings)
    VARIANCE_FLAGGED          — Generic flag when PI > PO/SQ
    NOT_RECONCILABLE          — Missing PI or PO data prevents comparison
"""

import frappe
from frappe.utils import flt, getdate
from collections import defaultdict


# ─────────────────────────────────────────────
# Constants & Status Codes
# ─────────────────────────────────────────────

# Linkage statuses (document presence)
STATUS_FULLY_LINKED = "FULLY_LINKED"
STATUS_MISSING_SQ = "MISSING_SQ"
STATUS_PENDING_INVOICE = "PENDING_INVOICE"
STATUS_PARTIAL_INVOICE = "PARTIAL_INVOICE"
STATUS_MISSING_SQ_PENDING_INVOICE = "MISSING_SQ_PENDING_INVOICE"
STATUS_MISSING_SQ_PARTIAL_INVOICE = "MISSING_SQ_PARTIAL_INVOICE"

# Reconciliation statuses (financial matching)
RECON_MATCHED = "MATCHED"
RECON_OVERCHARGED = "OVERCHARGED"
RECON_PRICE_VARIANCE = "PRICE_VARIANCE"
RECON_QTY_VARIANCE = "QTY_VARIANCE"
RECON_FAVORABLE_VARIANCE = "FAVORABLE_VARIANCE"
RECON_VARIANCE_FLAGGED = "VARIANCE_FLAGGED"
RECON_NOT_RECONCILABLE = "NOT_RECONCILABLE"

# Exception severity levels for management review
SEVERITY_CRITICAL = "CRITICAL"    # Overcharge exceeding tolerance
SEVERITY_HIGH = "HIGH"            # Price variance on high-value items
SEVERITY_MEDIUM = "MEDIUM"        # Quantity discrepancies
SEVERITY_LOW = "LOW"              # Favorable variances (savings)
SEVERITY_INFO = "INFO"            # Informational (minor rounding diffs)

# Fields to fetch from each doctype
PO_FIELDS = [
    "name", "supplier", "supplier_name", "grand_total", "net_total",
    "total_taxes_and_charges", "status", "per_billed", "per_received",
    "transaction_date", "currency", "ref_sq", "docstatus",
]

PO_ITEM_FIELDS = [
    "name", "item_code", "item_name", "qty", "rate", "amount",
    "supplier_quotation", "supplier_quotation_item", "uom",
    "net_amount", "base_amount",
]

SQ_FIELDS = [
    "name", "supplier", "supplier_name", "grand_total", "net_total",
    "total_taxes_and_charges", "status", "transaction_date", "currency",
    "docstatus",
]

SQ_ITEM_FIELDS = [
    "name", "item_code", "item_name", "qty", "rate", "amount",
    "uom", "net_amount",
]

PI_FIELDS = [
    "name", "supplier", "supplier_name", "grand_total", "net_total",
    "total_taxes_and_charges", "status", "posting_date",
    "outstanding_amount", "currency", "docstatus",
]

PI_ITEM_FIELDS = [
    "name", "item_code", "item_name", "qty", "rate", "amount",
    "purchase_order", "po_detail", "uom", "net_amount",
]


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _round2(val):
    """Round to 2 decimal places."""
    return round(flt(val), 2)


def _safe_float(val, default=0.0):
    """Safely convert to float."""
    return flt(val) if val is not None else default


def _amounts_match(a, b, tolerance=1.0):
    """Check if two amounts match within tolerance."""
    return abs(_round2(a) - _round2(b)) <= tolerance


def _is_draft(doc):
    """Check if a Frappe document is a draft (docstatus == 0)."""
    return doc.get("docstatus", 0) == 0


def _doc_label(doc):
    """Return 'Draft' or 'Submitted' label for a document."""
    return "Draft" if _is_draft(doc) else "Submitted"


# ─────────────────────────────────────────────
# Data Extraction — Purchase Orders
# ─────────────────────────────────────────────

def fetch_purchase_orders(from_date, to_date, company=None):
    """
    Fetch all Purchase Orders within the given date range.

    Includes both submitted (docstatus=1) and draft (docstatus=0) POs.
    Cancelled POs (docstatus=2) are excluded.

    Args:
        from_date: Start date (inclusive) for transaction_date filter.
        to_date: End date (inclusive) for transaction_date filter.
        company: Optional company to filter by.

    Returns:
        list[dict]: Each dict contains PO parent fields plus an 'items' key
                    with the child Purchase Order Item rows.
    """
    filters = {
        "transaction_date": ["between", [getdate(from_date), getdate(to_date)]],
        "docstatus": ["in", [0, 1]],  # Draft + Submitted; exclude Cancelled
    }
    if company:
        filters["company"] = company

    po_list = frappe.get_all(
        "Purchase Order",
        filters=filters,
        fields=PO_FIELDS,
        order_by="transaction_date asc, name asc",
    )

    if not po_list:
        return []

    # Batch-fetch all PO items for the matched POs
    po_names = [po["name"] for po in po_list]
    all_po_items = frappe.get_all(
        "Purchase Order Item",
        filters={"parent": ["in", po_names]},
        fields=PO_ITEM_FIELDS + ["parent"],
        order_by="parent asc, idx asc",
    )

    # Index items by parent PO
    items_by_po = defaultdict(list)
    for item in all_po_items:
        items_by_po[item["parent"]].append(item)

    for po in po_list:
        po["items"] = items_by_po.get(po["name"], [])
        po["is_draft"] = _is_draft(po)

    return po_list


# ─────────────────────────────────────────────
# Upstream Linkage — Supplier Quotations
# ─────────────────────────────────────────────

def _resolve_supplier_quotations(po_doc):
    """
    Resolve linked Supplier Quotation(s) for a Purchase Order.

    Uses item-level `supplier_quotation` fields to discover all linked SQs,
    and also checks the parent-level `ref_sq` shortcut.

    Fetches ALL linked SQs regardless of their own dates.
    Includes both draft and submitted SQs (excludes cancelled).

    Args:
        po_doc: A Purchase Order dict with 'items' loaded.

    Returns:
        dict with two keys:
            - 'primary': The primary SQ data (first found / ref_sq), or None.
            - 'all': List of all distinct SQ data dicts, or [].
    """
    # Collect unique SQ names from item-level links
    sq_names_from_items = set()
    for item in po_doc.get("items", []):
        sq_name = item.get("supplier_quotation")
        if sq_name:
            sq_names_from_items.add(sq_name)

    # Also check parent-level ref_sq
    ref_sq = po_doc.get("ref_sq")
    if ref_sq:
        sq_names_from_items.add(ref_sq)

    if not sq_names_from_items:
        return {"primary": None, "all": []}

    # Batch-fetch SQ parent docs (exclude cancelled)
    sq_docs = frappe.get_all(
        "Supplier Quotation",
        filters={
            "name": ["in", list(sq_names_from_items)],
            "docstatus": ["in", [0, 1]],
        },
        fields=SQ_FIELDS,
    )

    if not sq_docs:
        return {"primary": None, "all": []}

    # Batch-fetch SQ items
    sq_names_found = [sq["name"] for sq in sq_docs]
    all_sq_items = frappe.get_all(
        "Supplier Quotation Item",
        filters={"parent": ["in", sq_names_found]},
        fields=SQ_ITEM_FIELDS + ["parent"],
        order_by="parent asc, idx asc",
    )

    items_by_sq = defaultdict(list)
    for item in all_sq_items:
        items_by_sq[item["parent"]].append(item)

    sq_data_list = []
    for sq in sq_docs:
        sq_data = {
            "sq_number": sq["name"],
            "supplier": sq.get("supplier"),
            "supplier_name": sq.get("supplier_name"),
            "grand_total": _round2(sq.get("grand_total")),
            "net_total": _round2(sq.get("net_total")),
            "tax_total": _round2(sq.get("total_taxes_and_charges")),
            "status": sq.get("status"),
            "transaction_date": str(sq.get("transaction_date") or ""),
            "currency": sq.get("currency"),
            "is_draft": _is_draft(sq),
            "doc_status": _doc_label(sq),
            "items": _format_items(items_by_sq.get(sq["name"], [])),
        }
        sq_data_list.append(sq_data)

    # Determine primary: prefer ref_sq if it exists in fetched docs, else first
    primary = None
    if ref_sq:
        primary = next((sq for sq in sq_data_list if sq["sq_number"] == ref_sq), None)
    if not primary and sq_data_list:
        primary = sq_data_list[0]

    return {"primary": primary, "all": sq_data_list}


# ─────────────────────────────────────────────
# Downstream Linkage — Purchase Invoices
# ─────────────────────────────────────────────

def _resolve_purchase_invoices(po_name):
    """
    Resolve linked Purchase Invoice(s) for a Purchase Order.

    Uses Purchase Invoice Item.purchase_order to discover PIs that
    reference this PO. Fetches ALL linked PIs regardless of their
    own dates.

    Includes both draft and submitted PIs (excludes cancelled).

    Args:
        po_name: The Purchase Order name (e.g. 'PUR-ORD-2026-00001').

    Returns:
        dict or None:
            - If PIs found: dict with 'invoices' list and 'combined_grand_total'.
            - If no PIs found: None.
    """
    # Find PI items that reference this PO
    pi_items_linked = frappe.get_all(
        "Purchase Invoice Item",
        filters={
            "purchase_order": po_name,
            "docstatus": ["in", [0, 1]],
        },
        fields=["parent"],
        group_by="parent",
    )

    if not pi_items_linked:
        return None

    pi_names = list({item["parent"] for item in pi_items_linked})

    # Fetch PI parent docs (exclude cancelled)
    pi_docs = frappe.get_all(
        "Purchase Invoice",
        filters={
            "name": ["in", pi_names],
            "docstatus": ["in", [0, 1]],
        },
        fields=PI_FIELDS,
    )

    if not pi_docs:
        return None

    # Batch-fetch all PI items (only those linked to this PO)
    pi_names_found = [pi["name"] for pi in pi_docs]
    all_pi_items = frappe.get_all(
        "Purchase Invoice Item",
        filters={
            "parent": ["in", pi_names_found],
            "purchase_order": po_name,
        },
        fields=PI_ITEM_FIELDS + ["parent"],
        order_by="parent asc, idx asc",
    )

    items_by_pi = defaultdict(list)
    for item in all_pi_items:
        items_by_pi[item["parent"]].append(item)

    invoices = []
    combined_grand_total = 0.0

    for pi in pi_docs:
        pi_data = {
            "pi_number": pi["name"],
            "supplier": pi.get("supplier"),
            "supplier_name": pi.get("supplier_name"),
            "grand_total": _round2(pi.get("grand_total")),
            "net_total": _round2(pi.get("net_total")),
            "tax_total": _round2(pi.get("total_taxes_and_charges")),
            "status": pi.get("status"),
            "posting_date": str(pi.get("posting_date") or ""),
            "outstanding_amount": _round2(pi.get("outstanding_amount")),
            "currency": pi.get("currency"),
            "is_draft": _is_draft(pi),
            "doc_status": _doc_label(pi),
            "items": _format_items(items_by_pi.get(pi["name"], [])),
        }
        invoices.append(pi_data)
        combined_grand_total += _safe_float(pi.get("grand_total"))

    return {
        "invoices": invoices,
        "combined_grand_total": _round2(combined_grand_total),
    }


# ─────────────────────────────────────────────
# Item Formatter
# ─────────────────────────────────────────────

def _format_items(raw_items):
    """
    Normalize item rows into a clean, consistent structure.

    Args:
        raw_items: List of child-table item dicts from frappe.get_all.

    Returns:
        list[dict]: Cleaned item dicts.
    """
    formatted = []
    for item in raw_items:
        formatted.append({
            "item_code": item.get("item_code"),
            "item_name": item.get("item_name"),
            "qty": _safe_float(item.get("qty")),
            "rate": _round2(item.get("rate")),
            "amount": _round2(item.get("amount")),
            "uom": item.get("uom", ""),
            "net_amount": _round2(item.get("net_amount")),
        })
    return formatted


# ─────────────────────────────────────────────
# Status Classification
# ─────────────────────────────────────────────

def _classify_status(sq_result, pi_result, po_doc):
    """
    Classify the reconciliation status of a PO transaction group.

    Args:
        sq_result: Result from _resolve_supplier_quotations (dict with 'primary'/'all').
        pi_result: Result from _resolve_purchase_invoices (dict or None).
        po_doc: The Purchase Order dict.

    Returns:
        str: One of the STATUS_* constants.
    """
    has_sq = sq_result["primary"] is not None
    has_pi = pi_result is not None

    if has_sq and has_pi:
        per_billed = _safe_float(po_doc.get("per_billed"))
        if per_billed < 100:
            return STATUS_PARTIAL_INVOICE
        return STATUS_FULLY_LINKED

    if not has_sq and not has_pi:
        return STATUS_MISSING_SQ_PENDING_INVOICE

    if not has_sq and has_pi:
        per_billed = _safe_float(po_doc.get("per_billed"))
        if per_billed < 100:
            return STATUS_MISSING_SQ_PARTIAL_INVOICE
        return STATUS_MISSING_SQ

    # has_sq and not has_pi
    return STATUS_PENDING_INVOICE


# ─────────────────────────────────────────────
# Variance Computation
# ─────────────────────────────────────────────

def _compute_variance(sq_result, po_doc, pi_result):
    """
    Compute amount variances across the SQ → PO → PI chain.

    Uses the primary SQ for SQ comparisons.

    Args:
        sq_result: Result from _resolve_supplier_quotations.
        po_doc: The Purchase Order dict.
        pi_result: Result from _resolve_purchase_invoices (dict or None).

    Returns:
        dict: Variance amounts for sq_to_po, po_to_pi, and sq_to_pi.
              Values are None when the corresponding document is missing.
    """
    po_total = _safe_float(po_doc.get("grand_total"))
    primary_sq = sq_result.get("primary")
    sq_total = _safe_float(primary_sq.get("grand_total")) if primary_sq else None
    pi_total = _safe_float(pi_result.get("combined_grand_total")) if pi_result else None

    variance = {
        "sq_to_po": None,
        "po_to_pi": None,
        "sq_to_pi": None,
    }

    if sq_total is not None:
        variance["sq_to_po"] = _round2(po_total - sq_total)

    if pi_total is not None:
        variance["po_to_pi"] = _round2(pi_total - po_total)

    if sq_total is not None and pi_total is not None:
        variance["sq_to_pi"] = _round2(pi_total - sq_total)

    return variance


# ─────────────────────────────────────────────
# Item-Level Comparison
# ─────────────────────────────────────────────

def _compare_items(source_items, target_items, source_label, target_label):
    """
    Compare items between two document levels by item_code.

    Matches items by item_code and detects rate and quantity
    differences. Items present in only one side are flagged.

    Args:
        source_items: Items from the baseline document (e.g. PO items).
        target_items: Items from the comparison document (e.g. PI items).
        source_label: Label for the source (e.g. 'po', 'sq').
        target_label: Label for the target (e.g. 'pi').

    Returns:
        list[dict]: List of item-level discrepancy records.
    """
    # Index items by item_code — aggregate if same code appears multiple times
    def _aggregate(items):
        agg = {}
        for item in items:
            code = item.get("item_code", "")
            if code in agg:
                agg[code]["qty"] += _safe_float(item.get("qty"))
                agg[code]["amount"] += _safe_float(item.get("amount"))
                agg[code]["net_amount"] += _safe_float(item.get("net_amount"))
            else:
                agg[code] = {
                    "item_code": code,
                    "item_name": item.get("item_name", ""),
                    "qty": _safe_float(item.get("qty")),
                    "rate": _safe_float(item.get("rate")),
                    "amount": _safe_float(item.get("amount")),
                    "net_amount": _safe_float(item.get("net_amount")),
                    "uom": item.get("uom", ""),
                }
        return agg

    source_agg = _aggregate(source_items)
    target_agg = _aggregate(target_items)

    all_codes = sorted(set(list(source_agg.keys()) + list(target_agg.keys())))
    discrepancies = []

    for code in all_codes:
        src = source_agg.get(code)
        tgt = target_agg.get(code)

        if src and tgt:
            rate_diff = _round2(tgt["rate"] - src["rate"])
            qty_diff = _round2(tgt["qty"] - src["qty"])
            amount_diff = _round2(tgt["amount"] - src["amount"])

            if rate_diff != 0 or qty_diff != 0:
                discrepancies.append({
                    "item_code": code,
                    "item_name": src.get("item_name") or tgt.get("item_name"),
                    f"{source_label}_rate": _round2(src["rate"]),
                    f"{target_label}_rate": _round2(tgt["rate"]),
                    "rate_diff": rate_diff,
                    f"{source_label}_qty": _round2(src["qty"]),
                    f"{target_label}_qty": _round2(tgt["qty"]),
                    "qty_diff": qty_diff,
                    f"{source_label}_amount": _round2(src["amount"]),
                    f"{target_label}_amount": _round2(tgt["amount"]),
                    "amount_diff": amount_diff,
                    "variance_type": "RATE" if rate_diff != 0 else "QTY",
                })

        elif src and not tgt:
            discrepancies.append({
                "item_code": code,
                "item_name": src.get("item_name"),
                f"{source_label}_rate": _round2(src["rate"]),
                f"{target_label}_rate": None,
                "rate_diff": None,
                f"{source_label}_qty": _round2(src["qty"]),
                f"{target_label}_qty": None,
                "qty_diff": None,
                f"{source_label}_amount": _round2(src["amount"]),
                f"{target_label}_amount": None,
                "amount_diff": None,
                "variance_type": f"MISSING_IN_{target_label.upper()}",
            })

        elif tgt and not src:
            discrepancies.append({
                "item_code": code,
                "item_name": tgt.get("item_name"),
                f"{source_label}_rate": None,
                f"{target_label}_rate": _round2(tgt["rate"]),
                "rate_diff": None,
                f"{source_label}_qty": None,
                f"{target_label}_qty": _round2(tgt["qty"]),
                "qty_diff": None,
                f"{source_label}_amount": None,
                f"{target_label}_amount": _round2(tgt["amount"]),
                "amount_diff": None,
                "variance_type": f"MISSING_IN_{source_label.upper()}",
            })

    return discrepancies


# ─────────────────────────────────────────────
# Transaction Reconciliation (Core Matching)
# ─────────────────────────────────────────────

def _recon_transaction(transaction_group, tolerance=1.0):
    """
    Compare financial totals across the SQ, PO, and PI for a single
    transaction group. Flags variances for senior management review.

    Performs two levels of comparison:
        1. Grand Total Level — PI vs PO, PI vs SQ, PO vs SQ
        2. Item Level — unit rates and quantities (drills down only
           when a grand-total mismatch is detected)

    Exception Flagging:
        - OVERCHARGED:        PI total exceeds PO/SQ by more than tolerance
        - PRICE_VARIANCE:     Item-level rate differences detected
        - QTY_VARIANCE:       Item-level quantity differences detected
        - FAVORABLE_VARIANCE: PI total is LESS than PO/SQ (savings)
        - VARIANCE_FLAGGED:   Generic flag when PI > PO/SQ
        - MATCHED:            All totals match within tolerance
        - NOT_RECONCILABLE:   Missing PI data prevents comparison

    Args:
        transaction_group: A hierarchical transaction group dict as
                           produced by _build_transaction_group().
        tolerance: Amount tolerance in currency units (default ₹1).

    Returns:
        dict: Reconciliation result with keys:
            - recon_status: One of the RECON_* constants
            - severity: Exception severity level
            - grand_total_comparison: Dict with PO/SQ/PI totals and diffs
            - item_discrepancies: List of item-level differences (if any)
            - exceptions: List of exception records for management
            - is_flagged: bool — True if any exception requires review
    """
    po_data = transaction_group.get("po_data", {})
    sq_data = transaction_group.get("quotation_data")  # primary SQ
    pi_data = transaction_group.get("invoice_data")
    linkage_status = transaction_group.get("status", "")

    po_total = _safe_float(po_data.get("grand_total"))
    sq_total = _safe_float(sq_data.get("grand_total")) if sq_data else None
    pi_total = _safe_float(pi_data.get("combined_grand_total")) if pi_data else None

    # ── Build grand-total comparison ──
    grand_total_comparison = {
        "po_grand_total": _round2(po_total),
        "sq_grand_total": _round2(sq_total) if sq_total is not None else None,
        "pi_grand_total": _round2(pi_total) if pi_total is not None else None,
        "pi_vs_po": _round2(pi_total - po_total) if pi_total is not None else None,
        "pi_vs_sq": _round2(pi_total - sq_total) if (pi_total is not None and sq_total is not None) else None,
        "po_vs_sq": _round2(po_total - sq_total) if sq_total is not None else None,
        "pi_vs_po_match": _amounts_match(pi_total, po_total, tolerance) if pi_total is not None else None,
        "pi_vs_sq_match": _amounts_match(pi_total, sq_total, tolerance) if (pi_total is not None and sq_total is not None) else None,
        "po_vs_sq_match": _amounts_match(po_total, sq_total, tolerance) if sq_total is not None else None,
    }

    # ── Handle cases where reconciliation is not possible ──
    if pi_total is None:
        return {
            "recon_status": RECON_NOT_RECONCILABLE,
            "severity": SEVERITY_INFO,
            "reason": "No Purchase Invoice linked — cannot reconcile financials",
            "grand_total_comparison": grand_total_comparison,
            "item_discrepancies": [],
            "exceptions": [],
            "is_flagged": False,
        }

    # ── Grand-Total Level Matching ──
    pi_vs_po_diff = _round2(pi_total - po_total)
    pi_vs_sq_diff = _round2(pi_total - sq_total) if sq_total is not None else None

    # Determine the primary reference total (prefer SQ if available, else PO)
    ref_total = sq_total if sq_total is not None else po_total
    ref_label = "SQ" if sq_total is not None else "PO"
    pi_vs_ref_diff = _round2(pi_total - ref_total)

    exceptions = []
    item_discrepancies = []
    recon_status = RECON_MATCHED
    severity = SEVERITY_INFO

    # Check if grand totals match
    totals_match_po = _amounts_match(pi_total, po_total, tolerance)
    totals_match_sq = _amounts_match(pi_total, sq_total, tolerance) if sq_total is not None else True

    if totals_match_po and totals_match_sq:
        # ── MATCHED ──
        recon_status = RECON_MATCHED
        severity = SEVERITY_INFO
    else:
        # ── Grand total mismatch — drill into item-level ──

        # Collect all PI items (flattened from all invoices)
        pi_all_items = []
        if pi_data and pi_data.get("invoices"):
            for inv in pi_data["invoices"]:
                pi_all_items.extend(inv.get("items", []))

        po_items = po_data.get("items", [])
        sq_items = sq_data.get("items", []) if sq_data else []

        # Item comparison: PI vs PO
        pi_vs_po_items = _compare_items(po_items, pi_all_items, "po", "pi")

        # Item comparison: PI vs SQ (only if SQ exists)
        pi_vs_sq_items = []
        if sq_data:
            pi_vs_sq_items = _compare_items(sq_items, pi_all_items, "sq", "pi")

        item_discrepancies = {
            "pi_vs_po": pi_vs_po_items,
            "pi_vs_sq": pi_vs_sq_items,
        }

        # Classify the rate vs qty nature of discrepancies
        has_rate_variance = any(
            d.get("variance_type") == "RATE"
            for d in pi_vs_po_items + pi_vs_sq_items
        )
        has_qty_variance = any(
            d.get("variance_type") == "QTY"
            for d in pi_vs_po_items + pi_vs_sq_items
        )

        # ── Classify exception type ──
        if pi_vs_ref_diff > tolerance:
            # Invoice EXCEEDS the reference (overcharged)
            if pi_vs_ref_diff > ref_total * 0.10:
                # More than 10% over — CRITICAL
                severity = SEVERITY_CRITICAL
            elif pi_vs_ref_diff > ref_total * 0.02:
                # 2-10% over — HIGH
                severity = SEVERITY_HIGH
            else:
                severity = SEVERITY_MEDIUM

            recon_status = RECON_OVERCHARGED

            exceptions.append({
                "exception_type": RECON_OVERCHARGED,
                "severity": severity,
                "po_number": transaction_group.get("po_number"),
                "supplier": transaction_group.get("supplier_name"),
                "reference_total": _round2(ref_total),
                "reference_doc": ref_label,
                "invoice_total": _round2(pi_total),
                "variance_amount": _round2(pi_vs_ref_diff),
                "variance_pct": _round2((pi_vs_ref_diff / ref_total) * 100) if ref_total else 0,
                "description": (
                    f"Invoice total (₹{_round2(pi_total):,.2f}) exceeds "
                    f"{ref_label} total (₹{_round2(ref_total):,.2f}) "
                    f"by ₹{_round2(pi_vs_ref_diff):,.2f}"
                ),
            })

        elif pi_vs_ref_diff < -tolerance:
            # Invoice is LESS than reference (favorable)
            severity = SEVERITY_LOW
            recon_status = RECON_FAVORABLE_VARIANCE

            exceptions.append({
                "exception_type": RECON_FAVORABLE_VARIANCE,
                "severity": severity,
                "po_number": transaction_group.get("po_number"),
                "supplier": transaction_group.get("supplier_name"),
                "reference_total": _round2(ref_total),
                "reference_doc": ref_label,
                "invoice_total": _round2(pi_total),
                "variance_amount": _round2(pi_vs_ref_diff),
                "variance_pct": _round2((pi_vs_ref_diff / ref_total) * 100) if ref_total else 0,
                "description": (
                    f"Invoice total (₹{_round2(pi_total):,.2f}) is below "
                    f"{ref_label} total (₹{_round2(ref_total):,.2f}) "
                    f"by ₹{_round2(abs(pi_vs_ref_diff)):,.2f} — favorable variance"
                ),
            })

        # Layer on item-level exception detail
        if has_rate_variance:
            if recon_status == RECON_MATCHED:
                recon_status = RECON_PRICE_VARIANCE
                severity = SEVERITY_HIGH

            seen_rate_items = set()
            for disc in pi_vs_po_items + pi_vs_sq_items:
                if disc.get("variance_type") == "RATE" and disc.get("rate_diff", 0) != 0:
                    if disc["item_code"] not in seen_rate_items:
                        seen_rate_items.add(disc["item_code"])
                        exceptions.append({
                            "exception_type": RECON_PRICE_VARIANCE,
                            "severity": SEVERITY_HIGH,
                            "po_number": transaction_group.get("po_number"),
                            "supplier": transaction_group.get("supplier_name"),
                            "item_code": disc["item_code"],
                            "item_name": disc.get("item_name"),
                            "rate_diff": disc["rate_diff"],
                            "description": (
                                f"Rate variance on {disc['item_code']}: "
                                f"₹{disc.get('rate_diff', 0):,.2f} difference"
                            ),
                        })

        if has_qty_variance:
            if recon_status == RECON_MATCHED:
                recon_status = RECON_QTY_VARIANCE
                severity = SEVERITY_MEDIUM

            seen_qty_items = set()
            for disc in pi_vs_po_items + pi_vs_sq_items:
                if disc.get("variance_type") == "QTY" and disc.get("qty_diff", 0) != 0:
                    if disc["item_code"] not in seen_qty_items:
                        seen_qty_items.add(disc["item_code"])
                        exceptions.append({
                            "exception_type": RECON_QTY_VARIANCE,
                            "severity": SEVERITY_MEDIUM,
                            "po_number": transaction_group.get("po_number"),
                            "supplier": transaction_group.get("supplier_name"),
                            "item_code": disc["item_code"],
                            "item_name": disc.get("item_name"),
                            "qty_diff": disc["qty_diff"],
                            "description": (
                                f"Quantity variance on {disc['item_code']}: "
                                f"{disc.get('qty_diff', 0):,.2f} units difference"
                            ),
                        })

        # If we still haven't classified, use generic VARIANCE_FLAGGED
        if recon_status == RECON_MATCHED and not totals_match_po:
            recon_status = RECON_VARIANCE_FLAGGED
            severity = SEVERITY_MEDIUM
            exceptions.append({
                "exception_type": RECON_VARIANCE_FLAGGED,
                "severity": severity,
                "po_number": transaction_group.get("po_number"),
                "supplier": transaction_group.get("supplier_name"),
                "reference_total": _round2(po_total),
                "invoice_total": _round2(pi_total),
                "variance_amount": _round2(pi_vs_po_diff),
                "description": (
                    f"Grand total mismatch: PO ₹{_round2(po_total):,.2f} "
                    f"vs PI ₹{_round2(pi_total):,.2f}"
                ),
            })

    return {
        "recon_status": recon_status,
        "severity": severity,
        "grand_total_comparison": grand_total_comparison,
        "item_discrepancies": item_discrepancies,
        "exceptions": exceptions,
        "is_flagged": len(exceptions) > 0,
    }


# ─────────────────────────────────────────────
# Hierarchical Structure Builder
# ─────────────────────────────────────────────

def _build_transaction_group(po_doc, sq_result, pi_result, tolerance=1.0):
    """
    Assemble the full hierarchical data structure for a single
    PO transaction group, including reconciliation results.

    Args:
        po_doc: Purchase Order dict with 'items' loaded.
        sq_result: Result from _resolve_supplier_quotations.
        pi_result: Result from _resolve_purchase_invoices (dict or None).
        tolerance: Amount tolerance in currency units.

    Returns:
        dict: The hierarchical transaction group with reconciliation.
    """
    status = _classify_status(sq_result, pi_result, po_doc)
    variance = _compute_variance(sq_result, po_doc, pi_result)

    group = {
        "po_number": po_doc["name"],
        "supplier": po_doc.get("supplier"),
        "supplier_name": po_doc.get("supplier_name"),
        "transaction_date": str(po_doc.get("transaction_date") or ""),
        "currency": po_doc.get("currency"),
        "status": status,
        "po_is_draft": po_doc.get("is_draft", False),
        "po_doc_status": _doc_label(po_doc),

        # ── PO Data ──
        "po_data": {
            "grand_total": _round2(po_doc.get("grand_total")),
            "net_total": _round2(po_doc.get("net_total")),
            "tax_total": _round2(po_doc.get("total_taxes_and_charges")),
            "per_billed": _round2(po_doc.get("per_billed")),
            "per_received": _round2(po_doc.get("per_received")),
            "po_status": po_doc.get("status"),
            "items": _format_items(po_doc.get("items", [])),
        },

        # ── Quotation Data ──
        # Primary SQ for simple access; all SQs listed separately
        "quotation_data": sq_result.get("primary"),
        "all_quotations": sq_result.get("all", []),

        # ── Invoice Data ──
        "invoice_data": pi_result,

        # ── Variance ──
        "variance": variance,

        # ── Reconciliation (placeholder, filled below) ──
        "reconciliation": None,
    }

    # Run financial reconciliation
    group["reconciliation"] = _recon_transaction(group, tolerance)

    return group


# ─────────────────────────────────────────────
# Summary Builder
# ─────────────────────────────────────────────

def _build_supplier_scorecards(transaction_groups, from_date, to_date):
    import erpnext.buying.doctype.supplier_scorecard_variable.supplier_scorecard_variable as ssv
    from frappe import _dict

    suppliers = set()
    for grp in transaction_groups:
        if grp.get("supplier"):
            suppliers.add(grp.get("supplier"))
            
    try:
        settings = frappe.get_doc("Reconciliation Toolkit Settings")
        w_delivery = float(settings.delivery_weight or 25)
        w_delay = float(settings.delay_weight or 10)
        w_quality = float(settings.quality_weight or 25)
        w_rejection = float(settings.rejection_weight or 10)
        w_rfq = float(settings.rfq_weight or 10)
        w_cost = float(settings.cost_weight or 10)
        w_fulfillment = float(settings.fulfillment_weight or 10)
    except Exception:
        w_delivery, w_delay, w_quality, w_rejection, w_rfq, w_cost, w_fulfillment = 25, 10, 25, 10, 10, 10, 10
        
    scorecards = {}
    for supplier in suppliers:
        sc = _dict({"supplier": supplier, "start_date": from_date, "end_date": to_date})
        
        # Calculate raw variables using standard ERPNext backend
        total_shipments = _safe_float(ssv.get_total_shipments(sc))
        on_time_shipment_num = _safe_float(ssv.get_on_time_shipments(sc))
        
        tot_days_late = _safe_float(ssv.get_total_days_late(sc))
        total_working_days = _safe_float(ssv.get_total_workdays(sc))
        
        total_accepted_items = _safe_float(ssv.get_total_accepted_items(sc))
        total_received_items = _safe_float(ssv.get_total_received_items(sc))
        
        total_rejected_amount = _safe_float(ssv.get_total_rejected_amount(sc))
        total_received_amount = _safe_float(ssv.get_total_received_amount(sc))
        
        sq_total_items = _safe_float(ssv.get_sq_total_items(sc))
        rfq_total_items = _safe_float(ssv.get_rfq_total_items(sc))
        
        cost_of_on_time_shipments = _safe_float(ssv.get_cost_of_on_time_shipments(sc))
        tot_cost_shipments = _safe_float(ssv.get_total_cost_of_shipments(sc))
        
        total_ordered = _safe_float(ssv.get_ordered_qty(sc))
        
        # Calculate normalized scores (0-100)
        delivery = (on_time_shipment_num / total_shipments * 100) if total_shipments else 0
        
        delay = 100 * (1 - (tot_days_late / total_working_days)) if total_working_days else 100
        delay = max(0, min(100, delay))
        
        quality = (total_accepted_items / total_received_items * 100) if total_received_items else 0
        
        rejection = 100 * (1 - (total_rejected_amount / total_received_amount)) if total_received_amount else 100
        rejection = max(0, min(100, rejection))
        
        rfq = (sq_total_items / rfq_total_items * 100) if rfq_total_items else 0
        
        cost = (cost_of_on_time_shipments / tot_cost_shipments * 100) if tot_cost_shipments else 0
        
        fulfillment = (total_received_items / total_ordered * 100) if total_ordered else 0
        
        rating = (
            (delivery * w_delivery / 100) +
            (delay * w_delay / 100) +
            (quality * w_quality / 100) +
            (rejection * w_rejection / 100) +
            (rfq * w_rfq / 100) +
            (cost * w_cost / 100) +
            (fulfillment * w_fulfillment / 100)
        )
        
        scorecards[supplier] = {
            "scores": {
                "delivery": _round2(delivery),
                "delay": _round2(delay),
                "quality": _round2(quality),
                "rejection": _round2(rejection),
                "rfq": _round2(rfq),
                "cost": _round2(cost),
                "fulfillment": _round2(fulfillment),
            },
            "rating": _round2(rating)
        }
        
    return scorecards

def _build_summary(transaction_groups, from_date, to_date):
    """
    Aggregate summary KPIs across all transaction groups,
    including reconciliation statistics and exception counts.

    Args:
        transaction_groups: List of hierarchical transaction group dicts.

    Returns:
        dict: Summary with counts, totals, match percentage, and
              reconciliation KPIs.
    """
    total_count = len(transaction_groups)

    # Linkage status counts
    status_counts = {
        STATUS_FULLY_LINKED: 0,
        STATUS_MISSING_SQ: 0,
        STATUS_PENDING_INVOICE: 0,
        STATUS_PARTIAL_INVOICE: 0,
        STATUS_MISSING_SQ_PENDING_INVOICE: 0,
        STATUS_MISSING_SQ_PARTIAL_INVOICE: 0,
    }

    # Reconciliation status counts
    recon_counts = {
        RECON_MATCHED: 0,
        RECON_OVERCHARGED: 0,
        RECON_PRICE_VARIANCE: 0,
        RECON_QTY_VARIANCE: 0,
        RECON_FAVORABLE_VARIANCE: 0,
        RECON_VARIANCE_FLAGGED: 0,
        RECON_NOT_RECONCILABLE: 0,
    }

    # Severity counts
    severity_counts = {
        SEVERITY_CRITICAL: 0,
        SEVERITY_HIGH: 0,
        SEVERITY_MEDIUM: 0,
        SEVERITY_LOW: 0,
        SEVERITY_INFO: 0,
    }

    draft_po_count = 0
    total_po_value = 0.0
    total_pi_value = 0.0
    total_sq_value = 0.0
    total_flagged_count = 0
    total_variance_amount = 0.0
    total_overcharge_amount = 0.0
    total_favorable_amount = 0.0
    total_exception_count = 0

    variance_sq_to_po = 0.0
    variance_po_to_pi = 0.0
    variance_sq_to_pi = 0.0

    for group in transaction_groups:
        st = group["status"]
        status_counts[st] = status_counts.get(st, 0) + 1

        if group.get("po_is_draft"):
            draft_po_count += 1

        total_po_value += _safe_float(group["po_data"]["grand_total"])

        if group.get("invoice_data"):
            total_pi_value += _safe_float(group["invoice_data"]["combined_grand_total"])

        if group.get("quotation_data"):
            total_sq_value += _safe_float(group["quotation_data"]["grand_total"])

        v = group.get("variance", {})
        if v.get("sq_to_po") is not None:
            variance_sq_to_po += v["sq_to_po"]
        if v.get("po_to_pi") is not None:
            variance_po_to_pi += v["po_to_pi"]
        if v.get("sq_to_pi") is not None:
            variance_sq_to_pi += v["sq_to_pi"]

        # Reconciliation aggregation
        recon = group.get("reconciliation", {})
        if recon:
            rs = recon.get("recon_status", RECON_NOT_RECONCILABLE)
            recon_counts[rs] = recon_counts.get(rs, 0) + 1

            sev = recon.get("severity", SEVERITY_INFO)
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

            if recon.get("is_flagged"):
                total_flagged_count += 1

            for exc in recon.get("exceptions", []):
                total_exception_count += 1
                var_amt = _safe_float(exc.get("variance_amount"))
                total_variance_amount += abs(var_amt)
                if exc.get("exception_type") == RECON_OVERCHARGED:
                    total_overcharge_amount += var_amt
                elif exc.get("exception_type") == RECON_FAVORABLE_VARIANCE:
                    total_favorable_amount += abs(var_amt)

    fully_linked = status_counts.get(STATUS_FULLY_LINKED, 0)
    match_pct = round((fully_linked / total_count) * 100, 1) if total_count else 0.0

    recon_matched = recon_counts.get(RECON_MATCHED, 0)
    reconcilable = total_count - recon_counts.get(RECON_NOT_RECONCILABLE, 0)
    recon_match_pct = round((recon_matched / reconcilable) * 100, 1) if reconcilable else 0.0

    return {
        "total_purchase_orders": total_count,
        "draft_po_count": draft_po_count,
        "submitted_po_count": total_count - draft_po_count,
        "match_percent": match_pct,
        "status_counts": status_counts,
        "totals": {
            "po_value": _round2(total_po_value),
            "pi_value": _round2(total_pi_value),
            "sq_value": _round2(total_sq_value),
        },
        "aggregate_variance": {
            "sq_to_po": _round2(variance_sq_to_po),
            "po_to_pi": _round2(variance_po_to_pi),
            "sq_to_pi": _round2(variance_sq_to_pi),
        },
        "reconciliation": {
            "recon_match_percent": recon_match_pct,
            "recon_counts": recon_counts,
            "severity_counts": severity_counts,
            "total_flagged": total_flagged_count,
            "total_exceptions": total_exception_count,
            "total_variance_amount": _round2(total_variance_amount),
            "total_overcharge_amount": _round2(total_overcharge_amount),
            "total_favorable_amount": _round2(total_favorable_amount),
            "supplier_scorecards": _build_supplier_scorecards(transaction_groups, from_date, to_date),
        },
        "compliance": _evaluate_compliance_architecture(),
    }


def _evaluate_compliance_architecture():
    """
    Evaluate the system's compliance architecture by querying Buying Settings.
    Assigns programmatic weights to parameters to calculate a score out of 10.
    """
    score = 0
    suggestions = []

    try:
        settings = frappe.get_doc("Buying Settings")
        
        # 1. PO Required (Weight: 3)
        if settings.po_required == "Yes":
            score += 3
        else:
            suggestions.append("Making Purchase Order mandatory for Invoices will increase your score by 3.")
            
        # 2. PR Required (Weight: 3)
        if settings.pr_required == "Yes":
            score += 3
        else:
            suggestions.append("Making Purchase Receipt mandatory for Invoices will increase your score by 3.")
            
        # 3. Maintain Same Rate (Weight: 2) + Action (Weight: 2)
        if settings.maintain_same_rate:
            score += 2
            if settings.maintain_same_rate_action == "Stop":
                score += 2
            else:
                suggestions.append("Setting the action to 'Stop' when the same rate is not maintained will increase your score by 2.")
        else:
            suggestions.append("Enforcing the same rate throughout the purchase cycle will increase your score by 4.")
            
    except Exception:
        # Fallback if Buying Settings is inaccessible
        pass

    return {
        "score": score,
        "max_score": 10,
        "suggestions": suggestions
    }

def _get_operational_efficiency(from_date, to_date):
    """
    Calculates transaction state ratios (Draft vs Submitted vs Cancelled)
    for Purchase Orders, Purchase Receipts, and Purchase Invoices over a given date range.
    High cancellation rates indicate potential processing bottlenecks or missing training parameters.
    """
    efficiency = {}
    
    doctypes = {
        "Purchase Order": "transaction_date",
        "Purchase Receipt": "posting_date",
        "Purchase Invoice": "posting_date"
    }
    
    for dt, date_field in doctypes.items():
        query = f"""
            SELECT docstatus, count(name) as count
            FROM `tab{dt}`
            WHERE {date_field} BETWEEN %s AND %s
            GROUP BY docstatus
        """
        results = frappe.db.sql(query, (from_date, to_date), as_dict=True)
        
        counts = {
            "Draft": 0,
            "Submitted": 0,
            "Cancelled": 0
        }
        total = 0
        
        for row in results:
            total += row.get("count", 0)
            status = row.get("docstatus")
            if status == 0:
                counts["Draft"] += row.get("count", 0)
            elif status == 1:
                counts["Submitted"] += row.get("count", 0)
            elif status == 2:
                counts["Cancelled"] += row.get("count", 0)
                
        cancellation_rate = round((counts["Cancelled"] / total) * 100, 1) if total > 0 else 0.0
        
        efficiency[dt] = {
            "counts": counts,
            "total": total,
            "cancellation_rate": cancellation_rate,
            "bottleneck_warning": cancellation_rate > 15.0
        }
        
    return efficiency





# ─────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────

@frappe.whitelist()
def run_purchase_reconciliation(from_date, to_date, tolerance=1.0, company=None):
    """
    Run the Purchase Reconciliation Engine.

    Fetches all Purchase Orders within the given date range and resolves
    their linked Supplier Quotation(s) and Purchase Invoice(s) to produce
    a hierarchical reconciliation data structure with financial matching
    and exception flagging.

    Linked SQs and PIs are fetched regardless of their own dates — only
    POs are date-filtered. Both draft and submitted documents are included;
    drafts are clearly marked with `is_draft: true` and `doc_status: "Draft"`.

    Args:
        from_date (str): Start date, e.g. '2026-01-01'.
        to_date (str): End date, e.g. '2026-06-30'.
        tolerance (float): Amount tolerance in currency units (default 1.0).

    Returns:
        dict: {
            "summary": { ... aggregate KPIs + reconciliation stats ... },
            "transactions": [ ... hierarchical transaction groups ... ]
        }
    """
    tolerance = flt(tolerance) or 1.0

    # Step 1: Fetch all POs in date range
    po_list = fetch_purchase_orders(from_date, to_date, company)

    if not po_list:
        return _empty_result()

    # Step 2: For each PO, resolve linked SQs and PIs, run reconciliation
    transaction_groups = []

    for po_doc in po_list:
        # Upstream: Supplier Quotation(s)
        sq_result = _resolve_supplier_quotations(po_doc)

        # Downstream: Purchase Invoice(s)
        pi_result = _resolve_purchase_invoices(po_doc["name"])

        # Assemble hierarchical group (includes reconciliation)
        group = _build_transaction_group(po_doc, sq_result, pi_result, tolerance)
        transaction_groups.append(group)

    # Step 3: Build summary
    summary = _build_summary(transaction_groups, from_date, to_date)
    
    # Add Operational Efficiency data
    summary["operational_efficiency"] = _get_operational_efficiency(from_date, to_date)

    return {
        "summary": summary,
        "transactions": transaction_groups,
    }


@frappe.whitelist()
def run_purchase_reconciliation_report(from_date, to_date, tolerance=1.0, company=None):
    """
    Run the Purchase Reconciliation Engine and return a consolidated
    management report containing only the flagged exceptions.

    This is the management-facing entry point that filters out matched
    transactions and surfaces only items requiring senior review.

    Args:
        from_date (str): Start date, e.g. '2026-01-01'.
        to_date (str): End date, e.g. '2026-06-30'.
        tolerance (float): Amount tolerance in currency units (default 1.0).

    Returns:
        dict: {
            "report_meta": { date range, generation timestamp },
            "kpis": { aggregate management KPIs },
            "flagged_exceptions": [ detailed exception list for review ],
            "flagged_transactions": [ full transaction groups with issues ]
        }
    """
    from frappe.utils import now_datetime

    # Run full reconciliation
    full_result = run_purchase_reconciliation(from_date, to_date, tolerance, company)
    summary = full_result.get("summary", {})
    transactions = full_result.get("transactions", [])

    # Collect all exceptions and flagged transactions
    all_exceptions = []
    flagged_transactions = []

    for txn in transactions:
        recon = txn.get("reconciliation", {})
        if recon and recon.get("is_flagged"):
            flagged_transactions.append(txn)
            all_exceptions.extend(recon.get("exceptions", []))

    # Sort exceptions: CRITICAL first, then HIGH, MEDIUM, LOW
    severity_order = {
        SEVERITY_CRITICAL: 0,
        SEVERITY_HIGH: 1,
        SEVERITY_MEDIUM: 2,
        SEVERITY_LOW: 3,
        SEVERITY_INFO: 4,
    }
    all_exceptions.sort(key=lambda e: severity_order.get(e.get("severity"), 99))

    recon_summary = summary.get("reconciliation", {})

    return {
        "report_meta": {
            "from_date": from_date,
            "to_date": to_date,
            "tolerance": tolerance,
            "generated_at": str(now_datetime()),
        },
        "kpis": {
            "total_purchase_orders": summary.get("total_purchase_orders", 0),
            "total_po_value": summary.get("totals", {}).get("po_value", 0),
            "total_pi_value": summary.get("totals", {}).get("pi_value", 0),
            "total_flagged": recon_summary.get("total_flagged", 0),
            "total_exceptions": recon_summary.get("total_exceptions", 0),
            "total_variance_amount": recon_summary.get("total_variance_amount", 0),
            "total_overcharge_amount": recon_summary.get("total_overcharge_amount", 0),
            "total_favorable_amount": recon_summary.get("total_favorable_amount", 0),
            "recon_match_percent": recon_summary.get("recon_match_percent", 0),
            "severity_counts": recon_summary.get("severity_counts", {}),
            "recon_counts": recon_summary.get("recon_counts", {}),
        },
        "flagged_exceptions": all_exceptions,
        "flagged_transactions": flagged_transactions,
    }


def _empty_result():
    """Return a valid empty result when no POs are found."""
    return {
        "summary": {
            "total_purchase_orders": 0,
            "draft_po_count": 0,
            "submitted_po_count": 0,
            "match_percent": 0.0,
            "status_counts": {},
            "totals": {"po_value": 0.0, "pi_value": 0.0, "sq_value": 0.0},
            "aggregate_variance": {"sq_to_po": 0.0, "po_to_pi": 0.0, "sq_to_pi": 0.0},
            "reconciliation": {
                "recon_match_percent": 0.0,
                "recon_counts": {},
                "severity_counts": {},
                "total_flagged": 0,
                "total_exceptions": 0,
                "total_variance_amount": 0.0,
                "total_overcharge_amount": 0.0,
                "total_favorable_amount": 0.0,
            },
            "compliance": _evaluate_compliance_architecture(),
            "operational_efficiency": {
                "Purchase Order": {"counts": {"Draft": 0, "Submitted": 0, "Cancelled": 0}, "total": 0, "cancellation_rate": 0.0},
                "Purchase Receipt": {"counts": {"Draft": 0, "Submitted": 0, "Cancelled": 0}, "total": 0, "cancellation_rate": 0.0},
                "Purchase Invoice": {"counts": {"Draft": 0, "Submitted": 0, "Cancelled": 0}, "total": 0, "cancellation_rate": 0.0}
            }
        },
        "transactions": [],
    }
