import frappe
import requests
from urllib.parse import urlencode

# ─────────────────────────────────────────────
# API Configuration & Constants
# ─────────────────────────────────────────────

PURCHASE_ORDER_API_URL = "https://api.example.com/api/method/get-purchase-orders"
PURCHASE_INVOICE_API_URL = "https://api.example.com/api/method/get-purchase-invoices"

API_HEADERS = {
    "Authorization": "token ", # TODO: Insert API key here
    "Content-Type": "application/json",
}

REQUEST_TIMEOUT = 60

COMPANY_MAPPING = {
    "Mandarin Oops Oriental": {
        "abbr": "IN000008",
        "property_id": "669de1ba07cc0d00196f7d52",
    },
}

# ─────────────────────────────────────────────
# API Endpoint
# ─────────────────────────────────────────────

@frappe.whitelist()
def fetch_purchase_data(company, from_date, to_date):
    """
    Fetches upstream/downstream purchase data from external APIs.
    """
    if company not in COMPANY_MAPPING:
        frappe.throw(f"Company '{company}' is not mapped to an external property ID.")
        
    property_id = COMPANY_MAPPING[company]["property_id"]
    
    # 1. Fetch Purchase Orders
    po_params = {
        "property_id": property_id,
        "from_date": from_date,
        "to_date": to_date
    }
    
    try:
        po_response = requests.get(
            f"{PURCHASE_ORDER_API_URL}?{urlencode(po_params)}",
            headers=API_HEADERS,
            timeout=REQUEST_TIMEOUT
        )
        po_response.raise_for_status()
        po_data = po_response.json()
    except Exception as e:
        frappe.throw(f"Failed to fetch Purchase Orders: {str(e)}")

    # 2. Fetch Purchase Invoices
    pi_params = {
        "property_id": property_id,
        "from_date": from_date,
        "to_date": to_date
    }
    
    try:
        pi_response = requests.get(
            f"{PURCHASE_INVOICE_API_URL}?{urlencode(pi_params)}",
            headers=API_HEADERS,
            timeout=REQUEST_TIMEOUT
        )
        pi_response.raise_for_status()
        pi_data = pi_response.json()
    except Exception as e:
        frappe.throw(f"Failed to fetch Purchase Invoices: {str(e)}")

    return {
        "status": "success",
        "purchase_orders": po_data.get("data", []),
        "purchase_invoices": pi_data.get("data", [])
    }
