from reconciliation_toolkit.reconciliation_toolkit.services.purchase_recon_engine import run_purchase_reconciliation
import json

def run_test():
    res = run_purchase_reconciliation('2025-01-01', '2027-01-01')
    sc = res['summary']['reconciliation'].get('supplier_scorecards')
    with open('/tmp/test_scorecard.json', 'w') as f:
        json.dump(sc, f)
