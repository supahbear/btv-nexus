const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { test } = require('node:test');
const path = require('node:path');
const vm = require('node:vm');

const campaigns = require('./campaigns.js');

test('Campaign 2 is published with its own backend', () => {
  assert.equal(campaigns.campaign2.published, true);
  assert.match(campaigns.campaign2.apiUrl, /^https:\/\/script\.google\.com\/macros\/s\//);
  assert.deepEqual(campaigns.campaign2.fallbackHeroes, ['Hildur', 'Kevin', 'Erik', 'Katrin', 'Rohana']);
});

test('the application registry exposes both campaigns in the selector', () => {
  const sandbox = { window: { NexusCampaigns: campaigns }, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8'), sandbox);

  assert.equal(sandbox.window.Config.getCampaign('campaign-2').name, 'The Lamplighters');
  assert.deepEqual(
    Array.from(sandbox.window.Config.listPublishedCampaigns(), campaign => campaign.id),
    ['breach', 'campaign-2']
  );
});

test('Campaign 2 category collections all group by category', () => {
  for (const collection of ['world_info', 'items', 'bestiary', 'places', 'deities']) {
    assert.equal(campaigns.campaign2.collections[collection].presentation, 'category');
    assert.equal(campaigns.campaign2.collections[collection].groupField, 'category');
  }
});

test('Places retains region as modal metadata, not its grouping field', () => {
  assert.deepEqual(campaigns.campaign2.collections.places.modalFields, ['type', 'region']);
});

test('Deities uses the dedicated sheet and its divine metadata', () => {
  assert.equal(campaigns.campaign2.sheets.deities, 'deities');
  assert.deepEqual(campaigns.campaign2.collections.deities.modalFields, ['domain', 'symbol']);
  assert.match(fs.readFileSync(path.join(__dirname, 'campaign-2-appscript.js'), 'utf8'), /deities:\s*\[/);
});

test('Campaign 2 Apps Script source parses', () => {
  execFileSync(process.execPath, ['--check', path.join(__dirname, 'campaign-2-appscript.js')], {
    stdio: 'pipe'
  });
});

test('Campaign 2 home source parses', () => {
  execFileSync(process.execPath, ['--check', path.join(__dirname, 'campaign-2-home.js')], {
    stdio: 'pipe'
  });
});
