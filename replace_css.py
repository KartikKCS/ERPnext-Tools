import re
import os

path = '/home/kartik/my-bench/apps/reconciliation_toolkit/reconciliation_toolkit/reconciliation_toolkit/page/sales_reconciliation_dashboard/sales_reconciliation_dashboard.css'

with open(path, 'r') as f:
    content = f.read()

replacements = {
    'Purchase Reconciliation': 'Sales Reconciliation',
    'purchase': 'sales'
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open(path, 'w') as f:
    f.write(content)

print("CSS Replacement complete.")
