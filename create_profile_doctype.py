import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def create_doctype():
    if not frappe.db.exists("DocType", "Bank Statement Parser Profile"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "Bank Statement Parser Profile",
            "module": "Reconciliation Toolkit",
            "custom": 1,
            "autoname": "field:parser_name",
            "fields": [
                {"fieldname": "parser_name", "fieldtype": "Data", "label": "Parser Name", "reqd": 1, "unique": 1},
                {"fieldname": "date_col", "fieldtype": "Data", "label": "Date Column"},
                {"fieldname": "description_col", "fieldtype": "Data", "label": "Description Column"},
                {"fieldname": "reference_col", "fieldtype": "Data", "label": "Reference Number Column"},
                {"fieldname": "withdrawal_col", "fieldtype": "Data", "label": "Withdrawal Column"},
                {"fieldname": "deposit_col", "fieldtype": "Data", "label": "Deposit Column"},
                {"fieldname": "amount_col", "fieldtype": "Data", "label": "Amount Column"},
                {"fieldname": "indicator_col", "fieldtype": "Data", "label": "Indicator (Dr/Cr) Column"}
            ],
            "permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                            {"role": "Accounts Manager", "read": 1, "write": 1, "create": 1, "delete": 1}]
        })
        doc.insert()
        print("Created Bank Statement Parser Profile DocType")
    else:
        print("DocType already exists")

def add_custom_fields():
    custom_fields = {
        "Smart Statement Import": [
            {"fieldname": "mapping_section", "fieldtype": "Section Break", "label": "Column Mapping", "insert_after": "import_file"},
            {"fieldname": "custom_parser", "fieldtype": "Link", "options": "Bank Statement Parser Profile", "label": "Saved Parser Profile", "description": "Select a saved mapping profile to auto-fill the columns below."},
            {"fieldname": "date_col", "fieldtype": "Data", "label": "Date Column"},
            {"fieldname": "description_col", "fieldtype": "Data", "label": "Description Column"},
            {"fieldname": "reference_col", "fieldtype": "Data", "label": "Reference Number Column"},
            {"fieldname": "column_break_mapping", "fieldtype": "Column Break"},
            {"fieldname": "withdrawal_col", "fieldtype": "Data", "label": "Withdrawal Column"},
            {"fieldname": "deposit_col", "fieldtype": "Data", "label": "Deposit Column"},
            {"fieldname": "amount_col", "fieldtype": "Data", "label": "Amount Column", "description": "Use if Amount and Indicator (Dr/Cr) are in separate columns"},
            {"fieldname": "indicator_col", "fieldtype": "Data", "label": "Indicator (Dr/Cr) Column"}
        ]
    }
    create_custom_fields(custom_fields)
    print("Added custom fields to Smart Statement Import")

create_doctype()
add_custom_fields()
frappe.db.commit()
