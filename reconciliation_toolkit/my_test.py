from reconciliation_toolkit.reconciliation_toolkit.services.purchase_recon_engine import run_purchase_reconciliation
import json

def run_test():
    res = run_purchase_reconciliation('2025-01-01', '2027-01-01')
    print("TOTAL POs:", res['summary']['total_purchase_orders'])
    with open('/tmp/test_recon_output.json', 'w') as f:
        json.dump(res, f)
