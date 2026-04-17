import json, os
base = os.path.dirname(os.path.abspath(__file__))

data = json.load(open(os.path.join(base, "bill-summary.json")))
records = data.get("data", [])

# Unique bookingType values
types = set(r.get("bookingType", "") for r in records if r.get("folioNo"))
print("bookingType values:", sorted(types))

# Unique source values
sources = set(r.get("source", "") for r in records if r.get("folioNo"))
print("source values:", sorted(sources))

# TPA bookings
tpa = [r for r in records if "tpa" in str(r.get("bookingType", "")).lower() and r.get("folioNo")]
print(f"\nTPA bookings: {len(tpa)}")
for r in tpa[:5]:
    print(f"  folio={r['folioNo']}, guest={r.get('guestName')}, source={r.get('source')}, "
          f"billToCompany={r.get('Payments',{}).get('billToCompany',0)}, "
          f"billToTravel={r.get('Payments',{}).get('billToTravel',0)}")

# Folios with billToCompany > 0
btc = [r for r in records if r.get("Payments", {}).get("billToCompany", 0) > 0 and r.get("folioNo")]
print(f"\nFolios with billToCompany > 0: {len(btc)}")
for r in btc[:5]:
    print(f"  folio={r['folioNo']}, bookingType={r.get('bookingType')}, source={r.get('source')}, amt={r.get('Payments',{}).get('billToCompany',0)}")

# Folios with billToTravel > 0
btt = [r for r in records if r.get("Payments", {}).get("billToTravel", 0) > 0 and r.get("folioNo")]
print(f"\nFolios with billToTravel > 0: {len(btt)}")
for r in btt[:5]:
    print(f"  folio={r['folioNo']}, bookingType={r.get('bookingType')}, source={r.get('source')}, amt={r.get('Payments',{}).get('billToTravel',0)}")

# All unique payment keys
all_keys = set()
for r in records:
    all_keys.update(r.get("Payments", {}).keys())
print(f"\nAll payment keys: {sorted(all_keys)}")

# Group vs Individual count
from collections import defaultdict
by_type = defaultdict(int)
for r in records:
    if r.get("folioNo"):
        by_type[r.get("bookingType", "unknown")] += 1
print(f"\nBooking type counts: {dict(by_type)}")
