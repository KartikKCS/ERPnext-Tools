# Copyright (c) 2026, Katalystic Consulting and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import traceback

class SmartStatementImport(Document):
    @frappe.whitelist()
    def get_file_headers(self):
        if not self.import_file:
            frappe.throw("Please attach a Bank Statement file before configuring mapping.")
            
        from reconciliation_toolkit.utils.statement_parser import read_bank_statement, get_column_mapping
        
        file_doc = frappe.get_doc("File", {"file_url": self.import_file})
        file_content = file_doc.get_content()
        file_extension = file_doc.file_name.split('.')[-1].lower() if '.' in file_doc.file_name else "csv"
        
        try:
            df = read_bank_statement(file_content, file_extension)
            columns = list(df.columns)
            guessed_mapping = get_column_mapping(columns)
            return {
                "columns": columns,
                "guessed_mapping": guessed_mapping
            }
        except Exception as e:
            frappe.log_error(f"Error getting headers: {e}")
            frappe.throw(f"Failed to read the file headers: {str(e)}")

    @frappe.whitelist()
    def process_file(self):
        if not self.import_file:
            frappe.throw("Please attach a Bank Statement file before processing.")
            
        try:
            from reconciliation_toolkit.utils.statement_parser import parse_bank_statement
            
            # Read the file content
            file_doc = frappe.get_doc("File", {"file_url": self.import_file})
            file_content = file_doc.get_content()
            file_extension = file_doc.file_name.split('.')[-1].lower() if '.' in file_doc.file_name else "csv"
            
            # Check for custom mapping
            custom_mapping = frappe.parse_json(self.custom_mapping_json) if self.custom_mapping_json else None
            
            # Parse the records
            parse_result = parse_bank_statement(file_content, file_extension, custom_mapping=custom_mapping)
            if isinstance(parse_result, dict):
                records = parse_result.get("records", [])
                failed_rows = parse_result.get("failed_rows", [])
                total_rows = parse_result.get("total_rows", 0)
            else:
                records = parse_result
                failed_rows = []
                total_rows = len(records)
            
            if not records and not failed_rows:
                frappe.throw("No valid transactions found in the statement.")
                
            # Get Currency
            currency = self.currency
            if not currency:
                linked_account = frappe.db.get_value("Bank Account", self.bank_account, "account")
                if linked_account:
                    currency = frappe.db.get_value("Account", linked_account, "account_currency")
                
                if not currency:
                    currency = frappe.db.get_value("Company", self.company, "default_currency")
            
            transactions_created = 0
            successful_transactions = []
            
            for row in records:
                try:
                    # Duplicate check
                    is_duplicate = frappe.db.exists("Bank Transaction", {
                        "bank_account": self.bank_account,
                        "date": row['date'],
                        "deposit": row.get('deposit', 0.0),
                        "withdrawal": row.get('withdrawal', 0.0),
                        "reference_number": row.get('reference_number', ''),
                        "description": row.get('description', ''),
                        "docstatus": ("<", 2)
                    })
                    
                    if is_duplicate:
                        clean_row = row.copy()
                        clean_row.pop('__row_num', None)
                        row_data_str = " | ".join([f"{k}: {v}" for k, v in clean_row.items() if v])
                        failed_rows.append({"row_num": row.get('__row_num') or "N/A", "reason": "Duplicate transaction", "row_data": row_data_str})
                        continue
                    
                    bt = frappe.get_doc({
                        "doctype": "Bank Transaction",
                        "bank_account": self.bank_account,
                        "date": row['date'],
                        "deposit": row.get('deposit', 0.0),
                        "withdrawal": row.get('withdrawal', 0.0),
                        "description": row.get('description', ''),
                        "reference_number": row.get('reference_number', ''),
                        "currency": currency,
                        "company": self.company
                    })
                    bt.insert()
                    transactions_created += 1
                    
                    # Remove __row_num before sending to frontend
                    clean_row = row.copy()
                    clean_row.pop('__row_num', None)
                    successful_transactions.append(clean_row)
                    
                except Exception as e:
                    clean_row = row.copy()
                    clean_row.pop('__row_num', None)
                    row_data_str = " | ".join([f"{k}: {v}" for k, v in clean_row.items() if v])
                    failed_rows.append({"row_num": row.get('__row_num') or "N/A", "reason": f"Insertion error: {str(e)}", "row_data": row_data_str})
                
            self.db_set("status", "Processed")
            self.db_set("transactions_created", transactions_created)
            self.db_set("error_log", "")
            
            # Sort failed_rows by row_num
            failed_rows = sorted(failed_rows, key=lambda x: x.get('row_num') if isinstance(x.get('row_num'), int) else 999999)
            
            return {
                "total_rows": total_rows,
                "successful_rows": transactions_created,
                "failed_rows": failed_rows,
                "transactions": successful_transactions
            }

        except Exception as e:
            self.db_set("status", "Failed")
            self.db_set("error_log", str(e) + "\n" + traceback.format_exc())
            frappe.msgprint(f"Import Failed: {e}", indicator="red")
