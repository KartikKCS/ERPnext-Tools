import frappe
from frappe.utils import add_months, today, get_first_day, get_last_day
from reconciliation_toolkit.reconciliation_toolkit.sync_insights_data import sync_data

def run():
    current_date = today()
    for i in range(6):
        target_month = add_months(current_date, -i)
        first_day = str(get_first_day(target_month))
        last_day = str(get_last_day(target_month))
        if i == 0:
            last_day = str(current_date)
        print(f"Fetching for {first_day} to {last_day}")
        sync_data(from_date=first_day, to_date=last_day)

