import { tool } from '@langchain/core/tools';
import { parseBuffer } from 'music-metadata';

import text from '../services/text/index.mjs';
import location from '../services/location/index.mjs';
import xml from '../services/document/xml/index.mjs';
import pdf from '../services/document/pdf/index.mjs';
import image from '../services/vision/index.mjs';

export default tool(
  async ({response}) => {
    try {
      const mime = response.headers.get('content-type');
      const input = Buffer.from(await response.arrayBuffer());

      switch (mime.toLowerCase()) {
        case 'text/markdown':
        case 'text/plain': {
          const artifact = await text(input.toString(), mime);
          return {
            content: [{type: 'text', text: input.toString()}],
            artifact,
          };
        }
        case 'application/vnd.geo+json':
        case 'application/geo+json': {
          const artifact = await location(input, mime);
          return {
            content: [{type: 'text', text: JSON.stringify(artifact)}],
            artifact,
          };
        }
        case 'application/xml': {
          const artifact = await xml(input, mime);
          return {
            content: [{type: 'text', text: JSON.stringify(artifact)}],
            artifact,
          };
        }
        case 'application/pdf': {
          const artifact = await pdf(input);
          return {
            content: [{type: 'text', text: JSON.stringify(artifact)}],
            artifact,
          };
        }
        case 'image/jpg':
        case 'image/jpeg':
        case 'image/png': {
          const artifact = await image(input, mime);
          return {
            content: [{type: 'text', text: JSON.stringify(artifact)}],
            artifact,
          };
        }
        case 'audio/wav':
        case 'audio/ogg':
        case 'audio/mpeg':
        case 'audio/m4a': {
          const metadata = await parseBuffer(input, mime, {
            duration: true,
            skipCovers: false,
            includeChapters: false,
          });
          const schema = {
            '@context': 'https://schema.org/',
            '@type': 'CreativeWork',
          };
          if (metadata.common.picture) {
            if (Array.isArray(metadata.common.picture)) {
              const [picture] = metadata.common.picture;
              schema.thumbnail = {
                contentUrl: picture.data.toString('base64'),
                caption: picture.description,
                encodingFormat: picture.format,
              };
            }
          }
          if (metadata.common.title) {
            schema.alternativeHeadline = metadata.common.title;
          }
          if (metadata.common.artist) {
            schema.author = metadata.common.artist;
          }
          if (metadata.common.year) {
            schema.copyrightYear = metadata.common.year;
          }
          if (Array.isArray(metadata.common.genre)) {
            schema.genre = [];
            for (const genre of metadata.common.genre) {
              schema.genre.push(genre);
            }
          }
          if (Array.isArray(metadata.common.comment) && metadata.common.comment.length) {
            schema.comment = [];
            for (const comment of metadata.common.comment) {
              schema.comment.push({ text: comment });
            }
            schema.commentCount = schema.comment.length;
          }
          return {
            content: [{type: 'text', text: JSON.stringify(schema)}],
            artifact: [schema],
          };
        }
        default: {
          throw new Error(`Unknown document mimetype: ${mime}`);
        }
      }
    } catch (error) {
      console.error(error);
      return ['Не удалось получить данные'];
    }
  },
  {
    name: 'vzor_func',
    description: 'Извлекаем данные из документа в семантическом формате артефакта посредством разных API: Преобразование различного ввода в стандартный машиночитаемый вид, извлечение из ввода мета информации, преобразование в строгий искусственный язык с ограниченным словарем Schema.org для простого понимания другой системой.',
    responseFormat: 'content_and_artifact',
  },
);
