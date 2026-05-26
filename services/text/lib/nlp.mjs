import language from '@google-cloud/language';
import validator from 'validator';
import translateText from './translator.mjs';
import ogParser from './open-graph.mjs';
import knowledgeGraph from './knowledge-graph.mjs';
import { formatPhone, formatURL } from './utils.mjs';
import { getReverseGeoCode } from '../../location/lib/google-maps.mjs';
import { createPlace, createGeoCoordinates } from '../../location/lib/places.mjs';
import getSuggest from './suggest.mjs';
import yandexCorrectionText from './yandex-speller.mjs';
import env from '../../../environment/index.mjs';

const { GOOGLE } = env;

const languageClient = new language.LanguageServiceClient({
  credentials: GOOGLE.CREDENTIALS,
});

/**
 * @constant
 * @type {number}
 */
const TRANSLATE_LIMIT = 4096;
/**
 * @constant
 * @type {number}
 */
const GOOGLE_TOKEN_LIMIT = 2048;
/**
 * @constant
 * @type {number}
 */
const SPELLER_LIMIT = 512;
/**
 * @constant
 * @type {number}
 */
const SUGGEST_LIMIT = 256;

/**
 * @constant
 * @type {string}
 */
const ENCODING_TYPE_UTF8 = 'UTF8';

/**
 *
 * @param {string} text - text
 * @param {string} [language] - ISO 8601 language code
 * @returns {{language: string, type: string, content: string}}
 */
const document = (text, language) => {
  return {
    type: 'PLAIN_TEXT',
    language: language,
    content: text,
  };
};

/**
 * Русский язык пока не поддерживается
 *
 * @description Detects the sentiment of the document
 * @param {string} text - text
 * @param {string} lang - ISO 8601 language code
 * @returns {Promise<object>}
 */
export const analyzeSentiment = async (text, lang) => {
  if (lang !== 'en') {
    throw new Error('This language is not supported');
  }
  const [result] = await languageClient.analyzeSentiment({
    document: document(text, lang),
  });
  return result;
};
/**
 * Русский язык не поддерживается
 * Нужно запрашивать действительно большие тексты
 *
 * @param {string} text - text
 * @param {string} lang - language
 * @returns {Promise<object>}
 */
export const classifyText = async (text, lang) => {
  const [classification] = await languageClient.classifyText({
    document: document(text, lang),
  });
  return classification;
};
/**
 * Русский язык пока не поддерживается
 *
 * @param {string} text - text
 * @param {string} lang - language
 * @returns {Promise<object>}
 */
export const analyzeEntitySentiment = async (text, lang) => {
  const [result] = await languageClient.analyzeEntitySentiment({
    document: document(text, lang),
  });
  return result;
};
/**
 * @param {string} text - text
 * @param {string} language - language
 * @returns {Promise<object>}
 */
export const analyzeEntities = async (text, language) => {
  const [result] = await languageClient.analyzeEntities({
    document: document(text, language),
  });
  return result.entities;
};
/**
 * @todo Русский язык не поддерживается
 * @param {string} text - text
 * @param {string} language - language
 * @returns {Promise<object>}
 */
export const annotateText = async (text, language) => {
  const [result] = await languageClient.annotateText({
    document: document(text, language),
    features: features(text, language),
    encodingType: ENCODING_TYPE_UTF8,
  });
  return result;
};
/**
 * @description The text to analyze
 * @param {string} text - string text
 * @param {string} [lang] - language
 * @returns {Promise<object>}
 */
export const analyzeSyntax = async (text, lang) => {
  const [syntax] = await languageClient.analyzeSyntax({ document: document(text, lang) });
  return syntax;
};
/**
 * @param {string} text - text
 * @param {string} [language] - language
 * @returns {{extractEntities: boolean, extractSyntax: boolean, extractDocumentSentiment: boolean, extractEntitySentiment: boolean, classifyText: boolean}}
 */
const features = (text, language) => {
  const rus = /ru/.test(language);
  // гипотеза - 100 достаточно чтобы считалось большим предложением
  const classifyText = !rus && text.length > 100;
  const extractDocumentSentiment = !rus;
  const extractEntitySentiment = !rus;
  return {
    extractSyntax: true,
    extractEntities: true,
    extractDocumentSentiment, // не работает для русского текста
    extractEntitySentiment, // не работает для русского текста
    classifyText: classifyText, // TODO: работает только на больших предложениях
    moderateText: false,
  };
};
/**
 * Анализируем поведение введенного текста: узнаем желания/намерение пользователя в более глубоком виде
 * @param {string} text - string
 * @param {Object} tokens - tokens
 * @param {string} language - language
 */
function makePunctuationMark(text, tokens, language) {
  // формируем верное окончание предложения
  switch (text[text.length -1]) {
    // символ «?» для вопросительных предложений
    case '?':
      // символ «!» для восклицательных предложений
    case '!':
      // символ «.» для обычных предложений
    case '.':
    {
      break;
    }
    // выставляем конечные символы автоматически
    default: {
      // пока работает только с русским языком
      if (language !== 'ru') {
        break;
      }
      let i = 0;
      for (const token of tokens) {
        const {partOfSpeech} = token;
        if (i === 0) {
          if (partOfSpeech.tag === 'ADV' || partOfSpeech.tag === 'PRON') {
            text += '?';
            break;
          }
        }
        i++;
      }
      break;
    }
  }
  return text;
}

/**
 * @param context
 * @return {Promise<void>}
 */
async function getAnnotation(context) {
  const { sentences, entities, tokens, language } = await annotateText(context.text, context.inLanguage);
  context.text = makePunctuationMark(context.text, tokens, language);
  for (const sentence of sentences) {
    context.description += sentence.text.content;
  }
  let annotation = 0;

  for (const entity of entities) {
    const { type, name, mentions, metadata } = entity;
    switch (type) {
      case 'LOCATION': {
        const proper = mentions.find(mention => {
          return mention.type === 'PROPER';
        });
        if (!proper) {
          continue;
        }
        try {
          const [data] = await getReverseGeoCode(proper.text.content);
          const placeContext = createPlace();
          const {location} = data.geometry;
          placeContext.latitude = location.lat;
          placeContext.longitude = location.lng;
          placeContext.geo = createGeoCoordinates(location);
          placeContext.address = {
            description: data.formatted_address,
          };
          for (const {text} of mentions) {
            context.description = context.description.replace(text.content, placeContext.address.description);
          }
          context.about.push(placeContext);
        } catch (e) {
          console.error('Cannot get location:', e.message);
        }
        break;
      }
      case 'ADDRESS': {
        const query = metadata.locality + ','
            + metadata.street_name
            + '+' + metadata.street_number
            + ',' + metadata.country;
        const [data] = await getReverseGeoCode(query);
        const placeContext = createPlace();
        const {location} = data.geometry;
        placeContext.latitude = location.lat;
        placeContext.longitude = location.lng;
        placeContext.geo = createGeoCoordinates(location);
        placeContext.address = {
          description: data.formatted_address,
        };
        for (const {text} of mentions) {
          context.description = context.description.replace(text.content, placeContext.address.description);
        }
        context.about.push(placeContext);

        // Позже добавить погоду для данной локации в текущее время
        // ...
        break;
      }
      case 'PHONE_NUMBER':
      case 'NUMBER': {
        const phoneNumber = formatPhone(name);
        if (phoneNumber) {
          for (const {text} of mentions) {
            context.description = context.description.replace(text.content, phoneNumber);
          }
          context.about.push({
            '@context': 'https://www.w3.org/ns/anno.jsonld',
            type: 'Annotation',
            id: context.url + '/annotations/' + ++annotation,
            created: new Date().toJSON(),
            body: {
              value: 'TEL;TYPE=work, voice, pref, msg:' + phoneNumber,
              format: 'text/vcard',
            },
            target: context.url,
          });
        }
        break;
      }
      case 'DATE': {
        let sourceDate;
        if (!isNaN(new Date(name))) {
          sourceDate = name;
        }
        if (sourceDate) {
          for (const {text} of mentions) {
            context.description = context.description.replace(text.content, sourceDate);
          }
        }
        context.about.push({
          '@context': 'https://www.w3.org/ns/anno.jsonld',
          type: 'Annotation',
          id: context.url + '/annotations/' + ++annotation,
          body: {
            // "source": "http://example.org/page1", // todo
            state: {
              type: 'TimeState',
              sourceDate: sourceDate,
            }
          },
          target: context.url,
        });
        break;
      }
      case 'ORGANIZATION': {
        context.about.push({
          '@context': 'https://www.w3.org/ns/anno.jsonld',
          type: 'Annotation',
          id: context.url + '/annotations/' + ++annotation,
          body: {
            value: 'ORG:' + name,
            format: 'text/vcard',
            // todo Для организаций найти их ИНН и сайт
          },
          target: context.url,
        });
        break;
      }
      case 'PERSON': {
        context.about.push({
          '@context': 'https://www.w3.org/ns/anno.jsonld',
          type: 'Annotation',
          id: context.url + '/annotations/' + ++annotation,
          body: {
            value: 'MEMBER:' + name,
          },
          target: context.url,
        });
        break;
      }
      case 'CONSUMER_GOOD': {
        if (language !== 'en') {
          break;
        }
        try {
          const gkgData = await knowledgeGraph(entity.name);
          if (gkgData.itemListElement?.length > 0) {
            const anno = {
              '@context': 'https://www.w3.org/ns/anno.jsonld',
              type: 'Annotation',
              id: context.url + '/annotations/' + ++annotation,
            };
            anno.body = {
              type: 'TextualBody',
              value: gkgData.itemListElement[0].result.detailedDescription.articleBody,
              format: 'text/plain',
            };
            if (!anno.body.target) {
              anno.body.target = gkgData.itemListElement[0].result?.image?.url
                  ?? gkgData.itemListElement[0].result?.detailedDescription?.url;
            }
            context.about.push(anno);
          }
        } catch {
          console.warn('Cannot Knowledge Load');
        }
        break;
      }
      case 'OTHER': {
        const phoneNumber = formatPhone(name);
        if (phoneNumber) {
          for (const {text} of mentions) {
            context.description = context.description.replace(text.content, phoneNumber);
          }
          context.about.push({
            '@context': 'https://www.w3.org/ns/anno.jsonld',
            type: 'Annotation',
            id: context.url + '/annotations/' + ++annotation,
            body: {
              value: 'TEL;TYPE=work, voice, pref, msg:' + name,
              format: 'text/vcard',
            },
            target: context.url,
          });
          break;
        }
        if (validator.isEmail(name)) {
          for (const {text} of mentions) {
            context.description = context.description.replace(text.content, 'mailto:' + name);
          }
          context.about.push({
            '@context': 'https://www.w3.org/ns/anno.jsonld',
            id: context.url + '/annotations/' + ++annotation,
            type: 'Annotation',
            body: {
              value: 'EMAIL;TYPE=INTERNET:' + name,
              format: 'text/vcard',
            },
            target: context.url,
          });
          break;
        }
        const url = formatURL(name);
        if (url) {
          const anno = {
            '@context': 'https://www.w3.org/ns/anno.jsonld',
            type: 'Annotation',
            id: context.url + '/annotations/' + ++annotation,
            created: new Date().toJSON(),
            target: url,
          };
          try {
            const webContent = await ogParser(url);
            anno.generator = {
              name: (webContent.name).trim(),
            };
            anno.body = {
              type: 'TextualBody',
              id: webContent.url,
              // (webContent.name).trim()
              value: webContent.abstract,
              format: 'text/html',
            };
            for (const {text} of mentions) {
              context.description = context.description.replace(text.content, url);
            }
          } catch {
            console.warn('Cannot load: ', url);
          } finally {
            context.about.push(anno);
          }
          break;
        }
      }
      default: {
        break;
      }
    }
  }
}

export async function makeMoreMetaData(context, timeZone) {
  if (context.text.length < TRANSLATE_LIMIT) {
    // для языков кроме русского и английского переводим в английский
    if (!['ru', 'en'].includes(context.inLanguage)) {
      context.text = await translateText(context.text, 'en');
      context.inLanguage = 'en';
    }
    if (context.text.length < SPELLER_LIMIT) {
      try {
        context.text = await yandexCorrectionText(context.text, context.inLanguage);
      } catch (error) {
        console.warn('Yandex Speller disabled:', error.message);
      }
    }
  }
  if (context.text.length < SUGGEST_LIMIT) {
      if (['en'].includes(context.inLanguage)) {
        try {
          context.text = await getSuggest(context.text, context.inLanguage);
        } catch (error) {
          console.warn('Yandex Suggest disabled:', error.message);
        }
      }
  }

  context.description = '';
  context.about = [];

    try {
      if (context.text.length < GOOGLE_TOKEN_LIMIT) {
        await getAnnotation(context, timeZone);
      } else {
        console.warn('Long text for annotation');
      }
    } catch (error) {
      console.warn('Google Annotation disabled:', error.message);
    }

  return context;
}
