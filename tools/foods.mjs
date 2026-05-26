import FatSecret from 'node-fatsecret';
import { DynamicTool } from '@langchain/core/tools';

import { FAT_SECRET } from '../environment/index.mjs';

const fatSecret = new FatSecret(
  FAT_SECRET.API_ACCESS_KEY,
  FAT_SECRET.API_SHARED_SECRET,
);

export default new DynamicTool({
  name: 'foolds_func',
  description:
        'Определяет еду по названию и возвращает информацию о ней',
  func: async (search) => {
    let content = '';
    let url = '';
    let description = '';
    try {
      const { foods } = await fatSecret.request({
        method: 'foods.search',
        search_expression: search,
        max_results: 1,
      });
      const name = foods.food.food_name;
      description = foods.food.food_name + ' ' + foods.food.food_description;
      url = foods.food.food_url;
      content = name + '\n\n' + description + '\n\n' + url;
      return {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Note',
        content: content,
        mediaType: 'text/markdown',
      };
    } catch (error) {
      console.error('FatSecret disabled:', error.message);
    }
  },
});
