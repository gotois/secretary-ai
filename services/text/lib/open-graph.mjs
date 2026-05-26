import * as cheerio from 'cheerio';

/**
 * @param {string} url - page url
 * @param {object} [headers] - headers
 * @returns {Promise<object>}
 */
export default async (url, headers) => {
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  if (response.status >= 400) {
    throw new Error('crawler error');
  }
  switch (response.headers.get('content-type')) {
    case 'application/ld+json; charset=utf-8': {
      const resultObject = await response.json();

      return {
        '@type': 'WebContent',
        '@context': {
          schema: 'http://schema.org/',
          alternativeHeadline: 'schema:alternativeHeadline',
          name: 'schema:name',
          description: 'schema:description',
          encodingFormat: 'schema:encodingFormat',
          url: 'schema:url',
        },
        'abstract': resultObject,
        'encodingFormat': 'application/json',
        'url': url,
      };
    }
    default: {
      const html = await response.text();
      const $ = cheerio.load(html);

      const title = $('title').text();
      let alternativeHeadline = '';
      $('meta[property="og:title"]').each((i, item) => {
        alternativeHeadline = item.attribs.content;
      });

      let description = '';
      $('meta[property="og:description"]').each((i, item) => {
        description = item.attribs.content;
      });

      let name = '';
      $('meta[property="og:site_name"]').each((i, item) => {
        name = item.attribs.content;
      });

      return {
        '@type': 'WebContent',
        '@context': {
          schema: 'http://schema.org/',
          alternativeHeadline: 'schema:alternativeHeadline',
          name: 'schema:name',
          description: 'schema:description',
          encodingFormat: 'schema:encodingFormat',
          url: 'schema:url',
        },
        'abstract': html,
        'alternativeHeadline': alternativeHeadline,
        'name': title ?? name ?? '',
        'description': description ?? '',
        'encodingFormat': 'text/html', // todo брать кодировку от ответа url (response.headers.get('content-type')?)
        'url': url,
      };
    }
  }
};
