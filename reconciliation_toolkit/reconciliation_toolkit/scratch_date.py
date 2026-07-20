import frappe
from reconciliation_toolkit.reconciliation_toolkit.services.reconciliation_engine import _fetch_bill_summary_data, _fetch_sales_invoice_data
from frappe.utils import today, add_days

def run():
    frappe.init(site="mysite.localhost")
    frappe.connect()
    company_config = {"abbr": "IN000008", "property_id": "669de1ba07cc0d00196f7d52"}
    to_date = today()
    from_date = add_days(to_date, -3)
    
    try:
        bs_data = _fetch_bill_summary_data(company_config["property_id"], from_date, to_date)
        records = bs_data.get("data", [])
        if records:
            print("BS Record Keys:", records[0].keys())
            print("arrivalDate:", records[0].get("arrivalDate"))
            print("departureDate:", records[0].get("departureDate"))
            print("creationDate:", records[0].get("creationDate"))
            print("date:", records[0].get("date"))
            
        si_data = _fetch_sales_invoice_data(company_config["abbr"], from_date, to_date)
        msg = si_data.get("message", si_data)
        if isinstance(msg, dict):
            s_records = msg.get("data", [])
            if s_records:
                print("SI Record Keys:", s_records[0].keys())
                print("posting_date:", s_records[0].get("posting_date"))
                print("creation:", s_records[0].get("creation"))
                print("date:", s_records[0].get("date"))
    except Exception as e:
        print(e)
