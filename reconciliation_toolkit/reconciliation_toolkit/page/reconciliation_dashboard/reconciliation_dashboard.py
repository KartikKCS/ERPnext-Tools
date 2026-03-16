import json

import frappe
from frappe.utils.file_manager import get_file

from reconciliation_toolkit.reconciliation_toolkit.services.reconciliation_engine import (
    run_reconciliation as reconciliation_engine,
)


@frappe.whitelist()
def run_reconciliation(bs_file, si_file, tolerance=1.0):
    """
    Run 5-level reconciliation on uploaded JSON files.

    Args:
        bs_file: Frappe file URL for bill summary JSON.
        si_file: Frappe file URL for sales invoice JSON.
        tolerance: Amount tolerance (default 1.0).
    """
    bs_content = get_file(bs_file)[1]
    si_content = get_file(si_file)[1]

    # Handle bytes vs string
    if isinstance(bs_content, bytes):
        bs_content = bs_content.decode("utf-8")
    if isinstance(si_content, bytes):
        si_content = si_content.decode("utf-8")

    bs_data = json.loads(bs_content)
    si_data = json.loads(si_content)

    return reconciliation_engine(bs_data, si_data, float(tolerance))
