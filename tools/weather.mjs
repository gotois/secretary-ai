import { tool } from '@langchain/core/tools';
import weather from 'openweather-apis';
import { z } from 'zod';

import { OPEN_WEATHER } from '#env';

/*
@remarks
Подключение:
server.tool(weatherTool.name,
      weatherTool.description,
      weatherTool.schema.shape,
      async (args) => {
        const result = await weatherTool.invoke(args);
        const textResponse = Array.isArray(result) ? result[0] : result;
        return {
          content: [
            {
              type: 'text',
              text: String(textResponse),
            },
          ],
        };
      }
    );
 */


/**
 * @param {object} obj - obj
 * @param {number} obj.latitude - lat
 * @param {number} obj.longitude - lng
 * @param {object} [o] - object
 * @param {string} [o.lang] - lang
 * @param {string} [o.units] - units
 * @throws {Error}
 * @returns {Promise<{description: string, humidity: any, pressure: any, rain: any, temp: number, weathercode: number}>}
 */
export function getWeather ({ latitude, longitude }, { lang = 'ru', units = 'metric' } = {}) {
  if (!latitude || !longitude) {
    throw new Error('latitude or longitude is invalid');
  }
  if (!OPEN_WEATHER.KEY) {
    throw new Error('OPEN_WEATHER.KEY is invalid');
  }
  weather.setAPPID(OPEN_WEATHER.KEY);
  weather.setLang(lang);
  weather.setUnits(units);
  weather.setCoordinate(latitude, longitude);

  return new Promise((resolve, reject) => {
    weather.getSmartJSON((error, smart) => {
      if (error) {
        return reject(error);
      }
      return resolve(smart);
    });
  });
}

export default tool(
  async ({lat, lng}) => {
    try {
      const w = await getWeather({latitude: lat, longitude: lng});
      return [
        `Погода: ${w.description}, Температура: ${w.temp}°C, Влажность: ${w.humidity}%, Давление: ${w.pressure} hPa, Дождь: ${w.rain ? w.rain + ' мм' : 'нет'}`,
        w,
      ];
    } catch (error) {
      console.error(error);
      return ['Не удалось получить данные о погоде'];
    }
  },
  {
    name: 'weather_func',
    description: 'Получает актуальную информацию о погоде по координатам широты и долготы выбранного города',
    schema: z.object({
      lat: z.number()
        .min(-90, 'Широта должна быть от -90 до 90')
        .max(90, 'Широта должна быть от -90 до 90')
        .refine(value => { return value !== 0; }, { message: 'Широта не может быть равна 0' }),
      lng: z.number()
        .min(-180, 'Долгота должна быть от -180 до 180')
        .max(180, 'Долгота должна быть от -180 до 180')
        .refine(value => { return value !== 0; }, { message: 'Долгота не может быть равна 0' }),
    }),
    responseFormat: 'content_and_artifact',
  },
);
