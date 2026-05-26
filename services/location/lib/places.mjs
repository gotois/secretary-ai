import { getGeoCode } from './google-maps.mjs';

export function createGeoCoordinates({ lat, lng }) {
  const context = {
    '@type': 'GeoCoordinates',
  };
  context.latitude = lat;
  context.longitude = lng;

  return context;
}

export function createPostalAddress(address_components) {
  const context = {
    '@type': 'PostalAddress'
  };
  const streetAddress = address_components.find((address) => {
    return address.types.includes('route');
  });
  const postalCode = address_components.find((address) => {
    return address.types.includes('postal_code');
  });
  const addressCountry = address_components.find((address) => {
    return address.types.includes('country');
  });
  const addressLocality = address_components.find((address) => {
    return address.types.includes('locality');
  });
  const addressRegion = address_components.find((address) => {
    return address.types.includes('sublocality');
  });
  if (addressCountry) {
    if (addressCountry.short_name) {
      context.addressCountry = addressCountry.short_name;
    }
  }
  if (streetAddress) {
    if (streetAddress.short_name) {
      context.streetAddress = streetAddress.short_name;
    }
  }
  if (postalCode) {
    if (postalCode.short_name) {
      context.postalCode = postalCode.short_name;
    }
  }
  if (addressRegion) {
    if (addressRegion.short_name) {
      context.addressRegion = addressRegion.short_name;
    }
  }
  if (addressLocality) {
    if (addressLocality.short_name) {
      context.addressLocality = addressLocality.short_name;
    }
  }
  return context;
}

export function createPlace() {
  const context = {
    '@type': 'Place',
  };
  return context;
}

/**
 * @returns {Object}
 */
export default async (input) => {
  const [latitude, longitude] = input.geometry.coordinates;
  const context = createPlace();
  context.latitude = latitude;
  context.longitude = longitude;

  try {
    const [geocode] = await getGeoCode({latitude, longitude});
    if (geocode) {
      context.geo = createGeoCoordinates(geocode.geometry.location);
      context.address = createPostalAddress(geocode.address_components);
      context.address.description = geocode.formatted_address;
    }
  } catch (error) {
    console.warn('GeoCode', error);
  }

  return context;
};
