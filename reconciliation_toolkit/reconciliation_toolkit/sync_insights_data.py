import frappe
from reconciliation_toolkit.reconciliation_toolkit.page.reconciliation_dashboard.reconciliation_dashboard import get_insights_data

def sync_data(from_date=None, to_date=None):
    print(f"Fetching reconciliation data (From: {from_date}, To: {to_date})...")
    data = get_insights_data(from_date=from_date, to_date=to_date)

    print(f"Fetched {len(data)} records. Upserting to DB...")
    
    for row in data:
        # Check if record for this folio already exists
        existing_name = frappe.db.get_value("Reconciliation Insight Record", {"folio": row.get("folio")}, "name")
        if existing_name:
            doc = frappe.get_doc("Reconciliation Insight Record", existing_name)
        else:
            doc = frappe.new_doc("Reconciliation Insight Record")
            
        for key, value in row.items():
            if hasattr(doc, key):
                setattr(doc, key, value)
        
        doc.save(ignore_permissions=True)
        
    frappe.db.commit()
    print("Sync complete.")

