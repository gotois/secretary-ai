import translator from '@google-cloud/translate';
import env from '../../environment/index.mjs';
const { Translate } = translator.v2;
const { GOOGLE } = env;

const client = new Translate({
  credentials: GOOGLE.CREDENTIALS,
});

/**
 * @description Translates some text into targetLang
 * @param {string} text - The text to translate
 * @param {string} targetLang - The target language
 * @returns {Promise<string>}
 */
export default async (text, targetLang) => {
  const [translation] = await client.translate(text, targetLang);
  return translation;
};
