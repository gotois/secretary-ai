import speech from '@google-cloud/speech';
import { makeMoreMetaData } from '../text/lib/nlp.mjs';
import env from '../environment/index.mjs';

const {GOOGLE} = env;

const speechClient = new speech.SpeechClient({
  credentials: GOOGLE.CREDENTIALS,
});

/**
 * @param {Buffer} buffer - audio buffer
 * @param {string} mime - mime type
 * @param {Boolean} offline
 * @returns {Object}
 **/
export default async (buffer, mime, offline) => {
  let context = [];

  if (offline) {
  } else {
    const text = await googleSpeechToText(buffer, metadata)
    const textContent = await makeMoreMetaData({
      text: text,
    });
    context.push(textContent);
  }

  return context;
};
/**
 * @param {Buffer} buffer
 * @param {Object} metadata
 * @returns {Promise<string>}
 */
export async function googleSpeechToText(buffer, metadata) {
  /**
   * @param obj {Object}
   * @param obj.mimeType
   * @param obj.duration
   * @returns {{sampleRateHertz: number, encoding: string, languageCode: string}}
   */
  const voiceMetadata = ({mimeType, duration, sampleRateHertz}) => {
    if (!duration) {
      throw new Error('Недостаточно данных для получения текста');
    }
    /**
     * @param {string} mimeType - mime type
     * @returns {string}
     */
    const convertTelegramMimeToGoogleMime = (mimeType) => {
      switch (mimeType) {
        case 'audio/ogg': {
          return 'OGG_OPUS';
        }
        case 'audio/mpeg': {
          return 'MP3';
        }
        default: {
          return 'AUDIO_ENCODING_UNSPECIFIED';
        }
      }
    };

    return {
      encoding: convertTelegramMimeToGoogleMime(mimeType), // raw 16-bit signed LE samples
      sampleRateHertz: sampleRateHertz,
      // todo: нужно заранее узнавать какой язык: en-US или ru-RU
      languageCode: 'ru-RU', // a BCP-47 language tag - https://www.rfc-editor.org/rfc/bcp/bcp47.txt
      // languageCode: 'en-US', // a BCP-47 language tag - https://www.rfc-editor.org/rfc/bcp/bcp47.txt
    };
  };

  /**
   * @param {string} content - base64 file
   * @param {object} obj - obj
   * @param {number} obj.duration - duration
   * @param {string} obj.mime_type - audio/ogg
   * @param {number} obj.sampleRateHertz
   * @throws {Error}
   * @returns {Promise<string>}
   */
  const voiceToText = async (content, {duration, mime_type, sampleRateHertz}) => {
    const request = {
      audio: {
        content: content,
      },
      config: voiceMetadata({
        mimeType: mime_type,
        duration: duration,
        sampleRateHertz: sampleRateHertz,
      }),
    };
    const [response] = await speechClient.recognize(request, {autoPaginate: true});
    if (
      response &&
      Array.isArray(response.results) &&
      Array.isArray(response.results[0] && response.results[0].alternatives)
    ) {
      return response.results[0].alternatives[0].transcript;
    }
    throw new Error('Ничего не распознано');
  };

  return await voiceToText(buffer.toString('base64'), {
    duration: metadata.format.duration,
    mime_type: 'audio/' + metadata.format.container.toLowerCase(),
    sampleRateHertz: metadata.format.sampleRate,
  });
}
