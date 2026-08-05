import assert from 'node:assert';
import {beforeEach, describe, test} from 'node:test';

import 'dotenv/config';
// import {LangChainYandexGPT} from 'langchain-yandexgpt';
import {LangChainYandexGPT} from '../../langchain-yandexgpt/index.mjs';
import {ChatOpenAI} from "@langchain/openai";

import SecretaryAI from '../index.js';

describe('Secretary MCP API', () => {
  let secretaryAI = null;
  const authString = Buffer.from(`${process.env.SECRETARY_LOGIN}:${process.env.SECRETARY_PASSWORD}`).toString('base64');

  const model = new LangChainYandexGPT({
    temperature: 0,
  });

  beforeEach(async () => {
    if (!secretaryAI) {
      secretaryAI = new SecretaryAI({
        mcpServerUrl: process.env.SECRETARY_MCP_URL,
        serverName: process.env.SECRETARY_MCP_NAME,
        model,
      });
      const headers = new Headers();
      headers.append('Authorization', `Basic ${authString}`);
      await secretaryAI.connect(headers);
    }
  });

  test('chat', async () => {
    let query =
      'Привет!';

    const {content} = await secretaryAI.chat(query, {
      configurable: {
        thread_id: '1',
        tenant_id: 'test',
      },
      headers: {
        'Accept-Language': 'ru-RU',
      },
    });
    assert.ok(content[0].type === 'text');
  });
});
