import frappe

def create_settings():
    doctype_name = "Reconciliation Toolkit Settings"
    if not frappe.db.exists("DocType", doctype_name):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": doctype_name,
            "module": "Reconciliation Toolkit",
            "custom": 1,
            "issingle": 1,
            "fields": [
                {"fieldname": "delivery_weight", "fieldtype": "Percent", "label": "Delivery Score Weight", "default": "25"},
                {"fieldname": "delay_weight", "fieldtype": "Percent", "label": "Delay Penalty Weight", "default": "10"},
                {"fieldname": "quality_weight", "fieldtype": "Percent", "label": "Quality Score Weight", "default": "25"},
                {"fieldname": "rejection_weight", "fieldtype": "Percent", "label": "Rejection Penalty Weight", "default": "10"},
                {"fieldname": "rfq_weight", "fieldtype": "Percent", "label": "RFQ Response Weight", "default": "10"},
                {"fieldname": "cost_weight", "fieldtype": "Percent", "label": "Cost Performance Weight", "default": "10"},
                {"fieldname": "fulfillment_weight", "fieldtype": "Percent", "label": "Fulfillment Score Weight", "default": "10"}
            ]
        })
        doc.insert(ignore_permissions=True)
        print(f"Created DocType: {doctype_name}")
    else:
        print(f"DocType already exists: {doctype_name}")
