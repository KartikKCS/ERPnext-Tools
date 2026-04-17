import json, os
from collections import defaultdict

base = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(base, "bill-summary.json")))
records = [r for r in data.get("data", []) if r.get("folioNo")]

print("=" * 70)
print("FULL CROSS-TABULATION: bookingType × source × payment signals")
print("=" * 70)

# Cross-tab: bookingType x source
cross = defaultdict(int)
for r in records:
    bt = r.get("bookingType", "—")
    src = r.get("source", "") or "—"
    cross[(bt, src)] += 1

print("\nbookingType × source:")
for (bt, src), ct in sorted(cross.items()):
    print(f"  {bt:25s} | {src:30s} | {ct}")

# Detailed look at billToCompany folios
print("\n" + "=" * 70)
print("COMPANY BOOKING CANDIDATES (billToCompany > 0)")
print("=" * 70)

btc_folios = [r for r in records if r.get("Payments", {}).get("billToCompany", 0) > 0]
for r in btc_folios:
    pays = r.get("Payments", {})
    non_zero = {k: v for k, v in pays.items() if v and float(v) > 0}
    print(f"\n  Folio: {r['folioNo']}")
    print(f"  Guest: {r.get('guestName', '—')}")
    print(f"  BookingType: {r.get('bookingType', '—')}")
    print(f"  Source: {r.get('source', '—') or '—'}")
    print(f"  Room: {r.get('roomNo', '—')}")
    print(f"  GrandTotal: {r.get('grandTotal', 0)}")
    print(f"  Balance: {r.get('balance', 0)}")
    print(f"  Non-zero payments: {non_zero}")
    print(f"  ReservationId: {r.get('reservationId', '—')}")

# Check: any TPA booking also has billToCompany?
print("\n" + "=" * 70)
print("OVERLAP CHECK: TPA + billToCompany > 0")
print("=" * 70)
tpa_and_btc = [r for r in records if "tpa" in str(r.get("bookingType", "")).lower() and r.get("Payments", {}).get("billToCompany", 0) > 0]
print(f"Count: {len(tpa_and_btc)}")
for r in tpa_and_btc:
    print(f"  {r['folioNo']} | {r.get('bookingType')} | billToCompany={r.get('Payments',{}).get('billToCompany',0)}")

# Check: any individual booking also has billToTravel?
print("\n" + "=" * 70)
print("OVERLAP CHECK: Individual + billToTravel > 0")
print("=" * 70)
ind_btt = [r for r in records if "individual" in str(r.get("bookingType", "")).lower() and r.get("Payments", {}).get("billToTravel", 0) > 0]
print(f"Count: {len(ind_btt)}")
for r in ind_btt:
    print(f"  {r['folioNo']} | {r.get('bookingType')} | billToTravel={r.get('Payments',{}).get('billToTravel',0)}")

# Group booking analysis - do any multi-folio reservations have TPA?
print("\n" + "=" * 70)
print("GROUP BOOKING ANALYSIS (multi-folio reservations)")
print("=" * 70)
by_res = defaultdict(list)
for r in records:
    rid = r.get("reservationId", "")
    if rid:
        by_res[rid].append(r)

groups = {rid: recs for rid, recs in by_res.items() if len(recs) > 1}
print(f"Total group reservations: {len(groups)}")
for rid, recs in groups.items():
    types = set(r.get("bookingType", "") for r in recs)
    sources = set(r.get("source", "") or "—" for r in recs)
    folios = [r["folioNo"] for r in recs]
    print(f"\n  Reservation: {rid}")
    print(f"  Folios ({len(folios)}): {folios}")
    print(f"  BookingTypes: {types}")
    print(f"  Sources: {sources}")
