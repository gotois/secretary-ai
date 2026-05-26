import jsQR from 'jsqr';
import Jimp from 'jimp';

/**
 * @param {Buffer} buffer - buffer
 * @throws {Error}
 * @returns {Promise<string>}
 */
export const readQR = async (buffer) => {
  let image = await Jimp.read(buffer);
  const MAX_SIZE = 640;
  if (image.bitmap.width > MAX_SIZE || image.bitmap.height > MAX_SIZE) {
    image = image.contain(MAX_SIZE, MAX_SIZE).autocrop({
      cropSymmetric: true,
    });
  }
  const qrValue = jsQR(
    image.bitmap.data,
    image.bitmap.width,
    image.bitmap.height,
    {
      inversionAttempts: 'dontInvert',
    },
  );
  if (!qrValue) {
    throw new Error('QR: not found');
  } else if (!qrValue.data) {
    throw new Error('QR: data is null');
  }
  return qrValue.data;
};
