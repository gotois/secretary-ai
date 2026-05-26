import geocode from './lib/places.mjs';

/**
 * @param {Object} geoJSON
 * @param {string} mime
 * @returns {Object[]} context
 */
export default async (geoJSON, mime) => {
  const context = [];
  const ld = {
    '@type': 'CreativeWork',
    'encodingFormat': mime,
  };
  ld.contentLocation = await geocode(geoJSON);
  if (ld.contentLocation.address) {
    ld.description = ld.contentLocation.address.description;
  }
  context.push(ld);
  return context;
};
