import pandas as pd
import numpy as np
import re
from dateutil.parser import parse as parse_date
import io
import frappe

def _clean_amount(val):
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    # Remove currency symbols, commas, and handle CR/DR
    val = str(val).upper().replace(',', '').strip()
    if not val:
        return 0.0
    
    # Handle values like "100.00 Cr", "50.00 Dr"
    multiplier = 1
    if val.endswith('CR') or ' CR' in val:
        val = val.replace('CR', '').strip()
    elif val.endswith('DR') or ' DR' in val:
        val = val.replace('DR', '').strip()
        # Depending on context, we might make it negative, but 
        # usually Debit and Credit are separate columns so we just take the absolute.
        # If it's a combined column, we should handle that in the column mapping.

    try:
        # extract just the number part
        num = re.findall(r"[-+]?\d*\.\d+|\d+", val)
        if num:
            return float(num[0]) * multiplier
        return 0.0
    except ValueError:
        return 0.0

def _parse_date_safe(val):
    if pd.isna(val) or not str(val).strip():
        return pd.NaT
    if isinstance(val, pd.Timestamp):
        return val
    val = str(val).strip()
    try:
        # dateutil parser is generally very good at inferring
        # If the date contains both a 4 digit year and numbers, dayfirst is a good default for India
        return parse_date(val, dayfirst=True)
    except Exception:
        return pd.NaT

def get_column_mapping(columns):
    """
    Given a list of column headers (strings), return a dictionary mapping 
    the standardized name to the actual column name.
    """
    mapping = {}
    
    date_patterns = [r'^date$', r'^transaction\s*date$', r'^value\s*date$', r'^txn\s*date$']
    desc_patterns = [r'^narration$', r'^description$', r'^particulars$', r'^details$', r'^remarks$', r'^name$', r'^mode$']
    ref_patterns = [r'^chq.*(no|num|number).*', r'^ref.*(no|num|number).*', r'^reference.*', r'^instrument.*', r'.*ref.*no.*']
    withdraw_patterns = [r'^debit.*', r'^withdrawal.*', r'^dr$', r'^dr\s+.*', r'^dr\..*', r'^amount\s*\(dr\)$']
    deposit_patterns = [r'^credit.*', r'^deposit.*', r'^cr$', r'^cr\s+.*', r'^cr\..*', r'^amount\s*\(cr\)$']
    balance_patterns = [r'^balance.*', r'^closing\s*balance$']
    amount_patterns = [r'^amount$']
    indicator_patterns = [r'^drcr$', r'^dr/cr$', r'^type$', r'^indicator$', r'^dr.*cr$']

    def match_pattern(col, patterns):
        col_clean = str(col).lower().strip()
        for p in patterns:
            if re.search(p, col_clean):
                return True
        return False

    for col in columns:
        if 'date' not in mapping and match_pattern(col, date_patterns):
            mapping['date'] = col
        elif 'description' not in mapping and match_pattern(col, desc_patterns):
            mapping['description'] = col
        elif 'reference_number' not in mapping and match_pattern(col, ref_patterns):
            mapping['reference_number'] = col
        elif 'withdrawal' not in mapping and match_pattern(col, withdraw_patterns):
            mapping['withdrawal'] = col
        elif 'deposit' not in mapping and match_pattern(col, deposit_patterns):
            mapping['deposit'] = col
        elif 'balance' not in mapping and match_pattern(col, balance_patterns):
            mapping['balance'] = col
        elif 'amount' not in mapping and match_pattern(col, amount_patterns):
            mapping['amount'] = col
        elif 'indicator' not in mapping and match_pattern(col, indicator_patterns):
            mapping['indicator'] = col

    return mapping

def read_bank_statement(file_content, file_extension):
    """
    Reads the file content (bytes) and attempts to find the actual table header.
    Returns a raw pandas DataFrame with the correct headers.
    """
    try:
        if file_extension in ['xls', 'xlsx']:
            df_raw = pd.read_excel(io.BytesIO(file_content), header=None)
            
            header_idx = 0
            for idx, row in df_raw.iterrows():
                row_str = " ".join([str(x).lower() for x in row.values if pd.notna(x)])
                if (('date' in row_str or 'txn' in row_str) and 
                    ('narration' in row_str or 'description' in row_str or 'particulars' in row_str or 'ref' in row_str or 'cheque' in row_str)):
                    header_idx = idx
                    break

            df = df_raw.iloc[header_idx+1:].copy()
            columns = [str(x).strip() for x in df_raw.iloc[header_idx].values]

        elif file_extension == 'csv':
            import csv
            # Read all lines to find the header
            if isinstance(file_content, bytes):
                text_content = file_content.decode('utf-8', errors='replace')
            else:
                text_content = file_content
            lines = text_content.splitlines()
            reader = csv.reader(lines)
            
            header_idx = 0
            parsed_rows = list(reader)
            
            for idx, row in enumerate(parsed_rows):
                row_str = " ".join([str(x).lower() for x in row if x])
                if (('date' in row_str or 'txn' in row_str) and 
                    ('narration' in row_str or 'description' in row_str or 'particulars' in row_str or 'ref' in row_str or 'cheque' in row_str)):
                    header_idx = idx
                    break
            
            columns = [str(x).strip() for x in parsed_rows[header_idx]]
            df = pd.DataFrame(parsed_rows[header_idx+1:])
        else:
            raise ValueError(f"Unsupported file extension: {file_extension}")
            
    except Exception as e:
        frappe.log_error(f"Error reading file content: {e}")
        raise ValueError(f"Failed to read the uploaded file: {str(e)}")

    # Clean the column names
    # Handle duplicate/empty columns by appending numbers
    seen = {}
    final_cols = []
    for col in columns:
        if col.lower() == 'nan' or col == '' or col.lower() == 'none':
            col = 'Unnamed'
        if col in seen:
            seen[col] += 1
            final_cols.append(f"{col}_{seen[col]}")
        else:
            seen[col] = 0
            final_cols.append(col)
            
    # Ensure df has the same number of columns as final_cols
    if len(df.columns) > len(final_cols):
        df = df.iloc[:, :len(final_cols)]
    elif len(df.columns) < len(final_cols):
        for i in range(len(final_cols) - len(df.columns)):
            df[len(df.columns)] = np.nan
            
    df.columns = final_cols
    df = df.reset_index(drop=True)
    
    return df

def parse_bank_statement(file_content, file_extension, custom_mapping=None):
    """
    Parses a bank statement file (CSV or Excel) and standardizes it.
    Returns a list of dictionaries ready to be inserted into ERPNext Bank Transaction.
    """
    df = read_bank_statement(file_content, file_extension)
    
    print("Columns:", list(df.columns))
    try:
        print(df[['Debit', 'Credit']].head(5))
    except:
        pass
        
    if custom_mapping:
        mapping = {}
        for key, cols in custom_mapping.items():
            if not cols:
                continue
            if isinstance(cols, list) and len(cols) > 1:
                merged_col_name = f"_merged_{key}"
                df[merged_col_name] = df[cols[0]].astype(str).replace('nan', '')
                for col in cols[1:]:
                    df[merged_col_name] += " " + df[col].astype(str).replace('nan', '')
                # Clean up multiple spaces
                df[merged_col_name] = df[merged_col_name].str.strip().replace(r'\s+', ' ', regex=True)
                mapping[key] = merged_col_name
            elif isinstance(cols, list) and len(cols) == 1:
                mapping[key] = cols[0]
            else:
                mapping[key] = cols
    else:
        mapping = get_column_mapping(df.columns)
    
    if 'date' not in mapping:
        raise ValueError("Could not identify the Date column in the statement.")
    if 'description' not in mapping:
        raise ValueError("Could not identify the Description/Narration column in the statement.")
    if 'withdrawal' not in mapping and 'deposit' not in mapping:
        if 'amount' not in mapping:
            raise ValueError("Could not identify Deposit, Withdrawal, or Amount columns in the statement.")

    # Apply mapping
    std_df = pd.DataFrame()
    
    # Date
    std_df['date'] = df[mapping['date']].apply(_parse_date_safe)
    
    # Description (Combine Mode and Name if we want, but sticking to mapped col is safer)
    # If the user's file had both 'mode' and 'name', the first one matched.
    std_df['description'] = df[mapping['description']].astype(str).str.strip()
    
    # Ref Number
    if 'reference_number' in mapping:
        std_df['reference_number'] = df[mapping['reference_number']].astype(str).replace('nan', '').str.strip()
    else:
        std_df['reference_number'] = ''

    # Handle combined Amount + Indicator column
    if 'withdrawal' not in mapping and 'deposit' not in mapping and 'amount' in mapping:
        amounts = df[mapping['amount']].apply(_clean_amount)
        if 'indicator' in mapping:
            inds = df[mapping['indicator']].astype(str).str.strip().str.lower()
            std_df['withdrawal'] = amounts.where(inds.isin(['db', 'dr', 'debit']), 0.0)
            std_df['deposit'] = amounts.where(inds.isin(['cr', 'credit']), 0.0)
        else:
            # If there's no indicator, maybe amounts are negative for withdrawals
            std_df['withdrawal'] = amounts.apply(lambda x: abs(x) if x < 0 else 0.0)
            std_df['deposit'] = amounts.apply(lambda x: x if x > 0 else 0.0)
    else:
        if 'withdrawal' in mapping:
            std_df['withdrawal'] = df[mapping['withdrawal']].apply(_clean_amount)
        else:
            std_df['withdrawal'] = 0.0

        if 'deposit' in mapping:
            std_df['deposit'] = df[mapping['deposit']].apply(_clean_amount)
    std_df['__row_num'] = df.index + 2
    
    records = []
    failed_rows = []
    
    for idx, row in std_df.iterrows():
        row_num = row['__row_num']
        
        # Helper to get clean original row as dict
        def get_original_row_dict():
            orig_row = df.loc[idx].to_dict()
            return {str(k): (str(v) if pd.notna(v) else "") for k, v in orig_row.items()}

        if pd.isna(row['date']):
            failed_rows.append({"row_num": row_num, "reason": "Invalid or missing date", "row_data": get_original_row_dict()})
            continue
            
        if row['deposit'] <= 0 and row['withdrawal'] <= 0:
            failed_rows.append({"row_num": row_num, "reason": "Amount missing or zero", "row_data": get_original_row_dict()})
            continue
            
        row_dict = row.to_dict()
        row_dict['date'] = row_dict['date'].strftime('%Y-%m-%d')
        # Keep __row_num for potential duplicate reporting
        records.append(row_dict)
        
    return {
        "records": records,
        "failed_rows": failed_rows,
        "total_rows": len(df)
    }
