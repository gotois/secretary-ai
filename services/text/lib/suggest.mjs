/**
 * @constant
 * @type {string}
 */
const yu = '5519222721557041240';
/**
 * @constant
 * @type {string}
 */
const SUGGEST_HOST = 'suggest.yandex.ru';
/**
 * @param {string} text
 * @param {string} lang
 * @param {number} timeout
 * @returns {Promise<[string, string[]]>}
 */
const suggest = async (text, lang, timeout = 1000) => {
  text = encodeURIComponent(text);
  const response = await fetch(`https://${SUGGEST_HOST}/suggest-ff.cgi?part=${text}&amp;uil=${lang}&amp;v=3&amp;sn=5&amp;lr=10371&amp;yu=${yu}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(timeout),
  });
  return response.json();
};
/**
 * @param {string} text
 * @returns {number}
 */
const getWordsCount = (text) => { return text.split(' ').length; };
/**
 * @param {string} newText
 * @param {string} oldText
 * @returns {string}
 */
const textCaseFormat = (newText, oldText) => {
  let out = '';
  const x = newText.split(' ');
  const y = oldText.split(' ');
  if (x.length === y.length) {
    for (let i = 0; i < x.length; i++) {
      const text = x[i].length > y[i].length ? x[i] : y[i];
      for (let j = 0; j < text.length; j++) {
        out += text[j];
      }
      if (i !== x.length - 1) {
        out += ' ';
      }
    }
  } else {
    for (let i = 0; i < newText.length; i++) {
      out += oldText[i]?.toLowerCase() === newText[i] ? oldText[i] : newText[i];
    }
  }
  return out;
};
/**
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<string>}
 */
export default async (text, lang) => {
  const wordsCount = getWordsCount(text);
  const [defaultText, result] = await suggest(text, lang);
  const resultFilter = result.filter(res => { return wordsCount === getWordsCount(res); });
  if (resultFilter.length === 0) {
    return textCaseFormat(defaultText, text);
  }
  return textCaseFormat(resultFilter[0], text);
};
