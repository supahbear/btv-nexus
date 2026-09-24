// Nexus Campaign 3 journal alerts. Add this file to the Campaign 3 Apps Script project.
// Set DISCORD_WEBHOOK_URL in that project's Script properties, never in source.
const JOURNAL_ALERT_STATE_KEY = 'JOURNAL_ALERT_SEEN_V1';
const JOURNAL_ALERT_LINK = 'https://btvnexus.netlify.app/#campaign-2/journal';
const JOURNAL_ALERT_SHEETS = {
  journal_recaps: ['chapter', 'entry'],
  journal_entries: ['character', 'text'],
};

function setupJournalAlerts() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('DISCORD_WEBHOOK_URL')) {
    throw new Error('Missing Script property: DISCORD_WEBHOOK_URL');
  }
  const sheetId = properties.getProperty('NEXUS_CAMPAIGN_3_SHEET_ID');
  if (!sheetId) throw new Error('Missing Script property: NEXUS_CAMPAIGN_3_SHEET_ID');

  // Treat complete rows already in the workbook as published; do not repost them.
  if (!properties.getProperty(JOURNAL_ALERT_STATE_KEY)) {
    const seen = { journal_recaps: [], journal_entries: [] };
    readJournalAlertRows_().forEach(item => seen[item.sheet].push(item.row));
    properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(seen));
  }

  const triggers = ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'checkJournalAlerts');
  if (!triggers.some(trigger => trigger.getEventType() === ScriptApp.EventType.ON_EDIT &&
    trigger.getTriggerSourceId() === sheetId)) {
    ScriptApp.newTrigger('checkJournalAlerts').forSpreadsheet(sheetId).onEdit().create();
  }
  if (!triggers.some(trigger => trigger.getEventType() === ScriptApp.EventType.CLOCK)) {
    // Apps Script writes do not fire edit triggers; polling covers future website writes.
    ScriptApp.newTrigger('checkJournalAlerts').timeBased().everyMinutes(1).create();
  }
}

function checkJournalAlerts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const rows = readJournalAlertRows_();
    const stored = properties.getProperty(JOURNAL_ALERT_STATE_KEY);
    if (!stored) {
      const baseline = { journal_recaps: [], journal_entries: [] };
      rows.forEach(item => baseline[item.sheet].push(item.row));
      properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(baseline));
      return;
    }

    const seen = JSON.parse(stored);
    for (const item of rows) {
      if (seen[item.sheet].includes(item.row)) continue;
      sendJournalAlert_(item);
      seen[item.sheet].push(item.row);
      // Commit each successful send so a later failure does not repost it.
      properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(seen));
    }
  } finally {
    lock.releaseLock();
  }
}

function readJournalAlertRows_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('NEXUS_CAMPAIGN_3_SHEET_ID');
  if (!sheetId) throw new Error('Missing Script property: NEXUS_CAMPAIGN_3_SHEET_ID');
  const workbook = SpreadsheetApp.openById(sheetId);
  const rows = [];
  Object.keys(JOURNAL_ALERT_SHEETS).forEach(sheetName => {
    const sheet = workbook.getSheetByName(sheetName);
    if (!sheet) throw new Error('Missing sheet: ' + sheetName);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    const headers = values[0].map(value => String(value || '').trim().toLowerCase());
    values.slice(1).forEach((values, index) => {
      const record = {};
      headers.forEach((header, column) => { if (header) record[header] = values[column]; });
      if (JOURNAL_ALERT_SHEETS[sheetName].every(field => String(record[field] || '').trim())) {
        rows.push({ sheet: sheetName, row: index + 2, record });
      }
    });
  });
  return rows;
}

function sendJournalAlert_(item) {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) throw new Error('Missing Script property: DISCORD_WEBHOOK_URL');
  const recap = item.sheet === 'journal_recaps';
  const heading = recap ? String(item.record.chapter) : String(item.record.character) + "'s Journal";
  const detail = String(recap ? item.record.entry : item.record.text).trim();
  const context = recap ? String(item.record.recap_date || '') : String(item.record.recap || '');
  const embed = {
    title: heading.slice(0, 256),
    url: JOURNAL_ALERT_LINK,
    description: (recap ? 'A new campaign recap has been posted.' : 'A new journal entry has been posted.') +
      (context ? '\n' + context.slice(0, 150) : '') + '\n> ' + detail.slice(0, 300),
    color: recap ? 0x5865F2 : 0x57F287,
    timestamp: new Date().toISOString(),
  };
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status !== 204 && status !== 200) {
    throw new Error('Discord alert failed with HTTP ' + status);
  }
}

function testJournalWebhook() {
  sendJournalAlert_({
    sheet: 'journal_entries',
    row: 0,
    record: { character: 'Nexus', text: 'Campaign 3 journal alerts are connected.' },
  });
}
