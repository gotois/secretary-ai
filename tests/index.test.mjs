import assert from 'node:assert';
import {beforeEach, describe, test} from 'node:test';

import 'dotenv/config';
import {LangChainYandexGPT} from 'langchain-yandexgpt';

import SecretaryAI from '../index.js';

describe('Secretary MCP API', () => {
  let secretaryAI = null;
  const authString = Buffer.from(`${process.env.SECRETARY_LOGIN}:${process.env.SECRETARY_PASSWORD}`).toString('base64');

  const model = new LangChainYandexGPT({
    temperature: 0,
    apiKey: process.env.YC_API_KEY,
    folderID: process.env.YC_IAM_TOKEN,
    model: 'yandexgpt-lite',
  });

  beforeEach(async () => {
    if (!secretaryAI) {
      secretaryAI = new SecretaryAI(process.env.SECRETARY_MCP_URL, model, 'ru-RU');
      await secretaryAI.connect(
        'secretary-mcp-server',
        {
          'Authorization': `Basic ${authString}`,
        },
      );
    }
  });

  test('chat', async () => {
    let query =
      'Привет!';

    const {content} = await secretaryAI.chat(query, {user_id: '1'});
    assert.ok(content[0].type === 'text');
  });
});
