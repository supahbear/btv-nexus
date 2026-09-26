// Nexus Campaign 3 journal alerts. DISCORD_WEBHOOK_URL stays in Script properties.
const JOURNAL_ALERT_STATE_KEY = 'JOURNAL_ALERT_SEEN_V2';
const JOURNAL_ALERT_LINK = 'https://btvnexus.netlify.app/#campaign-2/journal';

function setupJournalAlerts() {
  const properties = PropertiesService.getScriptProperties();
  const sheetId = properties.getProperty('NEXUS_CAMPAIGN_3_SHEET_ID');
  if (!sheetId || !properties.getProperty('DISCORD_WEBHOOK_URL')) throw new Error('Missing journal alert property');
  if (!properties.getProperty(JOURNAL_ALERT_STATE_KEY)) {
    properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(journalAlertSnapshot_()));
  }
  const triggers = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'checkJournalAlerts');
  if (!triggers.some(trigger => trigger.getEventType() === ScriptApp.EventType.ON_EDIT && trigger.getTriggerSourceId() === sheetId)) {
    ScriptApp.newTrigger('checkJournalAlerts').forSpreadsheet(sheetId).onEdit().create();
  }
  if (!triggers.some(trigger => trigger.getEventType() === ScriptApp.EventType.CLOCK)) {
    ScriptApp.newTrigger('checkJournalAlerts').timeBased().everyMinutes(1).create();
  }
}

function checkJournalAlerts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const current = journalAlertSnapshot_();
    const stored = properties.getProperty(JOURNAL_ALERT_STATE_KEY);
    if (!stored) {
      properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(current));
      return;
    }
    const previous = JSON.parse(stored);
    Object.keys(current).forEach(key => {
      if (current[key].value === previous[key]?.value) return;
      if (!previous[key] || current[key].kind === 'character') sendJournalAlert_(current[key]);
      previous[key] = current[key];
      properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(previous));
    });
    Object.keys(previous).forEach(key => { if (!current[key]) delete previous[key]; });
    properties.setProperty(JOURNAL_ALERT_STATE_KEY, JSON.stringify(previous));
  } finally {
    lock.releaseLock();
  }
}

function journalAlertSnapshot_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('NEXUS_CAMPAIGN_3_SHEET_ID');
  if (!sheetId) throw new Error('Missing Script property: NEXUS_CAMPAIGN_3_SHEET_ID');
  const workbook = SpreadsheetApp.openById(sheetId);
  const entries = workbook.getSheetByName('journal_entries');
  const comments = workbook.getSheetByName('journal_comments');
  if (!entries || !comments) throw new Error('Missing journal sheet');
  const snapshot = {};
  const entryRows = entries.getDataRange().getValues();
  const entryHeaders = entryRows[0].map(value => String(value || '').trim().toLowerCase());
  entryRows.slice(1).forEach((row, index) => {
    const chapter = String(row[entryHeaders.indexOf('chapter')] || '').trim();
    if (!chapter) return;
    const entry = String(row[entryHeaders.indexOf('entry')] || '').trim();
    const date = String(row[entryHeaders.indexOf('recap_date')] || '').trim();
    const rowKey = 'entry:' + (index + 2) + ':';
    snapshot[rowKey + 'chapter'] = { kind: 'chapter', chapter, date, value: chapter + '\n' + date + '\n' + entry, detail: entry };
    entryHeaders.slice(3).forEach((character, offset) => {
      const text = String(row[offset + 3] || '').trim();
      if (character && text) snapshot[rowKey + character] = { kind: 'character', chapter, character, value: text, detail: text };
    });
  });
  const commentRows = comments.getDataRange().getValues();
  const headers = commentRows[0].map(value => String(value || '').trim().toLowerCase());
  commentRows.slice(1).forEach((row, index) => {
    const field = name => String(row[headers.indexOf(name)] || '').trim();
    const detail = field('text');
    if (!detail || !field('chapter_title')) return;
    snapshot['comment:' + (field('id') || index + 2)] = {
      kind: 'comment', chapter: field('chapter_title'), character: field('character'),
      author: field('author'), value: detail, detail,
    };
  });
  return snapshot;
}

function sendJournalAlert_(item) {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) throw new Error('Missing Script property: DISCORD_WEBHOOK_URL');
  const title = item.kind === 'chapter' ? item.chapter : item.kind === 'comment'
    ? 'New journal comment' : item.character + "'s Journal";
  const context = item.kind === 'chapter' ? item.date : item.chapter + (item.author ? ' · ' + item.author : '');
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ embeds: [{
      title: title.slice(0, 256), url: JOURNAL_ALERT_LINK,
      description: (context ? context.slice(0, 150) + '\n' : '') + '> ' + String(item.detail || '').slice(0, 300),
      color: item.kind === 'chapter' ? 0x5865F2 : 0x57F287,
      timestamp: new Date().toISOString(),
    }], allowed_mentions: { parse: [] } }),
    muteHttpExceptions: true,
  });
  if (![200, 204].includes(response.getResponseCode())) throw new Error('Discord alert failed with HTTP ' + response.getResponseCode());
}
