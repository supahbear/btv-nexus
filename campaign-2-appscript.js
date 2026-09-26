/**
 * NEXUS Campaign 2 — Google Apps Script backend
 *
 * Setup:
 * 1. Import the Campaign 2 workbook into Google Sheets.
 * 2. Create a new Apps Script project and paste this file into Code.gs.
 * 3. Set the script property NEXUS_CAMPAIGN_2_SHEET_ID to that workbook's ID.
 * 4. Deploy it as a web app and copy the deployment URL into campaigns.js.
 *
 * The journal actions mirror the previous campaign's on-site writing flow.
 */

const CAMPAIGN_2_SHEETS = {
  journal_entries: ['recap_date', 'chapter', 'entry', 'Bamsi Bombus', 'Chickard Bishop', 'Zhade', 'Horse'],
  journal_comments: ['id', 'timestamp', 'chapter_title', 'character', 'text', 'author'],
  main_characters: ['name', 'image_url', 'summary', 'species', 'class', 'age', 'image_offset'],
  people: ['name', 'image_url', 'content', 'species', 'faction', 'image_offset'],
  places: ['name', 'image_url', 'content', 'category', 'type', 'region'],
  factions: ['name', 'image_url', 'content', 'type', 'leader', 'hq', 'symbol'],
  inventory: ['id', 'character', 'name', 'category', 'notes', 'quantity'],
  items: ['name', 'image_url', 'content', 'category', 'type', 'effect'],
  bestiary: ['name', 'image_url', 'content', 'category', 'type', 'habitat', 'image_offset'],
  world_info: ['name', 'image_url', 'content', 'category', 'type'],
  deities: ['name', 'image_url', 'content', 'category', 'domain', 'symbol', 'image_offset'],
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
    if (['journal_create', 'journal_entry', 'journal_comment'].includes(action)) {
      return journalWrite_(action, e.parameter.payload, callback);
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

function journalWrite_(action, rawPayload, callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonp_(callback, { success: false, error: 'The journal is busy. Try again.' });
  try {
    if (!rawPayload || rawPayload.length > 40000) throw new Error('Invalid journal payload');
    const input = JSON.parse(rawPayload);
    const workbook = getSpreadsheet_();
    const entries = workbook.getSheetByName('journal_entries');
    const comments = workbook.getSheetByName('journal_comments');
    if (!entries || !comments) throw new Error('Journal sheets are missing');
    const entryHeaders = entries.getRange(1, 1, 1, entries.getLastColumn()).getValues()[0].map(normaliseHeader_);
    const chapterColumn = entryHeaders.indexOf('chapter');
    if (chapterColumn < 0 || entryHeaders.indexOf('entry') < 0 || entryHeaders.indexOf('recap_date') < 0) {
      throw new Error('Journal entry columns have changed');
    }
    const chapter = journalText_(input.chapter, 120, true);
    const chapterRows = entries.getLastRow() > 1
      ? entries.getRange(2, chapterColumn + 1, entries.getLastRow() - 1, 1).getValues().flat()
      : [];
    const matching = chapterRows.findIndex(value => String(value).trim() === chapter);
    if (action === 'journal_create') {
      if (matching !== -1) throw new Error('A chapter with this title already exists');
      const row = { recap_date: journalText_(input.recap_date, 300), chapter,
        entry: journalText_(input.entry, 20000) };
      entries.appendRow(entryHeaders.map(header => journalCell_(row[header] || '')));
      SpreadsheetApp.flush();
      return jsonp_(callback, { success: true });
    }
    if (matching === -1) throw new Error('Chapter not found');
    if (action === 'journal_entry') {
      const character = journalText_(input.character, 100, true);
      const column = entryHeaders.indexOf(character.toLowerCase());
      if (column < 3) throw new Error('Character column not found');
      const text = journalText_(input.text, 20000, true);
      entries.getRange(matching + 2, column + 1).setValue(journalCell_(text));
      SpreadsheetApp.flush();
      return jsonp_(callback, { success: true });
    }
    if (action === 'journal_comment') {
      const character = journalText_(input.character, 100, true);
      if (entryHeaders.indexOf(character.toLowerCase()) < 3) throw new Error('Character column not found');
      const headers = comments.getRange(1, 1, 1, comments.getLastColumn()).getValues()[0].map(normaliseHeader_);
      if (['id', 'timestamp', 'chapter_title', 'character', 'text', 'author'].some(field => !headers.includes(field))) {
        throw new Error('Journal comment columns have changed');
      }
      const row = { id: Utilities.getUuid(), timestamp: new Date().toISOString(), chapter_title: chapter,
        character, text: journalText_(input.text, 5000, true), author: journalText_(input.author, 150, true) };
      comments.appendRow(headers.map(header => journalCell_(row[header] || '')));
      SpreadsheetApp.flush();
      return jsonp_(callback, { success: true });
    }
    throw new Error('Unknown journal action');
  } catch (error) {
    console.error('Journal write failed:', error);
    return jsonp_(callback, { success: false, error: String(error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

function journalText_(value, maxLength, required) {
  const text = String(value == null ? '' : value).trim();
  if (required && !text) throw new Error('A required journal field is empty');
  if (text.length > maxLength) throw new Error('Journal text is too long');
  return text;
}

function journalCell_(value) {
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
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
