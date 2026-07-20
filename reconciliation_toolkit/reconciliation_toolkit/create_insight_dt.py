import frappe

def create_doctype():
    if frappe.db.exists("DocType", "Reconciliation Insight Record"):
        print("DocType already exists.")
        return

    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "Reconciliation Insight Record",
        "module": "Reconciliation Toolkit",
        "custom": 1,
        "istable": 0,
        "issingle": 0,
        "fields": [
            {"fieldname": "folio", "label": "Folio", "fieldtype": "Data"},
            {"fieldname": "status", "label": "Status", "fieldtype": "Data"},
            {"fieldname": "is_group_booking", "label": "Is Group Booking", "fieldtype": "Check"},
            {"fieldname": "bs_grand_total", "label": "BS Grand Total", "fieldtype": "Currency"},
            {"fieldname": "si_grand_total", "label": "SI Grand Total", "fieldtype": "Currency"},
            {"fieldname": "difference", "label": "Difference", "fieldtype": "Currency"},
            {"fieldname": "amount_match", "label": "Amount Match", "fieldtype": "Check"},
            {"fieldname": "bs_payment_state", "label": "BS Payment State", "fieldtype": "Data"},
            {"fieldname": "si_payment_state", "label": "SI Payment State", "fieldtype": "Data"},
            {"fieldname": "status_match", "label": "Status Match", "fieldtype": "Check"},
            {"fieldname": "bs_guest_name", "label": "BS Guest Name", "fieldtype": "Data"},
            {"fieldname": "si_customer", "label": "SI Customer", "fieldtype": "Data"},
            {"fieldname": "bs_booking_type", "label": "BS Booking Type", "fieldtype": "Data"},
            {"fieldname": "bs_room", "label": "BS Room", "fieldtype": "Data"},
            {"fieldname": "revenue_status", "label": "Revenue Status", "fieldtype": "Data"},
            {"fieldname": "revenue_bs_total", "label": "Revenue BS Total", "fieldtype": "Currency"},
            {"fieldname": "revenue_si_total", "label": "Revenue SI Total", "fieldtype": "Currency"},
            {"fieldname": "revenue_pretax_match", "label": "Revenue Pretax Match", "fieldtype": "Check"},
            {"fieldname": "revenue_tax_match", "label": "Revenue Tax Match", "fieldtype": "Check"},
            {"fieldname": "revenue_total_match", "label": "Revenue Total Match", "fieldtype": "Check"},
            {"fieldname": "payment_status", "label": "Payment Status", "fieldtype": "Data"},
            {"fieldname": "payment_bs_total_paid", "label": "Payment BS Total Paid", "fieldtype": "Currency"},
            {"fieldname": "payment_si_total_paid", "label": "Payment SI Total Paid", "fieldtype": "Currency"},
            {"fieldname": "payment_total_match", "label": "Payment Total Match", "fieldtype": "Check"},
            {"fieldname": "payment_si_fully_paid", "label": "Payment SI Fully Paid", "fieldtype": "Check"},
            {"fieldname": "payment_erp_exceeds_pms", "label": "Payment ERP Exceeds PMS", "fieldtype": "Check"},
            {"fieldname": "booking_tags", "label": "Booking Tags", "fieldtype": "Data"}
        ],
        "permissions": [
            {
                "role": "System Manager",
                "read": 1,
                "write": 1,
                "create": 1,
                "delete": 1
            }
        ]
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    print("DocType created successfully.")
