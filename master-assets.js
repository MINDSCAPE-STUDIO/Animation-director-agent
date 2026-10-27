const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { DATA_DIR, MASTER_ASSETS_FILE: FILE } = require('./storage-paths');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');
}

function readAll() {
  ensureStore();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function writeAll(data) {
  ensureStore();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createMasterAsset(input = {}) {
  const data = readAll();
  const assetId = input.asset_id || crypto.randomUUID();
  const now = new Date().toISOString();
  const asset = {
    asset_id: assetId,
    project_id: input.project_id || 'default',
    name: input.name || assetId,
    type: input.type || 'character',
    status: input.status || 'candidate',
    version: input.version || 1,
    source_generation_id: input.source_generation_id || null,
    source_model: input.source_model || null,
    source_model_version: input.source_model_version || null,
    source_uri: input.source_uri || null,
    reference_uris: input.reference_uris || [],
    style_bible_version: input.style_bible_version || null,
    canonical_attributes: input.canonical_attributes || {},
    preservation_rules: input.preservation_rules || [],
    approval: {
      state: input.approval_state || 'pending',
      approved_by: input.approved_by || null,
      approved_at: input.approved_at || null,
      notes: input.approval_notes || '',
    },
    created_at: now,
    updated_at: now,
  };
  data[assetId] = asset;
  writeAll(data);
  return asset;
}

function getMasterAsset(assetId) {
  return readAll()[assetId] || null;
}

function listMasterAssets(projectId = null) {
  return Object.values(readAll()).filter(asset => !projectId || asset.project_id === projectId);
}

function updateMasterAsset(assetId, patch = {}) {
  const data = readAll();
  const current = data[assetId];
  if (!current) return null;
  const next = { ...current, ...patch, asset_id: assetId, updated_at: new Date().toISOString() };
  if (patch.approval) next.approval = { ...current.approval, ...patch.approval };
  data[assetId] = next;
  writeAll(data);
  return next;
}

function approveMasterAsset(assetId, approval = {}) {
  return updateMasterAsset(assetId, {
    status: 'approved',
    approval: {
      state: 'approved',
      approved_by: approval.approved_by || 'user',
      approved_at: new Date().toISOString(),
      notes: approval.notes || '',
    },
  });
}

function buildAssetContract(assetId) {
  const asset = getMasterAsset(assetId);
  if (!asset) return null;
  return {
    asset_id: asset.asset_id,
    project_id: asset.project_id,
    type: asset.type,
    version: asset.version,
    status: asset.status,
    source_uri: asset.source_uri,
    reference_uris: asset.reference_uris,
    style_bible_version: asset.style_bible_version,
    canonical_attributes: asset.canonical_attributes,
    preservation_rules: asset.preservation_rules,
    approval: asset.approval,
  };
}

module.exports = { createMasterAsset, getMasterAsset, listMasterAssets, updateMasterAsset, approveMasterAsset, buildAssetContract };
