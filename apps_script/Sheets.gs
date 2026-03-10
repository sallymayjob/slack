function Sheets_getTabByName(tabName) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
}
