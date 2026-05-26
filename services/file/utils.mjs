import { fileTypeFromBuffer } from 'file-type';
/**
 * @param {string} str
 * @return {string}
 */
export function getMimeTypeFromBase64(str) {
  return str.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
}
/**
 * @param {Buffer|Uint8Array|string} input
 * @param {string} [filename]
 * @returns {Promise<string>}
 */
export async function getMimeType(input, filename) {
  if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    const result = await fileTypeFromBuffer(input);
    if (result && result.mime) {
      const [mime] = result.mime.split(' ');
      return mime.replace(';', '');
    } else if (filename.endsWith('.txt')) {
      return 'text/plain';
    }
  }
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return getMimeTypeFromBase64(input);
    } else {
      return 'text/plain';
    }
  }
}
