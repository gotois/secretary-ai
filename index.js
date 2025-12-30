import {randomUUID} from 'node:crypto';

import {DynamicStructuredTool} from "@langchain/core/tools";
import {ToolMessage} from "@langchain/core/messages";
import {loadMcpTools} from '@langchain/mcp-adapters';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import textLD from 'text-ld';

import _pkg from './package.json' with {type: 'json'};
import AgentService from './agent.js';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 256;

export default class SecretaryAI {
  #client = new Client({
    name: _pkg.name,
    version: _pkg.version,
  });

  constructor(mcpServerUrl, model, lang) {
    this.url = mcpServerUrl;
    this.model = model;
    this.lang = lang;
    this.threadId = randomUUID();
    this.tools = [];
  }

  get client() {
    return this.#client;
  }

  get timeZone() {
    return process.env.TZ ?? 'UTC';
  }

  get currentDate() {
    return new Intl.DateTimeFormat(this.lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone: this.timeZone,
    }).format(new Date());
  }

  get systemPrompt() {
    return `
        Ты — Виртуальный Секретарь
        :: Инструкции:
        - Если данных недостаточно — уточни их у пользователя. НЕ выдумывай информацию
        - После каждого вызова инструмента кратко проверь результат (1-2 предложения) и продолжай только если всё корректно
        Контекст:
        - Текущее время ${this.timeZone}: ${this.currentDate}
        :: Используй только доступные инструменты согласно allowed_tools. Не совершай разрушительных действий без подтверждения пользователя.
        `
      .replace(/\s+/g, ' ')
      .trim();
  }

  async connect(serverName, headers) {
    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: {
        headers: headers,
      },
    });
    await this.client.connect(transport);
    const tools = await loadMcpTools(serverName, this.client, {
      throwOnLoadError: true,
      prefixToolNameWithServerName: false,
      additionalToolNamePrefix: '',
      useStandardContentBlocks: false,
    });
    for (const tool of tools) {
      // todo - поставил для теста
      // if (tool.name !== 'show-task') {
      //   continue;
      // }
      const t = new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: new z.Schema(tool.schema),
        func: async (args) => {
          const {content, artifact = {}} = await this.client.callTool({
            name: tool.name,
            arguments: args,
          });
          return new ToolMessage({
            name: tool.name,
            content: content?.[0]?.text || 'Данные отсутствуют',
            artifact: artifact,
          });
        },
      });
      this.tools.push(t);
    }

    this.agent = new AgentService(this.model, this.tools, this.systemPrompt);
  }

  async chat(query, context) {
    if (query.length <= MIN_QUERY_LENGTH) {
      throw new Error('Запрос не должен быть пустым');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new Error(`Запрос должен быть не более ${MAX_QUERY_LENGTH} символов`);
    }
    const {text} = await textLD.creativeWork(query, this.timeZone);

    const {messages, artifact} = await this.agent.execute({
      input: text,
    }, {
      configurable: {
        thread_id: this.threadId,
      },
      context: context,
    });

    return {
      content: [{
        type: 'text',
        text: messages[messages.length - 1].content,
      }],
      artifact: artifact,
    };
  }
}
