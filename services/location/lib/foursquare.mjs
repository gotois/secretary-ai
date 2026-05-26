import env from '../../environment/index.mjs';
import { getUseCountry } from './countries.mjs';

const { FOURSQUARE} = env;

/**
 * @constant
 * @type {string}
 */
const FOURSQUARE_HOST = 'api.foursquare.com';
const VERSION = 'v2';

const yyyy = new Date().getFullYear();
const mm = '01';
const dd = '01';
const V = +yyyy + mm + dd;

/**
 * @description Foursquare node.js API
 * @see https://ru.foursquare.com/oauth2/authenticate?client_id=CLIENT_ID&response_type=token&redirect_uri=REDIRECT_URI
 * @param {object} parameters - params
 * @param {object} parameters.ll - lat lon
 * @param {string} [parameters.country] - country
 * @param {string} parameters.query - query
 * @param {number} parameters.limit - limit
 * @returns {Promise}
 */
export const search = async (parameters) => {
  if (!parameters.ll) {
    if (!parameters.country) {
      throw new Error('Needs ll or county');
    }
    const [country] = await getUseCountry(parameters.country);
    parameters.ll = {
      lat: country.latlng[0],
      lng: country.latlng[1],
    };
  }
  const headers = new Headers();
  headers.append('accept', 'application/json');
  //         qs: {
  //             client_id: FOURSQUARE.CLIEND_ID,
  //             client_secret: FOURSQUARE.CLIENT_SECRET,
  //             ll: parameters.ll,
  //             near: parameters.near,
  //             query: parameters.query,
  //             intent: parameters.intent,
  //             radius: parameters.radius,
  //             sw: parameters.sw,
  //             ne: parameters.ne,
  //             categoryId: parameters.categoryId,
  //             llAcc: parameters.llAcc,// eslint-disable-line
  //             altAcc: parameters.altAcc,// eslint-disable-line
  //             alt: parameters.alt,
  //             url: parameters.url,
  //             providerId: parameters.providerId,
  //             linkedId: parameters.linkedId,
  //             limit: parameters.limit || 1,

  const response = await fetch(`https://${FOURSQUARE_HOST}/${VERSION}/venues/search?client_id=${FOURSQUARE.CLIEND_ID}&client_secret=${FOURSQUARE.CLIENT_SECRET}&${parameters.query}=sushi&ll=${parameters.ll.lat},${parameters.ll.lng}&v=${V}`, {
    method: 'GET',
    headers,
  });
  return response.json();
};
