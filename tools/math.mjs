import { DynamicTool } from '@langchain/core/tools';
import wolframAlphaAPI from 'wolfram-alpha-api';

import { WOLFRAM } from '#env';

const wolframAPI = wolframAlphaAPI(WOLFRAM.APP_ID);

export default new DynamicTool({
  name: 'math_func',
  description:
    'Определяет математическое выражение и возвращает его результат',
  func: async (expression) => {
    const result = await wolframAPI.getFull(expression);
    if (!result.success) {
      throw new Error('Wolfram API error');
    }
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Note',
      content: result.pods.find(pod => {
        return pod.id === 'Result';
      }).subpods[0].plaintext,
    };
  },
});
