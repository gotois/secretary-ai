import env from '../../environment/index.mjs';

const { GOOGLE } = env;
/**
 * @constant
 * @type {string}
 */
const GKG_HOST = 'kgsearch.googleapis.com';

/**
 * @param {string} query - query
 * @throws {Error}
 * @returns {Promise<object>}
 */
export default async (query) => {
  const response = await fetch(`https://${GKG_HOST}/v1/entities:search` +
        '?query=' + encodeURIComponent(query) +
        '&key=' + GOOGLE.GOOGLE_KNOWLEDGE_GRAPH +
        '&limit=' + 1 +
        '&indent=' + 'True'
  );
  return response.json();
};
