import re
import os

path = '/home/kartik/my-bench/apps/reconciliation_toolkit/reconciliation_toolkit/reconciliation_toolkit/page/sales_reconciliation_dashboard/sales_reconciliation_dashboard.js'

with open(path, 'r') as f:
    content = f.read()

replacements = {
    'purchase-reconciliation-dashboard': 'sales-reconciliation-dashboard',
    'Purchase Reconciliation Dashboard': 'Sales Reconciliation Dashboard',
    'purchase_reconciliation': 'sales_reconciliation',
    'supplier': 'customer',
    'Supplier': 'Customer',
    'SUP-': 'CUS-',
    'PUR-ORD-': 'SAL-ORD-',
    'PUR-INV-': 'SAL-INV-',
    'SUP-QTN-': 'QTN-',
    'Purchase Order': 'Sales Order',
    'Purchase Receipt': 'Delivery Note',
    'Purchase Invoice': 'Sales Invoice',
    'total_purchase_orders': 'total_sales_orders',
    'totalPOs': 'totalSOs',
    'po_number': 'so_number',
    'po_data': 'so_data',
    'po_is_draft': 'so_is_draft',
    'po_doc_status': 'so_doc_status',
    'po_amount': 'so_amount',
    'pi_amount': 'si_amount',
    'po_qty': 'so_qty',
    'pi_qty': 'si_qty',
    'po_rate': 'so_rate',
    'pi_rate': 'si_rate',
    'po_value': 'so_value',
    'pi_value': 'si_value',
    'sq_value': 'qtn_value',
    'po_grand_total': 'so_grand_total',
    'sq_grand_total': 'qtn_grand_total',
    'pi_grand_total': 'si_grand_total',
    'pi_vs_po': 'si_vs_so',
    'pi_vs_sq': 'si_vs_qtn',
    'po_vs_sq': 'so_vs_qtn',
    'sq_to_po': 'qtn_to_so',
    'po_to_pi': 'so_to_si',
    'sq_to_pi': 'qtn_to_si',
    'poNetTotal': 'soNetTotal',
    'poTax': 'soTax',
    'poGrandTotal': 'soGrandTotal',
    'piNetTotal': 'siNetTotal',
    'piTax': 'siTax',
    'piGrandTotal': 'siGrandTotal',
    'sqGrandTotal': 'qtnGrandTotal',
    'poItems': 'soItems',
    'piItems': 'siItems',
    'poIt': 'soIt',
    'piIt': 'siIt',
    'totalPOValue': 'totalSOValue',
    'totalPIValue': 'totalSIValue',
    'OVERCHARGED': 'UNDERCHARGED', # the logic changes slightly: for sales, UNDERCHARGED is revenue leakage
    'FAVORABLE_VARIANCE': 'OVERCHARGED', # overcharging customer is considered favorable to revenue but a variance
    'MISSING_SQ': 'MISSING_QUOTATION',
    'MISSING_SQ_PENDING_INVOICE': 'MISSING_QUOTATION_PENDING_INVOICE',
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Special handling for logic
# For UNDERCHARGED logic which is revenue leakage
content = content.replace("reconStatus === 'UNDERCHARGED' ? 'CRITICAL'", "reconStatus === 'UNDERCHARGED' ? 'CRITICAL'")
content = content.replace("total_overcharge_amount", "total_undercharge_amount")
content = content.replace("total_favorable_amount", "total_overcharge_amount")

with open(path, 'w') as f:
    f.write(content)

print("Replacement complete.")
