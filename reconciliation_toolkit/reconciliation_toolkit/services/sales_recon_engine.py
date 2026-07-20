"""
Sales Reconciliation Engine - Built from Scratch

This engine traces the sales document lifecycle:
Quotation (QTN) -> Sales Order (SO) -> Delivery Note (DN) -> Sales Invoice (SI)

It flags specific discrepancies:
- UNDERCHARGED: Revenue Leakage (Critical) when Invoice < Order.
- OVERCHARGED: Dispute Risk (Warning) when Invoice > Order.
"""

import frappe
from frappe.utils import flt, getdate
from collections import defaultdict

@frappe.whitelist()
def run_sales_reconciliation(from_date, to_date, company=None):
    """
    Main entry point for the dashboard.
    Fetches all Sales Orders within the date range and traces lineage.
    """
    filters = {
        "transaction_date": ["between", [getdate(from_date), getdate(to_date)]],
        "docstatus": 1
    }
    if company:
        filters["company"] = company

    sales_orders = frappe.get_all(
        "Sales Order",
        filters=filters,
        fields=["name", "customer", "customer_name", "transaction_date", "grand_total", "per_billed", "per_delivered", "currency", "status"],
        order_by="transaction_date desc"
    )

    results = []
    for so in sales_orders:
        trace = trace_sales_cycle(so.name)
        trace["so_data"] = so
        results.append(evaluate_variances(trace))

    summary = build_summary(results)
    
    return {
        "transactions": results,
        "summary": summary
    }


def trace_sales_cycle(so_name):
    """
    Given a Sales Order name, traces upstream and downstream documents.
    """
    trace = {
        "quotations": [],
        "delivery_notes": [],
        "sales_invoices": [],
        "so_items": []
    }

    # Fetch SO Items
    so_items = frappe.get_all(
        "Sales Order Item",
        filters={"parent": so_name},
        fields=["item_code", "item_name", "qty", "rate", "amount", "prevdoc_docname"]
    )
    trace["so_items"] = so_items

    # Identify Quotations
    qtn_names = set(item.prevdoc_docname for item in so_items if item.prevdoc_docname and item.prevdoc_docname.startswith("QUO-"))
    if qtn_names:
        trace["quotations"] = frappe.get_all(
            "Quotation",
            filters={"name": ["in", list(qtn_names)], "docstatus": 1},
            fields=["name", "grand_total", "status", "transaction_date"]
        )

    # Fetch Delivery Notes
    dn_items = frappe.get_all(
        "Delivery Note Item",
        filters={"against_sales_order": so_name, "docstatus": 1},
        fields=["parent"]
    )
    dn_names = list(set(item.parent for item in dn_items))
    if dn_names:
        trace["delivery_notes"] = frappe.get_all(
            "Delivery Note",
            filters={"name": ["in", dn_names], "docstatus": 1},
            fields=["name", "grand_total", "status", "posting_date"]
        )

    # Fetch Sales Invoices
    si_items = frappe.get_all(
        "Sales Invoice Item",
        filters={"sales_order": so_name, "docstatus": 1},
        fields=["parent", "item_code", "qty", "rate", "amount"]
    )
    
    # Group SI items by SI
    si_items_by_parent = defaultdict(list)
    for si_item in si_items:
        si_items_by_parent[si_item.parent].append(si_item)
        
    si_names = list(si_items_by_parent.keys())
    if si_names:
        invoices = frappe.get_all(
            "Sales Invoice",
            filters={"name": ["in", si_names], "docstatus": 1},
            fields=["name", "grand_total", "outstanding_amount", "status", "posting_date"]
        )
        for inv in invoices:
            inv["items"] = si_items_by_parent.get(inv.name, [])
        trace["sales_invoices"] = invoices

    return trace


def evaluate_variances(trace):
    """
    Evaluates financial and item-level discrepancies.
    """
    so_total = flt(trace["so_data"].grand_total)
    si_total = sum(flt(si.grand_total) for si in trace["sales_invoices"])
    
    exceptions = []
    recon_status = "MATCHED"

    if not trace["sales_invoices"]:
        recon_status = "PENDING_INVOICE"
    else:
        # Check overall financial variance
        diff = si_total - so_total
        if diff < -1.0: # Tolerance of 1 unit
            recon_status = "UNDERCHARGED"
            exceptions.append({
                "type": "UNDERCHARGED",
                "severity": "CRITICAL",
                "message": f"Revenue Leakage: Invoiced {abs(diff)} less than Ordered."
            })
        elif diff > 1.0:
            recon_status = "OVERCHARGED"
            exceptions.append({
                "type": "OVERCHARGED",
                "severity": "HIGH",
                "message": f"Dispute Risk: Invoiced {abs(diff)} more than Ordered."
            })

        # Item-level variance (Optional detail)
        # We aggregate SI items to compare against SO items
        si_item_agg = defaultdict(lambda: {"qty": 0.0, "amount": 0.0})
        for si in trace["sales_invoices"]:
            for item in si["items"]:
                si_item_agg[item.item_code]["qty"] += flt(item.qty)
                si_item_agg[item.item_code]["amount"] += flt(item.amount)

        for so_item in trace["so_items"]:
            code = so_item.item_code
            if code in si_item_agg:
                si_qty = si_item_agg[code]["qty"]
                so_qty = flt(so_item.qty)
                if abs(si_qty - so_qty) > 0.01:
                    exceptions.append({
                        "type": "QTY_VARIANCE",
                        "severity": "MEDIUM",
                        "message": f"Qty Mismatch for {code}: Ordered {so_qty}, Invoiced {si_qty}"
                    })
                    if recon_status == "MATCHED":
                        recon_status = "QTY_VARIANCE"

    trace["reconciliation"] = {
        "status": recon_status,
        "exceptions": exceptions,
        "invoiced_total": si_total,
        "ordered_total": so_total,
        "variance": si_total - so_total
    }
    
    return trace

def build_summary(results):
    """
    Builds the high-level KPI summary for the dashboard.
    """
    total_revenue_potential = 0.0
    total_realized_revenue = 0.0
    total_leakage = 0.0
    total_dispute_risk = 0.0
    
    status_counts = defaultdict(int)

    for r in results:
        so_total = r["reconciliation"]["ordered_total"]
        si_total = r["reconciliation"]["invoiced_total"]
        
        total_revenue_potential += so_total
        total_realized_revenue += si_total
        
        status = r["reconciliation"]["status"]
        status_counts[status] += 1
        
        if status == "UNDERCHARGED":
            total_leakage += (so_total - si_total)
        elif status == "OVERCHARGED":
            total_dispute_risk += (si_total - so_total)

    return {
        "total_revenue_potential": total_revenue_potential,
        "total_realized_revenue": total_realized_revenue,
        "total_leakage": total_leakage,
        "total_dispute_risk": total_dispute_risk,
        "status_counts": dict(status_counts)
    }
