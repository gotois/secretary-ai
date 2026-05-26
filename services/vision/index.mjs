import vision from '@google-cloud/vision';
import env from '../../environment/index.mjs';
import { readQR } from './lib/qr.mjs';

const { GOOGLE } = env;

const client = new vision.ImageAnnotatorClient({
  credentials: GOOGLE.CREDENTIALS,
});

export const textDetection = async (image) => {
  const [result] = await client.textDetection(image);
  return result;
};
/**
 * Performs label detection on the image file
 *
 * @param {Buffer|string} image - image file
 * @returns {Promise<object>}
 */
export const labelDetection = async (image) => {
  const [result] = await client.labelDetection(image);
  return result;
};
/**
 * @param {Buffer|string} image - image file
 * @returns {Promise<object>}
 */
export const webDetection = async (image) => {
  const [result] = await client.webDetection({ image });
  return result;
};
/**
 * @param {Buffer|string} image - image file
 * @returns {Promise<object>}
 */
export const objectLocalization = async (image) => {
  const [result] = await client.objectLocalization({ image });
  return result;
};

/**
 * @param {Buffer} imageBuffer
 * @param {string} mime
 * @returns {Object[]}
 */
export default async (imageBuffer, mime) => {
  const context = [];

  const labelResult = await labelDetection(imageBuffer);
  const hasFont = labelResult.labelAnnotations.some((labelAnnotation) => {
    return labelAnnotation.description.toLowerCase() === 'font';
  });
  if (hasFont) {
    const {fullTextAnnotation} = await textDetection(imageBuffer);
    if (fullTextAnnotation) {
      context.push({
        '@type': 'CreativeWork',
        'encodingFormat': 'text/plain',
        'description': fullTextAnnotation.text,
      });
    }
  }

  try {
    const qrString = await readQR(imageBuffer);
    context.push({
      '@type': 'CreativeWork',
      'encodingFormat': 'text/plain',
      'text': qrString,
    });
  } catch {
  }

  return context;
};
