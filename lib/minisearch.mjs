import MiniSearch from 'minisearch';

const INDEX_OPTIONS = {
  fields: ['role', 'content'],
  storeFields: ['role', 'content'],
};

export function createIndex() {
  return new MiniSearch(INDEX_OPTIONS);
}

export function serializeIndex(ms) {
  return JSON.stringify(ms);
}

export function deserializeIndex(json) {
  return MiniSearch.loadJSON(json, INDEX_OPTIONS);
}

