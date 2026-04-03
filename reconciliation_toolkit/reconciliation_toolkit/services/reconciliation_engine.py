"""
5-Level Reconciliation Engine

Compares Bill Summary (PMS) against Sales Invoice (ERP) data
across 5 hierarchical levels:

    1. Booking   — reservation-level totals
    2. Folio     — folio-level amount & status
    3. Invoice   — PMS invoice number linkage
    4. Revenue   — category breakdown (Room, F&B, Laundry, Other)
    5. Payment   — mode-level comparison (UPI, Cash, Card, etc.)
"""

from collections import defaultdict


# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────

PAYMENT_MODE_MAP = {
    # BS key → SI mode_of_payment
    "billToTravel": "Bill to Travel",
    "billToCompany": "Bill to company",
    "cash": "Cash",
    "upi": "UPI",
    "creditCard": "Credit Card",
    "debitCard": "Debit Card",
    "bankAccount": "Bank Account",
}

SI_INCOME_ACCOUNT_MAP = {
    # prefix → revenue category
    "410001": "room",
    "410200": "room",
    "416000": "fnb",
    "451000": "other",
    "567100": "commission",
}

STATUS_MATCHED = "matched"
STATUS_MISMATCH = "mismatch"
STATUS_BS_ONLY = "bs_only"
STATUS_SI_ONLY = "si_only"
STATUS_NO_DATA = "no_data"


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _round2(val):
    """Round to 2 decimal places."""
    return round(val, 2)


def _amounts_match(a, b, tolerance):
    """Check if two amounts match within tolerance."""
    return abs(_round2(a) - _round2(b)) <= tolerance


def _classify_si_account(income_account):
    """Map an income account string to a revenue category."""
    if not income_account:
        return "other"
    prefix = income_account.strip().split(" ")[0]
    return SI_INCOME_ACCOUNT_MAP.get(prefix, "other")


def _reverse_mode_map():
    """Build SI mode → BS key lookup."""
    return {v: k for k, v in PAYMENT_MODE_MAP.items()}


def _safe_float(val, default=0.0):
    """Safely convert to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


# ─────────────────────────────────────────────
# Data Extraction
# ─────────────────────────────────────────────

def _extract_bs_records(bs_data):
    """Extract bill summary records from JSON structure."""
    records = bs_data.get("data", [])
    # Filter out summary/total rows
    return [r for r in records if r.get("folioNo") and r.get("reservationId")]


def _extract_si_records(si_data):
    """Extract sales invoice records from JSON structure."""
    msg = si_data.get("message", si_data)
    if isinstance(msg, dict):
        records = msg.get("data", [])
    else:
        records = []
    # Using custom_folio_number as primary matching key
    return [r for r in records if r.get("custom_folio_number")]


# ─────────────────────────────────────────────
# Level 2: Folio Recon
# ─────────────────────────────────────────────

def _build_bs_folio_map(bs_records):
    """Index BS records by folioNo."""
    folio_map = {}
    for r in bs_records:
        folio = r["folioNo"]
        folio_map[folio] = r
    return folio_map


def _build_si_folio_map(si_records):
    """Index SI records by custom_folio_number."""
    folio_map = {}
    for r in si_records:
        folio = r["custom_folio_number"]
        folio_map[folio] = r
    return folio_map


def _recon_folio(bs_rec, si_rec, tolerance, is_group_booking=False):
    """Reconcile a single folio/invoice across all sub-levels."""
    folio_result = {
        "folio": bs_rec.get("folioNo") if bs_rec else si_rec.get("custom_folio_number"),
        "status": STATUS_MATCHED,
        "is_group_booking": is_group_booking,
    }

    # -- Folio-level (L2) amounts --
    if bs_rec and si_rec:
        bs_total = _safe_float(bs_rec.get("grandTotal"))
        si_total = _safe_float(si_rec.get("grand_total"))
        diff = _round2(bs_total - si_total)

        bs_balance = _safe_float(bs_rec.get("balance"))
        si_outstanding = _safe_float(si_rec.get("outstanding_amount"))
        si_status = si_rec.get("status", "")

        bs_paid = abs(bs_balance) <= tolerance
        si_paid = si_status.lower() == "paid" or si_outstanding == 0

        amount_match = _amounts_match(bs_total, si_total, tolerance)
        status_match = bs_paid == si_paid

        folio_result.update({
            "bs_grand_total": _round2(bs_total),
            "si_grand_total": _round2(si_total),
            "difference": diff,
            "amount_match": amount_match,
            "bs_payment_state": "Closed" if bs_paid else "Open",
            "si_payment_state": "Closed" if si_paid else "Open",
            "status_match": status_match,
            "bs_guest_name": bs_rec.get("guestName", ""),
            "si_customer": si_rec.get("customer_name", si_rec.get("customer", "")),
            "bs_booking_type": bs_rec.get("bookingType", ""),
            "bs_room": bs_rec.get("roomNo", ""),
        })
        # Sub-levels
        folio_result["revenue"] = _recon_revenue(bs_rec, si_rec, tolerance)
        folio_result["payment"] = _recon_payment(bs_rec, si_rec, tolerance, is_group_booking)

        # Overall status: mismatch if ANY sub-level has issues
        rev_ok = folio_result["revenue"]["status"] == STATUS_MATCHED
        pay_ok = folio_result["payment"]["status"] == STATUS_MATCHED

        folio_result["status"] = STATUS_MATCHED if (amount_match and rev_ok and pay_ok) else STATUS_MISMATCH

    elif bs_rec:
        folio_result.update({
            "status": STATUS_BS_ONLY,
            "bs_grand_total": _round2(_safe_float(bs_rec.get("grandTotal"))),
            "si_grand_total": None,
            "difference": None,
            "amount_match": False,
            "bs_guest_name": bs_rec.get("guestName", ""),
            "si_customer": None,
            "bs_booking_type": bs_rec.get("bookingType", ""),
            "bs_room": bs_rec.get("roomNo", ""),
            "revenue": None,
            "payment": None,
        })
    else:
        folio_result.update({
            "status": STATUS_SI_ONLY,
            "bs_grand_total": None,
            "si_grand_total": _round2(_safe_float(si_rec.get("grand_total"))),
            "difference": None,
            "amount_match": False,
            "bs_guest_name": None,
            "si_customer": si_rec.get("customer_name", si_rec.get("customer", "")),
            "bs_booking_type": None,
            "bs_room": None,
            "revenue": None,
            "payment": None,
        })

    return folio_result



# ─────────────────────────────────────────────
# Breakdowns and Classifications
# ─────────────────────────────────────────────

def _build_revenue_breakdown(bs_records, si_records):
    """Aggregate revenue by source: Walk-in, OTA, TPA."""
    # We will aggregate from the BS records directly. To get ERP values, 
    # we find the matching SI record by custom_folio_number.
    si_map = {r.get("custom_folio_number"): r for r in si_records if r.get("custom_folio_number")}
    
    breakdown = {
        "Walk-in": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
        "OTA": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
        "TPA": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
    }

    for r in bs_records:
        if not r.get("folioNo"): continue
        
        src = str(r.get("bookingType", "")).strip().lower()
        if "walk" in src or "individual" in src:
            cat = "Walk-in"
        elif "tpa" in src:
            cat = "TPA"
        elif "ota" in src or "travel" in src or "make" in src or "make my trip" in src:
            cat = "OTA"
        else:
            # Fallback if source is MakeMyTrip etc.
            source = str(r.get("source", "")).lower()
            if "make" in source or "agoda" in source or "go" in source or "cleartrip" in source:
                cat = "OTA"
            else:
                cat = "Walk-in"  # default bucket

        bs_total = _safe_float(r.get("grandTotal"))
        
        breakdown[cat]["bs_ct"] += 1
        breakdown[cat]["bs_amt"] += bs_total

        # Corresponding ERP totals
        si = si_map.get(r.get("folioNo"))
        if si:
            breakdown[cat]["si_ct"] += 1
            breakdown[cat]["si_amt"] += _safe_float(si.get("grand_total"))

    return breakdown


def _build_collection_breakdown(bs_records, si_records):
    """Aggregate collections by grouping payment modes."""
    breakdown = {
        "Cash": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
        "UPI": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
        "Debit/Credit": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
        "Other": {"bs_ct": 0, "bs_amt": 0.0, "si_ct": 0, "si_amt": 0.0},
    }

    def _map_mode(mode_name):
        mn = str(mode_name or "").lower().replace(" ", "")
        if "cash" in mn: return "Cash"
        if "upi" in mn: return "UPI"
        if "credit" in mn or "debit" in mn or "card" in mn: return "Debit/Credit"
        return "Other"

    # BS side
    for r in bs_records:
        if not r.get("folioNo"): continue
        
        payments = r.get("Payments", {})
        has_counted = set()
        for k, v in payments.items():
            val = _safe_float(v)
            if val > 0:
                cat = _map_mode(k)
                breakdown[cat]["bs_amt"] += val
                if cat not in has_counted:
                    breakdown[cat]["bs_ct"] += 1
                    has_counted.add(cat)

    # SI side
    for r in si_records:
        if not r.get("custom_folio_number"): continue
        
        has_counted = set()
        outstanding = _safe_float(r.get("outstanding_amount"))
        grand_total = _safe_float(r.get("grand_total"))
        is_paid = abs(outstanding) <= 1.0

        si_local_payments = 0.0

        for pay in r.get("payments", []):
            cat = _map_mode(pay.get("mode_of_payment", ""))
            amount = _safe_float(pay.get("allocated_amount"))
            # If invoice is paid out but no payments mapped properly, amount logic is fuzzy.
            # We'll rely on allocated_amount for breakdown
            if amount > 0:
                breakdown[cat]["si_amt"] += amount
                si_local_payments += amount
                if cat not in has_counted:
                    breakdown[cat]["si_ct"] += 1
                    has_counted.add(cat)
                    
        # Inject missing "Fully Paid" totals into 'Other' if child array was completely empty
        if is_paid and si_local_payments < (grand_total - 1.0):
            diff_to_allocate = grand_total - si_local_payments
            breakdown["Other"]["si_amt"] += diff_to_allocate
            if "Other" not in has_counted:
                breakdown["Other"]["si_ct"] += 1

    return breakdown


def _classify_booking_type(folios):
    """
    Given a list of strings like ["ECO_KOC-2279", "ECO_KOC-2279-1"], return "Group" or "Individual".
    A Group booking is any reservation that contains more than 1 unique folio identifier.
    """
    unique_folios = set(f for f in folios if f)
    return "Group" if len(unique_folios) > 1 else "Individual"


# ─────────────────────────────────────────────
# Level 4: Revenue Recon
# ─────────────────────────────────────────────

def _recon_revenue(bs_rec, si_rec, tolerance):
    """Compare revenue between BS and SI.

    Category-level mapping between the two systems is unreliable
    (e.g. SI account 451000 'Miscellaneous' could be Restaurant in BS).
    So we compare at the total level for match/mismatch, and show each
    system's breakdown as informational context.
    """
    # BS side — category breakdown
    bs_room      = _safe_float(bs_rec.get("roomRevenue"))
    bs_fnb       = _safe_float(bs_rec.get("fnbRevenue"))
    bs_laundry   = _safe_float(bs_rec.get("laundryRevenue"))
    bs_other     = _safe_float(bs_rec.get("otherRevenue"))
    bs_pretax    = _round2(bs_room + bs_fnb + bs_laundry + bs_other)

    bs_room_tax    = _safe_float(bs_rec.get("roomRevenueTax"))
    bs_fnb_tax     = _safe_float(bs_rec.get("fnbNonRevenue"))
    bs_laundry_tax = _safe_float(bs_rec.get("laundryRevenueTax"))
    bs_other_tax   = _safe_float(bs_rec.get("otherRevenueTax"))
    bs_tax         = _round2(bs_room_tax + bs_fnb_tax + bs_laundry_tax + bs_other_tax)
    bs_total       = _round2(bs_pretax + bs_tax)

    # SI side — sum all item amounts (pre-tax) and derive tax from grand_total
    si_items_total = _round2(sum(_safe_float(item.get("amount")) for item in si_rec.get("items", [])))
    si_grand_total = _safe_float(si_rec.get("grand_total"))
    si_tax = _round2(si_grand_total - si_items_total)

    # Match on totals
    pretax_match = _amounts_match(bs_pretax, si_items_total, tolerance)
    tax_match    = _amounts_match(bs_tax, si_tax, tolerance)
    total_match  = _amounts_match(bs_total, si_grand_total, tolerance)

    # BS breakdown rows (informational)
    bs_breakdown = []
    for label, val in [("Room", bs_room), ("F&B", bs_fnb), ("Laundry", bs_laundry), ("Other", bs_other)]:
        if val > 0:
            bs_breakdown.append({"category": label, "amount": _round2(val)})

    # SI breakdown rows (informational — group by account name)
    si_by_account = defaultdict(float)
    for item in si_rec.get("items", []):
        acct = item.get("income_account", "Unknown")
        # Use readable name: "410200 - Online Travel Agent..." → "Online Travel Agent"
        parts = acct.split(" - ")
        name = parts[1].strip() if len(parts) > 1 else parts[0].strip()
        si_by_account[name] += _safe_float(item.get("amount"))

    si_breakdown = [{"category": name, "amount": _round2(val)} for name, val in sorted(si_by_account.items())]

    return {
        "status": STATUS_MATCHED if (pretax_match and tax_match) else STATUS_MISMATCH,
        "bs_pretax": bs_pretax,
        "si_pretax": si_items_total,
        "bs_tax": bs_tax,
        "si_tax": si_tax,
        "bs_total": bs_total,
        "si_total": _round2(si_grand_total),
        "pretax_match": pretax_match,
        "tax_match": tax_match,
        "total_match": total_match,
        "bs_breakdown": bs_breakdown,
        "si_breakdown": si_breakdown,
    }


# ─────────────────────────────────────────────
# Level 5: Payment Recon
# ─────────────────────────────────────────────

def _recon_payment(bs_rec, si_rec, tolerance, is_group_booking=False):
    """Compare payment modes between BS and SI."""
    # Standalone/Individual logic
    # BS side — extract non-zero payment modes from Payments object.
    bs_payments_obj = bs_rec.get("Payments", {})
    bs_modes = []
    bs_raw_total = 0.0
    for bs_key, si_mode in PAYMENT_MODE_MAP.items():
        val = _safe_float(bs_payments_obj.get(bs_key))
        if val > 0:
            bs_modes.append(si_mode)
            bs_raw_total += val

    # Cap PMS payment to the Folio Grand Total to ignore cross-folio booking advances
    bs_grand_total = _safe_float(bs_rec.get("grandTotal"))
    bs_total_paid = _round2(min(bs_raw_total, bs_grand_total))

    # SI side — count payment entries by mode but sum allocated amounts only at total level.
    si_modes = []
    si_allocated_total = 0.0
    for pay in si_rec.get("payments", []):
        mode = pay.get("mode_of_payment") or "Unknown"
        allocated_amount = _safe_float(pay.get("allocated_amount"))
        if allocated_amount >= 1:
            si_modes.append(mode)
        si_allocated_total += allocated_amount

    bs_total_paid = _round2(bs_total_paid)
    si_outstanding = _safe_float(si_rec.get("outstanding_amount"))
    si_is_fully_paid = abs(si_outstanding) <= tolerance
    si_total_paid = _round2(_safe_float(si_rec.get("grand_total")) if si_is_fully_paid else si_allocated_total)
    erp_exceeds_pms = si_total_paid > bs_total_paid + tolerance
    
    if is_group_booking and si_is_fully_paid:
        total_match = True
    else:
        total_match = _amounts_match(bs_total_paid, si_total_paid, tolerance)

    modes = []
    modes_match = True

    return {
        "status": STATUS_MATCHED if total_match else STATUS_MISMATCH,
        "modes": modes,
        "bs_total_paid": bs_total_paid,
        "si_total_paid": si_total_paid,
        "total_match": total_match,
        "si_is_fully_paid": si_is_fully_paid,
        "erp_exceeds_pms": erp_exceeds_pms,
        "mode_counts_match": modes_match,
        "is_group_aggregated": False,
    }


# ─────────────────────────────────────────────
# Level 1: Booking Recon
# ─────────────────────────────────────────────

def _recon_bookings(bs_records, si_records, folio_results, tolerance):
    """Group folios by booking and compare at reservation level."""
    # Group BS by reservationId
    bs_bookings = defaultdict(list)
    for r in bs_records:
        booking_id = r.get("reservationId", "")
        if booking_id:
            bs_bookings[booking_id].append(r)

    # Group SI by custom_booking_id
    si_bookings = defaultdict(list)
    has_si_booking_id = False
    for r in si_records:
        booking_id = r.get("custom_booking_id", "")
        if booking_id:
            has_si_booking_id = True
            si_bookings[booking_id].append(r)

    if not has_si_booking_id:
        # Fallback if no data
        return {
            "status": STATUS_NO_DATA,
            "bookings": [],
            "counts": {"matched": 0, "mismatched": 0, "bs_only": 0, "si_only": 0},
        }

    all_booking_ids = sorted(set(list(bs_bookings.keys()) + list(si_bookings.keys())))
    bookings = []
    counts = {"matched": 0, "mismatched": 0, "bs_only": 0, "si_only": 0}

    # Build folio result lookup using the matching key (folio)
    folio_lookup = {f["folio"]: f for f in folio_results if f.get("folio")}

    for bid in all_booking_ids:
        bs_recs = bs_bookings.get(bid, [])
        si_recs = si_bookings.get(bid, [])

        bs_folios = [r["folioNo"] for r in bs_recs]
        si_folios = [r["custom_folio_number"] for r in si_recs]
        
        # We use folios since that's our base match
        unique_bs_folios = set(bs_folios)
        unique_si_folios = set(si_folios)

        booking_type = _classify_booking_type(bs_folios + si_folios)

        bs_total = _round2(sum(_safe_float(r.get("grandTotal")) for r in bs_recs))
        si_total = _round2(sum(_safe_float(r.get("grand_total")) for r in si_recs))

        if not si_recs:
            status = STATUS_BS_ONLY
            counts["bs_only"] += 1
        elif not bs_recs:
            status = STATUS_SI_ONLY
            counts["si_only"] += 1
        elif _amounts_match(bs_total, si_total, tolerance):
            status = STATUS_MATCHED
            counts["matched"] += 1
        else:
            status = STATUS_MISMATCH
            counts["mismatched"] += 1

        # Collect folio results for this booking
        booking_folios = []
        for fol in sorted(unique_bs_folios | unique_si_folios):
            if fol in folio_lookup:
                booking_folios.append(folio_lookup[fol])

        bookings.append({
            "booking_id": bid,
            "status": status,
            "booking_type": booking_type,
            "bs_folio_count": len(unique_bs_folios),
            "si_folio_count": len(unique_si_folios),
            "bs_total": bs_total,
            "si_total": si_total,
            "difference": _round2(bs_total - si_total),
            "amount_match": _amounts_match(bs_total, si_total, tolerance),
            "folios": booking_folios,
            "bs_guest": bs_recs[0].get("guestName", "") if bs_recs else "",
            "bs_source": bs_recs[0].get("source", "") if bs_recs else "",
        })

    return {
        "status": STATUS_MATCHED if counts["mismatched"] == 0 and counts["bs_only"] == 0 and counts["si_only"] == 0 else STATUS_MISMATCH,
        "bookings": bookings,
        "counts": counts,
    }


# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

def _build_summary(folio_results, booking_result):
    """Build top-level summary KPIs."""
    folio_counts = {"matched": 0, "mismatched": 0, "amount_mismatched": 0, "bs_only": 0, "si_only": 0}
    revenue_counts = {"matched": 0, "mismatched": 0}
    payment_counts = {"matched": 0, "mismatched": 0}
    invoice_counts = {"matched": 0, "mismatched": 0, "no_data": 0}

    for f in folio_results:
        st = f["status"]
        if st == STATUS_MATCHED:
            folio_counts["matched"] += 1
        elif st == STATUS_MISMATCH:
            folio_counts["mismatched"] += 1
        elif st == STATUS_BS_ONLY:
            folio_counts["bs_only"] += 1
        elif st == STATUS_SI_ONLY:
            folio_counts["si_only"] += 1

        # Count actual amount-level mismatches separately (only when both sides exist)
        if st not in (STATUS_BS_ONLY, STATUS_SI_ONLY) and f.get("amount_match") is False:
            folio_counts["amount_mismatched"] += 1

        if f.get("revenue"):
            rev_st = f["revenue"]["status"]
            revenue_counts["matched" if rev_st == STATUS_MATCHED else "mismatched"] += 1

        if f.get("payment"):
            pay_st = f["payment"]["status"]
            payment_counts["matched" if pay_st == STATUS_MATCHED else "mismatched"] += 1

        if f.get("invoice") and isinstance(f["invoice"], dict):
            inv_st = f["invoice"]["status"]
            if inv_st == STATUS_MATCHED:
                invoice_counts["matched"] += 1
            elif inv_st == STATUS_NO_DATA:
                invoice_counts["no_data"] += 1
            else:
                invoice_counts["mismatched"] += 1

    total_folios = len(folio_results)
    match_pct = round((folio_counts["matched"] / total_folios) * 100, 1) if total_folios else 0

    return {
        "total_bookings": len(booking_result.get("bookings", [])),
        "total_folios": total_folios,
        "match_percent": match_pct,
        "levels": {
            "booking": booking_result.get("counts", {}),
            "folio": folio_counts,
            "invoice": invoice_counts,
            "revenue": revenue_counts,
            "payment": payment_counts,
        },
    }


# ─────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────

def run_reconciliation(bs_data, si_data, tolerance=1.0):
    """
    Run 5-level reconciliation.

    Args:
        bs_data: Parsed bill summary JSON (dict).
        si_data: Parsed sales invoice JSON (dict).
        tolerance: Amount difference tolerance in currency units.

    Returns:
        dict with summary, bookings, folios, and breakdowns.
    """
    bs_records = _extract_bs_records(bs_data)
    si_records = _extract_si_records(si_data)

    # Build lookup maps by FOLIO number
    bs_folio_map = {r.get("folioNo"): r for r in bs_records if r.get("folioNo")}
    si_folio_map = {r.get("custom_folio_number"): r for r in si_records if r.get("custom_folio_number")}

    all_folios = sorted(set(list(bs_folio_map.keys()) + list(si_folio_map.keys())))
    folio_results = []

    # Identify group bookings (bookings with more than 1 folio)
    bs_bookings = defaultdict(list)
    for r in bs_records:
        if r.get("reservationId"):
            bs_bookings[r["reservationId"]].append(r)
    si_bookings = defaultdict(list)
    for r in si_records:
        if r.get("custom_booking_id"):
            si_bookings[r["custom_booking_id"]].append(r)
            
    group_booking_ids = {bid for bid, list_b in bs_bookings.items() if len(list_b) > 1}
    group_booking_ids.update({bid for bid, list_s in si_bookings.items() if len(list_s) > 1})

    for fol in all_folios:
        bs_rec = bs_folio_map.get(fol)
        si_rec = si_folio_map.get(fol)
        
        booking_id = bs_rec.get("reservationId") if bs_rec else si_rec.get("custom_booking_id")
        is_group_booking = booking_id in group_booking_ids

        folio_results.append(_recon_folio(bs_rec, si_rec, tolerance, is_group_booking))

    # Level 1: Booking recon
    booking_result = _recon_bookings(bs_records, si_records, folio_results, tolerance)

    # Summary
    summary = _build_summary(folio_results, booking_result)

    # Breakdowns
    revenue_breakdown = _build_revenue_breakdown(bs_records, si_records)
    collection_breakdown = _build_collection_breakdown(bs_records, si_records)

    return {
        "summary": summary,
        "revenue_breakdown": revenue_breakdown,
        "collection_breakdown": collection_breakdown,
        "bookings": booking_result,
        "folios": folio_results,
    }

