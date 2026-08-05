import {loadMcpTools} from '@langchain/mcp-adapters';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import textLD from 'text-ld';
import createDebug from 'debug';

import _pkg from './package.json' with {type: 'json'};
import AgentService from './agent.js';
import {SchemaMemory} from './memory.js';

const log = createDebug('secretary-ai');
const metadataSchema = z.record(z.string(), z.unknown()).optional();

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 256;

function normalizeContent(content) {
  if (typeof content === 'string') {
    return [{
      type: 'text',
      text: content,
    }];
  }

  if (!Array.isArray(content)) {
    return [{
      type: 'text',
      text: String(content ?? ''),
    }];
  }

  return content.map(block => {
    if (typeof block === 'string') {
      return {
        type: 'text',
        text: block,
      };
    }
    return block;
  });
}

class SecretaryAI {
  #agent;
  #client;
  #connectPromise;
  #customSystemPrompt;
  #memory;
  #model;
  #serverName;
  #timeZone;
  #tools = [];
  #transport;
  #url;
  _isConnected = false;

  constructor({
    mcpServerUrl,
    serverName,
    model,
    db,
    timeZone = process.env.TZ ?? 'UTC',
    systemPrompt,
  } = {}) {
    if (!mcpServerUrl) {
      throw new Error('MCP server URL is required');
    }
    if (!(typeof serverName === 'string' && serverName.trim())) {
      throw new Error('MCP server name is required');
    }
    if (!(model && typeof model.bindTools === 'function')) {
      throw new Error('Model must implement bindTools');
    }
    if (systemPrompt !== undefined && !(typeof systemPrompt === 'string' && systemPrompt.trim())) {
      throw new Error('System prompt must be a non-empty string');
    }

    this.#url = new URL(mcpServerUrl);
    this.#serverName = serverName.trim();
    this.#model = model;
    this.#memory = new SchemaMemory(db ?? new DatabaseSync(':memory:'));
    this.#timeZone = timeZone;
    this.#customSystemPrompt = systemPrompt?.trim();

    // Validate the timezone at construction time instead of failing during chat.
    new Intl.DateTimeFormat('ru', {timeZone: this.#timeZone}).format();
  }

  get isConnected() {
    return this._isConnected;
  }

  get #currentDate() {
    return new Intl.DateTimeFormat('ru', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour12: false,
      timeZone: this.#timeZone,
    }).format(new Date());
  }

  get #systemPrompt() {
    if (this.#customSystemPrompt) {
      return this.#customSystemPrompt;
    }

    return `
        Ты — Виртуальный Секретарь
        :: Инструкции:
        - Если данных недостаточно — уточни их у пользователя. НЕ выдумывай информацию
        :: Контекст:
        - Дата клиента: ${this.#currentDate}
        - Таймзона: ${this.#timeZone}
        :: Используй только доступные инструменты согласно allowed_tools. Не совершай разрушительных действий без подтверждения пользователя.
        `
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getDescriptionWithTags(input = '') {
    const match = input.match(/^\[(.*?)\]\s*(.*)$/);

    if (match) {
      return {
        tags: match[1].split(',').map(tag => tag.trim()).filter(Boolean),
        description: match[2],
      };
    }

    return {
      tags: [],
      description: input,
    };
  }

  #createClient() {
    return new Client({
      name: _pkg.name,
      version: _pkg.version,
    });
  }

  async #disconnect() {
    const client = this.#client;

    this._isConnected = false;
    this.#agent = undefined;
    this.#client = undefined;
    this.#tools = [];
    this.#transport = undefined;

    if (client) {
      try {
        await client.close();
      } catch (error) {
        log('Failed to close MCP client: %s', error.message);
      }
    }
  }

  async #connect(headersInit) {
    await this.#disconnect();

    const headers = new Headers(headersInit);
    headers.set('User-Agent', `${_pkg.name}/${_pkg.version}`);
    headers.set('Accept', 'text/markdown;q=0.9,text/plain;q=0.8,text/html;q=0.7,*/*;q=0.5');
    headers.set('Content-Type', 'application/json');

    const client = this.#createClient();
    const transport = new StreamableHTTPClientTransport(this.#url, {
      requestInit: {
        headers,
      },
    });

    transport.onclose = () => {
      if (this.#transport === transport) {
        this._isConnected = false;
      }
    };
    transport.onerror = error => {
      log('MCP transport error: %s', error.message);
    };

    this.#client = client;
    this.#transport = transport;

    try {
      log('Connecting to MCP server %s', this.#serverName);
      await client.connect(transport);

      const tools = await loadMcpTools(this.#serverName, client, {
        throwOnLoadError: true,
        prefixToolNameWithServerName: false,
        additionalToolNamePrefix: '',
        useStandardContentBlocks: true,
      });

      this.#tools = tools.map(tool => {
        const {description, tags} = SecretaryAI.getDescriptionWithTags(tool.description);
        tool.description = description;
        tool.tags = [...new Set([...(tool.tags ?? []), ...tags])];
        return tool;
      });

      this.#agent = new AgentService(this.#model, this.#tools, this.#systemPrompt, this.#memory);
      this._isConnected = true;
      log('Connected to MCP server %s with %d tools', this.#serverName, this.#tools.length);
    } catch (error) {
      log('Failed to connect to MCP server %s: %s', this.#serverName, error.message);
      await this.#disconnect();
      throw error;
    }
  }

  async connect(headers) {
    if (this.#connectPromise) {
      return this.#connectPromise;
    }

    const connectPromise = this.#connect(headers);
    this.#connectPromise = connectPromise;

    try {
      await connectPromise;
    } finally {
      if (this.#connectPromise === connectPromise) {
        this.#connectPromise = undefined;
      }
    }
  }

  async close() {
    if (this.#connectPromise) {
      try {
        await this.#connectPromise;
      } catch {
        // The connection cleanup is handled by #connect.
      }
    }
    await this.#disconnect();
  }

  async clear(threadId) {
    if (!(typeof threadId === 'string' && threadId.trim())) {
      throw new Error('Thread ID is required');
    }
    await this.#memory.deleteThread(threadId.trim());
  }

  async chat(query, config = {}) {
    if (typeof query !== 'string') {
      throw new TypeError('Query must be a string');
    }

    const normalizedQuery = query.trim();
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      throw new Error(`Запрос должен содержать не менее ${MIN_QUERY_LENGTH} символов`);
    }
    if (normalizedQuery.length > MAX_QUERY_LENGTH) {
      throw new Error(`Запрос должен быть не более ${MAX_QUERY_LENGTH} символов`);
    }

    const threadId = config.configurable?.thread_id;
    if (!(typeof threadId === 'string' && threadId.trim())) {
      throw new Error('configurable.thread_id is required');
    }

    const recursionLimit = config.recursionLimit ?? 10;
    if (!(Number.isInteger(recursionLimit) && recursionLimit > 0)) {
      throw new Error('recursionLimit must be a positive integer');
    }

    const {text} = textLD.creativeWork(normalizedQuery);

    if (!this.isConnected) {
      await this.connect(config.headers);
    }

    const {messages, artifact} = await this.#agent.execute({
      input: text,
    }, {
      recursionLimit,
      configurable: {
        ...config.configurable,
        thread_id: threadId.trim(),
      },
      callbacks: [],
      tags: [],
      metadata: metadataSchema.parse(config.metadata),
    });
    const lastMessage = messages[messages.length - 1];

    return {
      content: normalizeContent(lastMessage?.content),
      artifact: artifact ?? [],
    };
  }
}

export {SecretaryAI};
export default SecretaryAI;
