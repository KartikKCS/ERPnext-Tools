from urllib.parse import urlencode

import frappe
import requests

from reconciliation_toolkit.reconciliation_toolkit.services.reconciliation_engine import (
    run_reconciliation as reconciliation_engine,
)

SALES_INVOICE_API_URL = "https://ecoqa.katalystcs.com.au/api/method/get-invoices"
BILL_SUMMARY_API_BASE_URL = "https://api.katalystcs.com.au/api/reports/bill-summary-report"
SALES_INVOICE_HEADERS = {
    "Authorization": "token c4e68731a8250ba:9bd4af7ad837db5",
    "Content-Type": "application/json",
    "Cookie": "full_name=Guest; sid=Guest; system_user=no; user_id=Guest; user_image=",
}
REQUEST_TIMEOUT = 60
COMPANY_MAPPING = {
    "Mandarin Oops Oriental": {
        "abbr": "IN000008",
        "property_id": "669de1ba07cc0d00196f7d52",
    },
}


def _parse_json_response(response, source_name):
    try:
        return response.json()
    except ValueError as exc:
        frappe.throw(f"{source_name} API returned invalid JSON: {exc}")


def _ensure_bill_summary_shape(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        frappe.throw("Bill Summary API response format is invalid.")
    return payload


def _ensure_sales_invoice_shape(payload):
    if not isinstance(payload, dict):
        frappe.throw("Sales Invoice API response format is invalid.")

    message = payload.get("message", payload)
    if not isinstance(message, dict) or not isinstance(message.get("data"), list):
        frappe.throw("Sales Invoice API response format is invalid.")

    if "message" in payload:
        return payload

    return {"message": message}


def _fetch_sales_invoice_data(abbr, from_date, to_date):
    response = requests.post(
        SALES_INVOICE_API_URL,
        headers=SALES_INVOICE_HEADERS,
        json={
            "abbr": abbr,
            "from_date": from_date,
            "to_date": to_date,
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _ensure_sales_invoice_shape(_parse_json_response(response, "Sales Invoice"))


def _fetch_missing_sales_invoice_data(missing_folios):
    response = requests.post(
        SALES_INVOICE_API_URL,
        headers=SALES_INVOICE_HEADERS,
        json={"missingFolios": missing_folios},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _ensure_sales_invoice_shape(_parse_json_response(response, "Sales Invoice Missing Folios"))


def _fetch_bill_summary_data(property_id, from_date, to_date):
    query_string = urlencode(
        {
            "startDateTime": from_date,
            "endDateTime": to_date,
        }
    )
    response = requests.get(
        f"{BILL_SUMMARY_API_BASE_URL}/{property_id}?{query_string}",
        headers={"source": "stage"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _ensure_bill_summary_shape(_parse_json_response(response, "Bill Summary"))


def _get_sales_invoice_records(payload):
    message = payload.get("message", payload)
    return message.get("data", []) if isinstance(message, dict) else []


def _merge_sales_invoice_payloads(primary_payload, retry_payload):
    merged_records = {}

    for record in _get_sales_invoice_records(primary_payload):
        folio = record.get("custom_folio_number")
        if folio:
            merged_records[folio] = record

    for record in _get_sales_invoice_records(retry_payload):
        folio = record.get("custom_folio_number")
        if folio and folio not in merged_records:
            merged_records[folio] = record

    primary_message = primary_payload.get("message", {})
    merged_message = dict(primary_message) if isinstance(primary_message, dict) else {}
    merged_message["data"] = list(merged_records.values())
    if "count" in merged_message:
        merged_message["count"] = len(merged_message["data"])

    return {"message": merged_message}


@frappe.whitelist()
def get_company_options():
    return sorted(COMPANY_MAPPING)


@frappe.whitelist()
def run_reconciliation(from_date, to_date, company, tolerance=1.0):
    """
    Run 5-level reconciliation on API payloads.

    Args:
        from_date: Inclusive date range start in YYYY-MM-DD.
        to_date: Inclusive date range end in YYYY-MM-DD.
        company: Company label used to resolve API abbr and property ID.
        tolerance: Amount tolerance (default 1.0).
    """
    if not from_date or not to_date:
        frappe.throw("From Date and To Date are required.")
    if not company:
        frappe.throw("Company is required.")
    if company not in COMPANY_MAPPING:
        frappe.throw(f"Unsupported company: {company}")

    company_config = COMPANY_MAPPING[company]

    try:
        bs_data = _fetch_bill_summary_data(company_config["property_id"], from_date, to_date)
        si_data = _fetch_sales_invoice_data(company_config["abbr"], from_date, to_date)
    except requests.HTTPError as exc:
        response = exc.response
        status_text = f"{response.status_code} {response.reason}" if response else str(exc)
        frappe.throw(f"External API request failed: {status_text}")
    except requests.RequestException as exc:
        frappe.throw(f"External API request failed: {exc}")

    result = reconciliation_engine(bs_data, si_data, float(tolerance))
    missing_folios = [
        row["folio"]
        for row in result.get("folios", [])
        if row.get("status") == "bs_only" and row.get("folio")
    ]

    if not missing_folios:
        return result

    try:
        retry_si_data = _fetch_missing_sales_invoice_data(missing_folios)
    except requests.HTTPError as exc:
        response = exc.response
        status_text = f"{response.status_code} {response.reason}" if response else str(exc)
        frappe.throw(f"Missing folio recheck failed: {status_text}")
    except requests.RequestException as exc:
        frappe.throw(f"Missing folio recheck failed: {exc}")

    merged_si_data = _merge_sales_invoice_payloads(si_data, retry_si_data)
    return reconciliation_engine(bs_data, merged_si_data, float(tolerance))


@frappe.whitelist(allow_guest=True)
def get_insights_data(from_date=None, to_date=None, company="Mandarin Oops Oriental", tolerance=1.0):
    """
    API endpoint specifically for Frappe Insights.
    Returns a flattened array of reconciliation folios.
    """
    from frappe.utils import add_days, today

    if not to_date:
        to_date = today()
    if not from_date:
        from_date = add_days(to_date, -30)

    # Call the main reconciliation process
    data = run_reconciliation(from_date, to_date, company, tolerance)
    
    folios = data.get("folios", [])
    flat_data = []

    for f in folios:
        raw_date = f.get("folio_date")
        if raw_date and len(str(raw_date)) >= 10:
            parsed_date = str(raw_date)[:10]
        else:
            parsed_date = to_date
            
        flat_f = {
            "folio": f.get("folio"),
            "reconciliation_date": parsed_date,
            "status": f.get("status"),
            "is_group_booking": f.get("is_group_booking", False),
            
            # Basic amounts
            "bs_grand_total": f.get("bs_grand_total") or 0.0,
            "si_grand_total": f.get("si_grand_total") or 0.0,
            "difference": f.get("difference") or 0.0,
            "amount_match": 1 if f.get("amount_match") else 0,
            
            # Status and Names
            "bs_payment_state": f.get("bs_payment_state", ""),
            "si_payment_state": f.get("si_payment_state", ""),
            "status_match": 1 if f.get("status_match") else 0,
            "bs_guest_name": f.get("bs_guest_name", ""),
            "si_customer": f.get("si_customer", ""),
            "bs_booking_type": f.get("bs_booking_type", ""),
            "bs_room": f.get("bs_room", ""),
        }
        
        # Flatten revenue nested dictionary
        rev = f.get("revenue") or {}
        flat_f.update({
            "revenue_status": rev.get("status", ""),
            "revenue_bs_total": rev.get("bs_total") or 0.0,
            "revenue_si_total": rev.get("si_total") or 0.0,
            "revenue_pretax_match": 1 if rev.get("pretax_match") else 0,
            "revenue_tax_match": 1 if rev.get("tax_match") else 0,
            "revenue_total_match": 1 if rev.get("total_match") else 0,
        })
        
        # Flatten payment nested dictionary
        pay = f.get("payment") or {}
        flat_f.update({
            "payment_status": pay.get("status", ""),
            "payment_bs_total_paid": pay.get("bs_total_paid") or 0.0,
            "payment_si_total_paid": pay.get("si_total_paid") or 0.0,
            "payment_total_match": 1 if pay.get("total_match") else 0,
            "payment_si_fully_paid": 1 if pay.get("si_is_fully_paid") else 0,
            "payment_erp_exceeds_pms": 1 if pay.get("erp_exceeds_pms") else 0,
        })
        
        # Booking Tags (join them into a comma-separated string)
        tags = f.get("booking_tags") or []
        flat_f["booking_tags"] = ", ".join(tags)

        flat_data.append(flat_f)

    # Note: Returning {"message": [...]} so that Insights can use $.message JSON path
    # Actually frappe.whitelist automatically wraps returns in {"message": return_value}
    return flat_data

@frappe.whitelist(allow_guest=True)
def log_frontend_error(error_msg):
    with open('/home/kartik/my-bench/frontend_error.log', 'a') as f:
        f.write(str(error_msg) + '\n')