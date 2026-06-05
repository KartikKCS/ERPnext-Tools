from urllib.parse import urlencode

import frappe
import requests

from reconciliation_toolkit.reconciliation_toolkit.services.reconciliation_engine import (
    run_reconciliation as reconciliation_engine,
)

SALES_INVOICE_API_URL = "http://127.0.0.1/api/method/get-invoices"
BILL_SUMMARY_API_BASE_URL = "http://127.0.0.1:5001/api/reports/bill-summary-report"
SALES_INVOICE_HEADERS = {
    "Host": "ecoqa.katalystcs.com.au",
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
