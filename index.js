import {DynamicStructuredTool} from '@langchain/core/tools';
import {ToolMessage} from '@langchain/core/messages';
import {loadMcpTools} from '@langchain/mcp-adapters';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import textLD from 'text-ld';
import debug from 'debug';

import _pkg from './package.json' with {type: 'json'};
import AgentService from './agent.js';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 256;

export default class SecretaryAI {
  #client = new Client({
    name: _pkg.name,
    version: _pkg.version,
  });

  constructor(mcpServerUrl, serverName, model, db) {
    this.url = mcpServerUrl;
    this.serverName = serverName;
    if (!model.bindTools) {
      throw new Error('Missing model bindTools');
    }
    this.model = model;
    this.tools = [];
    this._isConnected = false;
    this.db = db;
  }

  get client() {
    return this.#client;
  }

  get timeZone() {
    return process.env.TZ ?? 'UTC';
  }

  get currentDate() {
    return new Intl.DateTimeFormat('ru', {
      year: 'numeric',
      month: 'long',
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
        :: Контекст:
        - Время клиента: ${this.currentDate} - ${this.timeZone}
        :: Используй только доступные инструменты согласно allowed_tools. Не совершай разрушительных действий без подтверждения пользователя.
        `
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getDescriptionWithTags(input) {
    const match = input.match(/^\[(.*?)\]\s*(.*)$/);

    if (match) {
      return {
        tags: match[1].split(',').map(tag => tag.trim()),
        description: match[2],
      }
    }

    return {
      tags: [],
      description: input,
    }
  }

  async #loadTools() {
    const tools = await loadMcpTools(this.serverName, this.client, {
      throwOnLoadError: true,
      prefixToolNameWithServerName: false,
      additionalToolNamePrefix: '',
      useStandardContentBlocks: false,
    });
    for (const tool of tools) {
      const {description, tags} = SecretaryAI.getDescriptionWithTags(tool.description);
      const t = new DynamicStructuredTool({
        name: tool.name,
        description: description,
        schema: new z.Schema(tool.schema),
        returnDirect: false,
        tags: tags,
        verbose: tool.verbose,
        func: async (args) => {
          let data;
          try {
            data = await this.client.callTool({
              name: tool.name,
              arguments: args,
            });
          } catch (error) {
            if ([401, 407, 451].includes(error.code)) {
              this._isConnected = false;
            }
            return new ToolMessage({
              name: tool.name,
              content: 'Произошла ошибка сети. Попробуйте заново',
              status: 'error',
              artifact: [],
            });
          }
          const {content, isError, artifact = []} = data;
          if (isError) {
            /**
             * @type {import("@langchain/core/messages").InvalidToolCall}
             */
            const brokenToolCall = {
              type: 'invalid_tool_call',
              args: JSON.stringify(args),
              error: content,
            };

            return new ToolMessage({
              name: tool.name,
              tool_call_id: brokenToolCall.id,
              metadata: args,
              status: 'error',
              content: 'Произошла ошибка',
              artifact: artifact,
            });
          }
          return new ToolMessage({
            name: tool.name,
            content: content?.[0]?.text || 'Нет данных',
            status: 'success',
            artifact: artifact,
          });
        },
      });
      this.tools.push(t);
    }
  }

  get isConnected() {
    return this._isConnected;
  }

  async connect(headers = new Headers()) {
    debug.log('connecting...', headers);
    await this.client.close();
    this._isConnected = false;

    headers.set('User-Agent', `${_pkg.name}/${_pkg.version}`);
    headers.set('Accept', 'text/markdown;q=0.9,text/plain;q=0.8,text/html;q=0.7,*/*;q=0.5');
    headers.set('Content-Type', 'application/json');

    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: {
        headers,
      },
    });
    try {
      await this.client.connect(transport);
      await this.#loadTools();
    } catch (error) {
      debug.log(error);
      this._isConnected = false;
      throw error;
    }
    this._agent = new AgentService(this.model, this.tools, this.systemPrompt, this.db);
    this._isConnected = true;
  }

  get agent() {
    return this._agent;
  }

  async transcription(fileId) {
    const transcriptionData = await this.client.readResource({
      uri: `transcription://${fileId}`,
    });
    return transcriptionData.contents[0].text;
  }

  async chat(query, config = {}) {
    if (query.length <= MIN_QUERY_LENGTH) {
      throw new Error('Запрос не должен быть пустым');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new Error(`Запрос должен быть не более ${MAX_QUERY_LENGTH} символов`);
    }
    const {text} = textLD.creativeWork(query);

    if (!this.isConnected) {
      await this.connect(config.headers);
    }

    const { messages, artifact } = await this.agent.execute({
      input: text,
    }, {
      recursionLimit: config.recursionLimit || 7,
      configurable: config.configurable,
      callbacks: [], // todo - настроить consoleHandler и Debug для логов и подсчета стоимости
      tags: [], // todo - настроить тегов для экспериментов или указания например что это telegram
      metadata: config.metadata,
    });
    const lastMessage = messages[messages.length - 1];
    if (artifact) {
      await this.agent.clearState(config);
    }

    return {
      content: [{
        type: 'text',
        text: lastMessage.content,
      }],
      artifact: artifact || [],
    };
  }
}
