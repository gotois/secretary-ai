import env from '../../environment/index.mjs';

const { YANDEX } = env;

/**
 * @constant
 * @type {string}
 */
const DICTIONARY_HOST = 'dictionary.yandex.net';
/**
 * @description Yandex dictionary
 * @param {string} text - Текст для проверки
 * @param {string} [lang] - Язык проверки
 * @returns {Promise<object>}
 */
export default async function dictionary(text, lang = 'ru-ru') {
  const req = await fetch(
    `https://${DICTIONARY_HOST}/api/v1/dicservice.json/lookup?key=${YANDEX.YA_DICTIONARY}&lang=${lang}&text=${encodeURIComponent(text)}`,
    {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
  return req.json();
}

/**
 * @param {string} name
 * @param {string} [lang]
 * @returns {Promise<string[]>}
 */
export async function getSynonyms(name, lang = 'ru-ru') {
  const synonyms = [];
  const { def } = await dictionary(name, lang);
  if (Array.isArray(def)) {
    for (const d of def) {
      synonyms.push(d.tr[0].text);
      if (Array.isArray(d.tr[0].syn)) {
        d.tr[0].syn.forEach((syn) => {
          synonyms.push(syn.text);
        });
      }
    }
  }
  return synonyms;
}
