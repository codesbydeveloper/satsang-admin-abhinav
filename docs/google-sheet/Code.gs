/**
 * Satsang Spark – live Users sheet (Google Apps Script).
 *
 * Copies the Admin Panel's Users table into this spreadsheet every hour, from
 * GET <EXPORT_URL> with the header X-Export-Key: <EXPORT_KEY>.
 * Setup steps for a non-technical person: SETUP.md next to this file.
 *
 * Script Properties (Project Settings → Script Properties). Never type them into this code:
 *   EXPORT_URL  https://<api address>/api/v1/export/sheet
 *   EXPORT_KEY  the SHEET_EXPORT_KEY value from the server
 *
 * Functions:
 *   setup()      run once: makes ONE hourly trigger for syncUsers (never duplicates) and syncs now
 *   syncUsers()  fetch and rewrite the "Users" sheet; status in the "Info" sheet
 *   onOpen()     adds the menu "Satsang Spark → Refresh now"
 */

var USERS_SHEET = 'Users';
var INFO_SHEET = 'Info';
var TIME_ZONE = 'Asia/Kolkata';
var COLORS = {
  headerBg: '#E8772E', headerText: '#FFFFFF',   // saffron header row
  parentBg: '#FFF4E5',                          // parent account = family header
  childBg: '#F4F5F7',                           // child profile rows
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Satsang Spark').addItem('Refresh now', 'refreshNow').addToUi();
}

/** Menu item: sync now and say how it went. */
function refreshNow() {
  var result = syncUsers();
  var ss = SpreadsheetApp.getActive();
  if (result.ok) ss.toast(result.count + ' rows updated.', 'Satsang Spark', 5);
  else SpreadsheetApp.getUi().alert('Satsang Spark: the refresh failed. The old data is kept.\n\n' + result.error);
}

/** Run once after pasting the script (and again any time: it never makes a second trigger). */
function setup() {
  readSettings_();   // stops here with a clear message if a Script Property is missing
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncUsers') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncUsers').timeBased().everyHours(1).create();
  var result = syncUsers();
  if (!result.ok) throw new Error('The hourly refresh is set up, but this first refresh failed: ' + result.error);
}

/**
 * Fetch every row and rewrite the Users sheet. On any error the old rows stay and the error goes to Info.
 * Returns { ok, count } or { ok: false, error } (never throws, so the hourly trigger does not email every hour).
 */
function syncUsers() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'Another refresh is already running. Try again in a minute.' };
  try {
    var data = fetchExport_();
    writeUsers_(data);
    writeInfo_({ updatedAt: new Date(), count: data.rows.length, error: '' });
    return { ok: true, count: data.rows.length };
  } catch (e) {
    var message = String(e && e.message ? e.message : e);
    try { writeInfo_({ error: message }); } catch (ignored) { /* nothing more we can do */ }
    return { ok: false, error: message };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------------------------

function readSettings_() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('EXPORT_URL') || '').trim();
  var key = (props.getProperty('EXPORT_KEY') || '').trim();
  if (!url || !key) throw new Error('Set EXPORT_URL and EXPORT_KEY in Project Settings → Script Properties first.');
  if (!/^https:\/\//i.test(url)) throw new Error('EXPORT_URL must start with https://');
  return { url: url, key: key };
}

function fetchExport_() {
  var s = readSettings_();
  var res = UrlFetchApp.fetch(s.url, {
    method: 'get', headers: { 'X-Export-Key': s.key }, muteHttpExceptions: true, followRedirects: false,
  });
  var code = res.getResponseCode();
  if (code === 401) throw new Error('The server refused the key (401). Check EXPORT_KEY.');
  if (code === 404) throw new Error('Export not found (404). Check EXPORT_URL, or the export is switched off on the server.');
  if (code === 429) throw new Error('Too many refreshes this hour (429). The next hourly refresh will try again.');
  if (code !== 200) throw new Error('The server answered ' + code + '.');
  var data;
  try { data = JSON.parse(res.getContentText('UTF-8')); } catch (e) { throw new Error('The server did not send valid data.'); }
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows) || !data.columns.length) throw new Error('The server data is missing columns or rows.');
  return data;
}

/** A cell value for the sheet. Text that looks like a formula is kept as text. */
function cell_(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') {   // "YYYY-MM-DD": noon UTC, so the day is the same in any sheet time zone
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : String(value);
  }
  if (type === 'datetime') { var d = new Date(value); return isNaN(d.getTime()) ? String(value) : d; }
  if (type === 'number') return Number(value);
  var s = String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function writeUsers_(data) {
  var cols = data.columns;
  var n = cols.length;
  var at = function (key) { for (var i = 0; i < n; i++) if (cols[i].key === key) return i; return -1; };
  var typeAt = at('accountType');
  var userAt = at('username');

  // Build everything first: if anything fails here, the sheet is untouched.
  var values = [cols.map(function (c) { return c.label; })];
  var backgrounds = [cols.map(function () { return COLORS.headerBg; })];
  var weights = [cols.map(function () { return 'bold'; })];
  data.rows.forEach(function (row) {
    var kind = typeAt >= 0 ? String(row[typeAt] || '').toLowerCase() : '';
    var out = cols.map(function (c, i) { return cell_(row[i], c.type); });
    if (kind === 'child' && userAt >= 0 && out[userAt] !== '') out[userAt] = '↳ ' + String(out[userAt]).replace(/^'/, '');
    values.push(out);
    var bg = kind === 'child' ? COLORS.childBg : kind === 'parent' ? COLORS.parentBg : null;
    backgrounds.push(cols.map(function () { return bg; }));
    weights.push(cols.map(function () { return kind === 'parent' ? 'bold' : 'normal'; }));
  });

  var sheet = sheet_(USERS_SHEET);
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.clear();   // old rows and formats
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  if (sheet.getMaxRows() < values.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), values.length + 1 - sheet.getMaxRows());

  var all = sheet.getRange(1, 1, values.length, n);
  all.setValues(values);
  all.setBackgrounds(backgrounds);
  all.setFontWeights(weights);
  sheet.getRange(1, 1, 1, n).setFontColor(COLORS.headerText);
  sheet.setFrozenRows(1);

  if (values.length > 1) {
    cols.forEach(function (c, i) {
      var r = sheet.getRange(2, i + 1, values.length - 1, 1);
      if (c.type === 'date') r.setNumberFormat('dd mmm yyyy');
      else if (c.type === 'datetime') r.setNumberFormat('dd mmm yyyy hh:mm');
      else if (c.type === 'number') r.setNumberFormat(c.key === 'sparks' ? '#,##0' : '0');   // Sparks 1,500; ids plain
    });
  }
  sheet.autoResizeColumns(1, n);
  all.createFilter();
  for (var c = 1; c <= sheet.getLastColumn(); c++) {
  sheet.setColumnWidth(c, Math.max(sheet.getColumnWidth(c) + 28, 110));
}
}

function writeInfo_(info) {
  var sheet = sheet_(INFO_SHEET);
  var now = Utilities.formatDate(new Date(), TIME_ZONE, 'dd MMM yyyy, HH:mm');
  if (info.updatedAt) {
    sheet.getRange('A1').setValue('Last updated: ' + Utilities.formatDate(info.updatedAt, TIME_ZONE, 'dd MMM yyyy, HH:mm') + ' (' + TIME_ZONE + ')');
    sheet.getRange('A2').setValue('Rows: ' + info.count);
  } else if (!sheet.getRange('A1').getValue()) {
    sheet.getRange('A1').setValue('Last updated: never');
    sheet.getRange('A2').setValue('Rows: 0');
  }
  sheet.getRange('A3').setValue(info.error ? 'Last error: ' + now + ' (' + TIME_ZONE + ') – ' + info.error : 'Last error: none');
  sheet.getRange('A1:A3').setNumberFormat('@');
  sheet.autoResizeColumn(1);
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
