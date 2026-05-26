import { makeMoreMetaData } from './lib/nlp.mjs';
import { getSynonyms } from './lib/dictionary.mjs';

/**
 * @param {string} text
 * @param {string} mime
 */
export default async function text(text, mime) {
  const context = [];
  const ld = {
    text: text,
    keywords: [],
  };

  if (ld.keywords.length > 0) {
    let synonyms = [];
    for (const keyword of ld.keywords) {
      try {
        synonyms = await getSynonyms(keyword.replace('#', ''));
      } catch (error) {
        console.warn('YANDEX dict service is not available: ', error.message);
      }
    }
    if (synonyms.length) {
      for (const synonym of synonyms) {
        ld.keywords.push(synonym);
      }
    }
  }

  const timeZone = process.env.TZ ?? 'UTC';
  await makeMoreMetaData(ld, timeZone);
  context.push(ld);

  return context;
}
