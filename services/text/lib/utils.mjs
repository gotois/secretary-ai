import validator from 'validator';
/**
 *
 * @param {string} input - text
 * @returns {RegExp}
 */
export const createRegexInput = (input) => {
  return isRegexString(input)
    ? convertStringToRegexp(input)
    : createRegExp(input);
};

/**
 * @param {string} input - text
 * @returns {boolean}
 */
export const isRegexString = (input) => {
  if (input.length <= 2) {
    return false;
  }
  if (input.startsWith('/')) {
    if (input.endsWith('/')) {
      return true;
    }
    const backslashes = input.split('/');
    if (backslashes.length < 3) {
      return false;
    }
    const endBackslashe = backslashes[backslashes.length - 1];
    if (
      endBackslashe.includes('m') ||
      endBackslashe.includes('i') ||
      endBackslashe.includes('g')
    ) {
      return true;
    }
  }
  return false;
};
/**
 * @param {string} input - text
 * @returns {RegExp}
 */
const createRegExp = (input) => {
  const fWord = formatWord(input);
  return new RegExp(
    `( ${fWord} )|(\n${fWord})|(${fWord}\n)|(\n${fWord}\n)|( ${fWord}$)|(^${fWord} )|(^${fWord}$)`,
    'i',
  );
};
/**
 * @param {string} input - text
 * @returns {string}
 */
export const formatWord = (input) => {
  switch (input.toLowerCase()) {
    case '\\d':
    case '\\s':
    case '\\b':
    case '\\w':
    case '[':
    case '/':
    case '.':
    case '^':
    case '$':
    case '|':
    case '?':
    case '*':
    case '+':
    case '(':
    case ')':
      return `\\${input}`;
    default: {
      return input;
    }
  }
};
/**
 * @param {string} input - text
 * @returns {RegExp}
 */
const convertStringToRegexp = (input) => {
  return new RegExp(input.slice(1, input.length - 1));
};
/**
 * @param {string} text - like phone number
 * @returns {null|string}
 */
export function formatPhone(text) {
  const number = text.match(/\d/g)?.join('');
  if (number && validator.isMobilePhone(number) && number.length > 9) {
    return '+' + number;
  }
  return null;
}
export function formatURL(text) {
  if (validator.isURL(text)) {
    if (!(text.startsWith('http://') || text.startsWith('https://'))) {
      text = 'https://' + text;
    }
    if (URL.canParse(text)) {
      return text;
    }
  }
  return null;
}
