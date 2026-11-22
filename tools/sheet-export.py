# Turns the card sheet, downloaded as an .xlsx file, into the tabs tools/sheet-check.js reads.
#   python3 tools/sheet-export.py sheet.xlsx > sheet.json
# (tools/sheet-check.js runs this by itself when given an .xlsx file.) Needs openpyxl.
import json, sys
import openpyxl

def cell(v):
    if v is None: return ""
    if v is True: return "TRUE"
    if v is False: return "FALSE"
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v)

book = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
out = {}
for ws in book.worksheets:
    rows = [[cell(v) for v in r] for r in ws.iter_rows(values_only=True)]
    while rows and not any(rows[-1]): rows.pop()
    out[ws.title] = rows
json.dump(out, sys.stdout, ensure_ascii=False)
