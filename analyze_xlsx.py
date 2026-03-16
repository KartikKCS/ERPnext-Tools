import pandas as pd
import os

base = os.path.dirname(os.path.abspath(__file__))

# === BILL SUMMARY ===
bs_path = os.path.join(base, "Kota Bill Summary Finance Report Jan.xlsx")
bs = pd.read_excel(bs_path)
print("=" * 60)
print("BILL SUMMARY")
print("=" * 60)
print(f"Shape: {bs.shape[0]} rows x {bs.shape[1]} columns")
print(f"\nColumns ({len(bs.columns)}):")
for i, col in enumerate(bs.columns):
    print(f"  {i+1:2d}. {col} (dtype: {bs[col].dtype})")
print(f"\nFirst 3 rows (transposed):")
print(bs.head(3).T.to_string())
print(f"\nNull counts (non-zero only):")
nulls = bs.isnull().sum()
print(nulls[nulls > 0].to_string() if nulls.any() else "  No nulls")
print(f"\nLow-cardinality columns:")
for col in bs.columns:
    n = bs[col].nunique()
    if n < 15:
        vals = bs[col].dropna().unique().tolist()
        print(f"  {col} ({n} unique): {vals}")

print("\n\n")

# === SALES INVOICE ===
si_path = os.path.join(base, "Kota Sales Invoice Jan.xlsx")
si = pd.read_excel(si_path)
print("=" * 60)
print("SALES INVOICE")
print("=" * 60)
print(f"Shape: {si.shape[0]} rows x {si.shape[1]} columns")
print(f"\nColumns ({len(si.columns)}):")
for i, col in enumerate(si.columns):
    print(f"  {i+1:2d}. {col} (dtype: {si[col].dtype})")
print(f"\nFirst 3 rows (transposed):")
print(si.head(3).T.to_string())
print(f"\nNull counts (non-zero only):")
nulls = si.isnull().sum()
print(nulls[nulls > 0].to_string() if nulls.any() else "  No nulls")
print(f"\nLow-cardinality columns:")
for col in si.columns:
    n = si[col].nunique()
    if n < 15:
        vals = si[col].dropna().unique().tolist()
        print(f"  {col} ({n} unique): {vals}")

# === CROSS-REFERENCE ===
print("\n\n")
print("=" * 60)
print("CROSS-REFERENCE")
print("=" * 60)
folio_col_bs = None
folio_col_si = None
for col in bs.columns:
    if 'folio' in col.lower():
        folio_col_bs = col
        break
for col in si.columns:
    if 'folio' in col.lower():
        folio_col_si = col
        break

if folio_col_bs and folio_col_si:
    bs_folios = set(bs[folio_col_bs].dropna().astype(str))
    si_folios = set(si[folio_col_si].dropna().astype(str))
    print(f"BS folio col: '{folio_col_bs}' ({len(bs_folios)} unique)")
    print(f"SI folio col: '{folio_col_si}' ({len(si_folios)} unique)")
    print(f"In BS only: {len(bs_folios - si_folios)} -> {sorted(bs_folios - si_folios)[:5]}")
    print(f"In SI only: {len(si_folios - bs_folios)} -> {sorted(si_folios - bs_folios)[:5]}")
    print(f"In both: {len(bs_folios & si_folios)}")
else:
    print(f"Could not find folio columns. BS cols: {list(bs.columns)}, SI cols: {list(si.columns)}")
