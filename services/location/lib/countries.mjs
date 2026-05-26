/**
 * @constant
 * @type {string}
 */
const RESTCOUNTRIES_HOST = 'restcountries.com';
/**
 * @constant
 * @type {string}
 */
const VERSION = 'v3.1';

/**
 * @param {string} country - Search by cca2, ccn3, cca3 or cioc country code
 * @throws {Error}
 * @returns {Promise<object[]>}
 */
export const getUseCountry = async (country) => {
  const encodeCountry = encodeURI(country);
  const res = await fetch(
    `https://${RESTCOUNTRIES_HOST}/${VERSION}/alpha/${encodeCountry}`,
  );
  if (!res.ok) {
    throw new Error('restcountries not ok');
  }
  const countries = await res.json();
  if (!Array.isArray(countries)) {
    throw new ReferenceError('Country not found');
  }
  return countries;
};
