import env from '../../environment/index.mjs';

const { GOOGLE } = env;

/**
 * @constant
 * @type {string}
 */
const MAPS_HOST = 'maps.googleapis.com';

/**
 * @param {string} address - address
 * @returns {Promise<void>}
 */
export const getReverseGeoCode = async (address) => {
  const res = await fetch(
    `https://${MAPS_HOST}/maps/api/geocode/json?address=${address}&key=${GOOGLE.GOOGLE_MAPS_GEOCODING_API}`
  );
  if (!res.ok) {
    throw new Error('Google Request not ok');
  }
  const googleData = await res.json();
  if (!Array.isArray(googleData.results)) {
    throw new ReferenceError('GEO: no results');
  }
  return googleData.results;
};

/**
 * Google Maps
 *
 * @param {object} obj - obj
 * @param {number} obj.latitude - latitude
 * @param {number} obj.longitude - longitude
 * @throws {Error}
 * @returns {Promise<Object[]>}
 */
export const getGeoCode = async ({latitude, longitude}) => {
  const res = await fetch(
    `https://${MAPS_HOST}/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE.GOOGLE_MAPS_GEOCODING_API}`
  );
  if (!res.ok) {
    throw new Error('Google Request not ok');
  }
  const googleData = await res.json();
  if (!googleData) {
    throw new Error('GEO: empty data');
  }
  if (googleData.error_message) {
    throw new Error(googleData.error_message);
  }
  if (!Array.isArray(googleData.results)) {
    throw new ReferenceError('GEO: no results');
  }
  return googleData.results;
};
