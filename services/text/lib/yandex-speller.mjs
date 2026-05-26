/**
 * @constant
 * @type {string}
 */
const SPELLER_HOST = 'speller.yandex.net';
/**
 * @param {object} obj - object
 * @param {string} obj.text - Текст для проверки
 * @param {string} [obj.lang] - Языки проверки
 * @param {string} [obj.format] - Формат проверяемого текста
 * @param {number} [obj.options] - Опции Яндекс.Спеллера. Значением параметра является сумма значений требуемых опций
 * @param {number} [obj.timeout]
 * @returns {Promise<{ s: string, len: number, pos: number }[]|ReferenceError>}
 */
const spellText = async ({
  text,
  lang = 'ru,en',
  options = 0,
  format = 'plain',
  timeout = 1000,
}) => {
  const response = await fetch(`https://${SPELLER_HOST}/services/spellservice.json/checkText`, {
    method: 'POST',
    body: `text=${text}&lang=${lang}&options=${options}&format=${format}`,
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  if (!Array.isArray(result)) {
    throw new ReferenceError('Yandex API SpellCheck changes');
  }
  return result;
};
/**
 * @param {string} string - string
 * @param {number} start - start
 * @param {number} end - end
 * @param {string} what - what text
 * @returns {string}
 */
const replaceBetween = (string, start, end, what) => {
  return string.slice(0, start) + what + string.slice(end);
};
/**
 * @description Исправляем очевидные ошибки. Важно! Данные берутся относительно текущего месторасположения, включая VPN
 * @example // рублей
 * spellText('рублкй');
 *
 * @param {string} text - user text
 * @param {string} [lang] - text language
 * @returns {Promise<string>}
 */
export default async function correctionText(text, lang) {
  if (!text) {
    throw new Error('Text is undefined');
  }
  let out = text;
  const array = await spellText({
    text,
    lang,
  });
  for (const {s, len, pos} of array) {
    const [replacedWord] = s;
    out = replaceBetween(out, pos, pos + len, replacedWord);
  }
  return out;
}
