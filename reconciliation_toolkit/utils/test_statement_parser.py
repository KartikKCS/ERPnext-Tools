import pandas as pd
import unittest
from reconciliation_toolkit.utils.statement_parser import parse_bank_statement

class TestStatementParser(unittest.TestCase):
    def test_hdfc_format(self):
        csv_content = b"""Account Name: TEST COMPANY
Account No: 123456789
Date: 01/01/2023 to 31/01/2023
Branch: KORAMANGALA

Date,Narration,Chq/Ref Number,Value Date,Withdrawal amount,Deposit amount,Closing Balance
01/01/23,UPI/123456/PAYMENT,,01/01/23,1000.00,,50000.00
02/01/23,NEFT-ABC-123,ABC123,02/01/23,,5000.50,55000.50
03/01/23,FEE DEDUCTION,,03/01/23,10.00,,54990.50
Total Balance,,,,,54990.50
"""
        records = parse_bank_statement(csv_content, "csv").get("records")
        self.assertEqual(len(records), 3)
        self.assertEqual(records[0]['date'], '2023-01-01')
        self.assertEqual(records[0]['withdrawal'], 1000.00)
        self.assertEqual(records[0]['deposit'], 0.0)
        self.assertEqual(records[0]['description'], 'UPI/123456/PAYMENT')

        self.assertEqual(records[1]['date'], '2023-01-02')
        self.assertEqual(records[1]['withdrawal'], 0.0)
        self.assertEqual(records[1]['deposit'], 5000.50)
        self.assertEqual(records[1]['reference_number'], 'ABC123')

    def test_icici_format(self):
        csv_content = b"""
ICICI Bank Statement
Period: 01-Jan-2023 to 31-Jan-2023

Txn Date,Value Date,Description,Ref No.,Debit,Credit,Balance
01-01-2023,01-01-2023,IMPS-123,REF1,500.00,,1000.00
05-01-2023,05-01-2023,CASH DEP,, ,2000.00,3000.00
"""
        records = parse_bank_statement(csv_content, "csv").get("records")
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['withdrawal'], 500.00)
        self.assertEqual(records[1]['deposit'], 2000.00)
        self.assertEqual(records[1]['description'], 'CASH DEP')
        
    def test_sbi_format(self):
        csv_content = b"""
STATE BANK OF INDIA
Account Statement for 12345

Txn Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
15-Jan-23,ATM WDL,,"10,000.00",,"5,000.00"
20-Jan-23,NEFT TRANSFER,TRFR1,,"5,000.00","10,000.00"
"""
        records = parse_bank_statement(csv_content, "csv").get("records")
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['withdrawal'], 10000.00)
        self.assertEqual(records[1]['deposit'], 5000.00)
        self.assertEqual(records[1]['reference_number'], 'TRFR1')
        self.assertEqual(records[0]['date'], '2023-01-15')

if __name__ == '__main__':
    unittest.main()
