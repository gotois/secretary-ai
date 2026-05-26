import googlePDFReader from './pdf/index.mjs';

/**
 * @param {Buffer} buffer
 * @param {string} mime
 * @returns {Object[]} context
 **/
export default async (buffer, mime) => {
  const context = [];

  try {
    const ld = {
      '@type': 'CreativeWork',
      'encodingFormat': mime,
    };
    ld.description = await googlePDFReader(buffer);
    context.push(ld);
  } catch (e) {
    console.error(e);
  }

  return context;
};
