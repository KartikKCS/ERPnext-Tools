import frappe

def run():
    doc = frappe.get_doc("DocType", "Reconciliation Insight Record")
    field_exists = False
    for df in doc.fields:
        if df.fieldname == "reconciliation_date":
            field_exists = True
            break
    if not field_exists:
        doc.append("fields", {"fieldname": "reconciliation_date", "label": "Reconciliation Date", "fieldtype": "Date"})
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        print("Added reconciliation_date")
    else:
        print("reconciliation_date already exists")

