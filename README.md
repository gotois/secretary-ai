# Secretary AI SDK

## Требования

- MCP-сервер с Streamable HTTP transport и хотя бы одним инструментом.
- LangChain-совместимая модель с методом `bindTools()`.

## Установка

```bash
npm install secretary-ai
```

Провайдер модели устанавливается отдельно. Например, для OpenAI:

```bash
npm install @langchain/openai
```

## Локальная разработка

```bash
npx npmrc-replace-env
npm i
```

Необходимые переменные окружения:

```shell
YC_API_KEY
YC_IAM_TOKEN

SECRETARY_MCP_NAME
SECRETARY_MCP_URL
SECRETARY_LOGIN
SECRETARY_PASSWORD
```

## Использование

```js
import {ChatOpenAI} from '@langchain/openai';
import SecretaryAI from 'secretary-ai';

const model = new ChatOpenAI({
  model: 'gpt-4.1-mini',
  temperature: 0,
});

const secretary = new SecretaryAI({
  mcpServerUrl: 'https://example.com/mcp',
  serverName: 'secretary',
  model,
  timeZone: 'Europe/Moscow',
});

const result = await secretary.chat('Какие встречи запланированы на завтра?', {
  configurable: {
    thread_id: 'user-42',
  },
  headers: {
    Authorization: `Bearer ${process.env.MCP_TOKEN}`,
  },
});

console.log(result.content);

await secretary.clear('user-42');
await secretary.close();
```

Вызов `connect()` необязателен: при первом `chat()` библиотека подключится автоматически. Для
нескольких запросов можно подключиться заранее и передать заголовки авторизации в `connect()`.

## API

### `new SecretaryAI(options)`

- `mcpServerUrl` — URL Streamable HTTP endpoint MCP-сервера.
- `serverName` — имя сервера для MCP/LangChain.
- `model` — LangChain-совместимая модель с `bindTools()`.
- `db` — необязательный совместимый экземпляр `node:sqlite` `DatabaseSync`. По умолчанию используется
  база `:memory:`.
- `timeZone` — IANA-таймзона клиента. По умолчанию используется `process.env.TZ` или `UTC`.
- `systemPrompt` — необязательный пользовательский системный промпт.

### `connect(headers?)`

Подключается к MCP-серверу и загружает инструменты. Принимает `Headers`, обычный объект или массив пар
заголовков.

### `chat(query, config)`

Отправляет запрос агенту. `config.configurable.thread_id` обязателен и используется для выбора истории
диалога. Длина запроса после удаления пробелов должна быть от 2 до 256 символов.

Результат:

```js
{
  content: [
    {
      type: 'text',
      text: 'Ответ секретаря',
    },
  ],
  artifact: [],
}
```

`content` содержит ответ модели, а `artifact` — данные, возвращённые инструментами.

### `clear(threadId)`

Удаляет историю и поисковый индекс указанного диалога.

### `close()`

Закрывает MCP-соединение. После закрытия следующий `chat()` подключится заново.

## Ошибки

Ошибки подключения MCP пробрасываются вызывающему коду. Ошибки выполнения инструментов возвращаются
агентом в безопасном виде.
