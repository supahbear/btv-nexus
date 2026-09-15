/**
 * NEXUS Campaign 2 — Google Apps Script backend
 *
 * Setup:
 * 1. Import the Campaign 2 workbook into Google Sheets.
 * 2. Create a new Apps Script project and paste this file into Code.gs.
 * 3. Set the script property NEXUS_CAMPAIGN_2_SHEET_ID to that workbook's ID.
 * 4. Deploy it as a web app and copy the deployment URL into campaigns.js.
 *
 * This baseline intentionally exposes reads only. Journal and inventory writes
 * will be added after the authoring/access model is decided.
 */

const CAMPAIGN_2_SHEETS = {
  journal_recaps: ['recap_date', 'chapter', 'entry', 'guest'],
  journal_entries: ['id', 'timestamp', 'recap', 'character', 'text', 'author'],
  main_characters: ['name', 'image_url', 'summary', 'species', 'class', 'age', 'image_offset'],
  people: ['name', 'image_url', 'content', 'species', 'faction', 'image_offset'],
  places: ['name', 'image_url', 'content', 'category', 'type', 'region'],
  factions: ['name', 'image_url', 'content', 'type', 'leader', 'hq', 'symbol'],
  inventory: ['id', 'character', 'name', 'category', 'notes', 'quantity'],
  items: ['name', 'image_url', 'content', 'category', 'type', 'effect'],
  bestiary: ['name', 'image_url', 'content', 'category', 'type', 'habitat', 'image_offset'],
  world_info: ['name', 'image_url', 'content', 'category', 'type'],
  maps: ['name', 'image_url', 'content', 'tags', 'dm_notes', 'visible', 'description'],
  gallery: ['id', 'url', 'title', 'description', 'artist']
};

function doGet(e) {
  const callback = (e && e.parameter && e.parameter.callback) || 'callback';

  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'schema') {
      return jsonp_(callback, { success: true, sheets: CAMPAIGN_2_SHEETS });
    }

    const requested = String((e && e.parameter && e.parameter.sheets) || '')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);

    if (!requested.length) {
      return jsonp_(callback, { success: false, error: 'Missing required param: sheets' });
    }

    const unknown = requested.filter(name => !Object.prototype.hasOwnProperty.call(CAMPAIGN_2_SHEETS, name));
    if (unknown.length) {
      return jsonp_(callback, { success: false, error: 'Unknown sheet: ' + unknown.join(', ') });
    }

    const filterVisible = String((e.parameter && e.parameter.filter_visible) || 'true') !== 'false';
    const spreadsheet = getSpreadsheet_();
    const data = requested.flatMap(name => readSheet_(spreadsheet, name, filterVisible));

    return jsonp_(callback, { success: true, sheets: requested, data });
  } catch (error) {
    console.error('Campaign 2 doGet failed:', error);
    return jsonp_(callback, { success: false, error: String(error) });
  }
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const sheetId = properties.getProperty('NEXUS_CAMPAIGN_2_SHEET_ID')
    || properties.getProperty('NEXUS_CAMPAIGN_3_SHEET_ID');
  if (!sheetId) throw new Error('Missing script property: NEXUS_CAMPAIGN_2_SHEET_ID');
  return SpreadsheetApp.openById(sheetId);
}

function readSheet_(spreadsheet, sheetName, filterVisible) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Required sheet not found: ' + sheetName);

  const range = sheet.getDataRange();
  if (range.getNumRows() < 2) return [];

  const [headerRow, ...dataRows] = range.getValues();
  const headers = headerRow.map(normaliseHeader_);

  return dataRows
    .filter(row => row.some(value => String(value).trim() !== ''))
    .map(row => {
      const record = { _category: sheetName };
      headers.forEach((header, index) => {
        if (header) record[header] = row[index] === undefined ? '' : row[index];
      });
      return record;
    })
    .filter(record => !filterVisible || isVisible_(record));
}

function normaliseHeader_(value) {
  return String(value || '').trim().toLowerCase();
}

function isVisible_(record) {
  if (!Object.prototype.hasOwnProperty.call(record, 'visible')) return true;
  const value = String(record.visible || '').trim().toUpperCase();
  return value !== 'FALSE' && value !== '0' && value !== 'NO';
}

function jsonp_(callback, payload) {
  const safeCallback = String(callback || 'callback').replace(/[^a-zA-Z0-9_$.]/g, '_');
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
