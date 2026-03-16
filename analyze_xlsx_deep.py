import pandas as pd
import os

base = os.path.dirname(os.path.abspath(__file__))
bs = pd.read_excel(os.path.join(base, "Kota Bill Summary Finance Report Jan.xlsx"))
si = pd.read_excel(os.path.join(base, "Kota Sales Invoice Jan.xlsx"))

# =====================================================
# PART 1: BOOKING-LEVEL ANALYSIS (Level 1)
# =====================================================
print("=" * 70)
print("PART 1: BOOKING-LEVEL ANALYSIS")
print("=" * 70)

bs_bookings = bs.groupby("Booking #").agg(
    folio_count=("Folio Number", "nunique"),
    total_grand=("Grand Total", "sum"),
    total_paid=("Total Paid", "sum"),
    total_balance=("Balance", "sum"),
).reset_index()

si_bookings = si.groupby("Booking ID").agg(
    folio_count=("Folio Number", "nunique"),
    total_grand=("Grand Total", "sum"),
).reset_index()

print(f"BS unique bookings: {bs['Booking #'].nunique()}")
print(f"SI unique bookings: {si['Booking ID'].nunique()}")

# Multi-folio bookings
multi = bs_bookings[bs_bookings["folio_count"] > 1]
print(f"\nMulti-folio bookings in BS: {len(multi)}")
print(multi[["Booking #", "folio_count", "total_grand"]].to_string(index=False))

# Booking cross-reference
bs_bk = set(bs["Booking #"].dropna().unique())
si_bk = set(si["Booking ID"].dropna().unique())
print(f"\nBookings in BS only ({len(bs_bk - si_bk)}): {sorted(bs_bk - si_bk)[:10]}")
print(f"Bookings in SI only ({len(si_bk - bs_bk)}): {sorted(si_bk - bs_bk)[:10]}")
print(f"Bookings in both: {len(bs_bk & si_bk)}")

# =====================================================
# PART 2: FOLIO-LEVEL ANALYSIS (Level 2)
# =====================================================
print("\n" + "=" * 70)
print("PART 2: FOLIO-LEVEL ANALYSIS")
print("=" * 70)

merged = pd.merge(
    bs[["Folio Number", "Grand Total", "Total Paid", "Balance", "Booking #", "Guest Name", "Booking Type"]],
    si[["Folio Number", "Grand Total", "Status", "Booking ID", "Booking Type", "Room Type"]],
    on="Folio Number",
    how="outer",
    suffixes=("_BS", "_SI"),
    indicator=True
)

print(f"Merge results:")
print(merged["_merge"].value_counts().to_string())

# Amount differences at folio level
both = merged[merged["_merge"] == "both"].copy()
both["Diff"] = both["Grand Total_BS"] - both["Grand Total_SI"]
both["AbsDiff"] = both["Diff"].abs()

print(f"\nAmount comparison (folio level):")
print(f"  Exact match (diff=0): {(both['AbsDiff'] == 0).sum()}")
print(f"  Within ₹1: {(both['AbsDiff'] <= 1).sum()}")
print(f"  Within ₹5: {(both['AbsDiff'] <= 5).sum()}")
print(f"  > ₹5: {(both['AbsDiff'] > 5).sum()}")

mismatches = both[both["AbsDiff"] > 1].sort_values("AbsDiff", ascending=False)[["Folio Number", "Grand Total_BS", "Grand Total_SI", "Diff", "AbsDiff"]]
if len(mismatches) > 0:
    print(f"\nMismatches > ₹1:")
    print(mismatches.head(20).to_string(index=False))

# =====================================================
# PART 3: INVOICE-LEVEL ANALYSIS (Level 3)
# =====================================================
print("\n" + "=" * 70)
print("PART 3: INVOICE-LEVEL ANALYSIS")
print("=" * 70)

bs_inv = set(bs["Invoice Number"].dropna().unique())
si_inv = set(si["Invoice Number"].dropna().unique())
print(f"BS unique invoices: {len(bs_inv)}")
print(f"SI unique invoices: {len(si_inv)}")
print(f"In BS only: {len(bs_inv - si_inv)}")
print(f"In SI only: {len(si_inv - bs_inv)}")
print(f"In both: {len(bs_inv & si_inv)}")

# Check if folio-invoice is 1:1
bs_fi = bs[["Folio Number", "Invoice Number"]].dropna().drop_duplicates()
print(f"\nBS Folio-Invoice pairs: {len(bs_fi)}")
print(f"BS Folios with multiple invoices: {bs_fi.groupby('Folio Number').filter(lambda x: len(x) > 1)['Folio Number'].nunique()}")
print(f"BS Invoices with multiple folios: {bs_fi.groupby('Invoice Number').filter(lambda x: len(x) > 1)['Invoice Number'].nunique()}")

si_fi = si[["Folio Number", "Invoice Number"]].dropna().drop_duplicates()
print(f"\nSI Folio-Invoice pairs: {len(si_fi)}")
print(f"SI Folios with multiple invoices: {si_fi.groupby('Folio Number').filter(lambda x: len(x) > 1)['Folio Number'].nunique()}")

# =====================================================
# PART 4: REVENUE ANALYSIS (Level 4)
# =====================================================
print("\n" + "=" * 70)
print("PART 4: REVENUE BREAKDOWN (Bill Summary)")
print("=" * 70)

rev_cols = ["Total Room Revenue", "Room Revenue Tax", "F&B Revenue", "F&B Non Revenue",
            "laundryRevenue", "laundryRevenueTax", "Other Revenue", "Other Revenue Tax"]
print("Revenue columns summary:")
for col in rev_cols:
    s = bs[col].dropna()
    nonzero = (s != 0).sum()
    print(f"  {col:25s} -> non-zero: {nonzero:4d}, sum: {s.sum():12.2f}, mean: {s.mean():10.2f}")

# Check: Total Revenue + Non Revenue == Grand Total?
bs_check = bs.copy()
bs_check["calc_grand"] = bs_check["Total Revenue"] + bs_check["Non Revenue"]
bs_check["grand_diff"] = (bs_check["Grand Total"] - bs_check["calc_grand"]).abs()
print(f"\nTotal Revenue + Non Revenue == Grand Total?")
print(f"  Exact match: {(bs_check['grand_diff'] == 0).sum()}")
print(f"  Within ₹1: {(bs_check['grand_diff'] <= 1).sum()}")
print(f"  Max diff: {bs_check['grand_diff'].max():.2f}")

# =====================================================
# PART 5: PAYMENT ANALYSIS (Level 5)
# =====================================================
print("\n" + "=" * 70)
print("PART 5: PAYMENT ANALYSIS (Bill Summary)")
print("=" * 70)

pay_cols = ["upi", "billToTravel", "cash", "creditCard", "bankAccount", "debitCard", "billToCompany"]
print("Payment mode usage:")
for col in pay_cols:
    s = bs[col].dropna()
    count = len(s)
    total = s.sum()
    print(f"  {col:15s} -> used: {count:4d} times, total: ₹{total:12.2f}")

# Check: sum of payments == Total Paid?
bs_pay = bs[pay_cols].fillna(0).sum(axis=1)
bs_check["pay_sum"] = bs_pay
bs_check["pay_diff"] = (bs_check["Total Paid"] - bs_check["pay_sum"]).abs()
print(f"\nSum of payment modes == Total Paid?")
print(f"  Exact match: {(bs_check['pay_diff'] == 0).sum()}")
print(f"  Within ₹1: {(bs_check['pay_diff'] <= 1).sum()}")
print(f"  Max diff: {bs_check['pay_diff'].max():.2f}")

big_diff = bs_check[bs_check['pay_diff'] > 1][["Folio Number", "Total Paid", "pay_sum", "pay_diff"]]
if len(big_diff) > 0:
    print(f"\nPayment mismatches > ₹1: {len(big_diff)}")
    print(big_diff.head(10).to_string(index=False))

# Multiple payment modes per folio
multi_pay = bs[pay_cols].notna().sum(axis=1)
print(f"\nPayment modes per folio:")
print(multi_pay.value_counts().sort_index().to_string())

# =====================================================
# PART 6: BOOKING TYPE MAPPING
# =====================================================
print("\n" + "=" * 70)
print("PART 6: BOOKING TYPE CROSS-REFERENCE")
print("=" * 70)

bt_merged = pd.merge(
    bs[["Folio Number", "Booking Type"]].rename(columns={"Booking Type": "BS_BookingType"}),
    si[["Folio Number", "Booking Type"]].rename(columns={"Booking Type": "SI_BookingType"}),
    on="Folio Number"
)
print("Booking type mapping:")
print(bt_merged.groupby(["BS_BookingType", "SI_BookingType"]).size().reset_index(name="count").to_string(index=False))

# =====================================================
# PART 7: STATUS / BALANCE ANALYSIS
# =====================================================
print("\n" + "=" * 70)
print("PART 7: STATUS & BALANCE")
print("=" * 70)

print(f"BS Balance distribution:")
print(f"  Zero: {(bs['Balance'] == 0).sum()}")
print(f"  Non-zero: {(bs['Balance'] != 0).sum()}")
if (bs['Balance'] != 0).any():
    print(f"  Non-zero balances:")
    print(bs[bs['Balance'] != 0][["Folio Number", "Grand Total", "Total Paid", "Balance"]].to_string(index=False))

print(f"\nSI Status distribution:")
print(si['Status'].value_counts().to_string())

print(f"\nSI Outstanding Amount distribution:")
print(si['Outstanding Amount'].value_counts().to_string())

# SI Draft invoices
drafts = si[si['Status'] == 'Draft']
print(f"\nDraft invoices ({len(drafts)}):")
if len(drafts) > 0:
    print(drafts[["ID", "Folio Number", "Grand Total", "Booking ID"]].to_string(index=False))
