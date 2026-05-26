import {BaseCheckpointSaver} from '@langchain/langgraph-checkpoint';
import {DatabaseSync} from 'node:sqlite';
import {createIndex, serializeIndex, deserializeIndex} from './lib/minisearch.mjs';

export class SchemaMemory extends BaseCheckpointSaver {
  #db;

  constructor(db = new DatabaseSync(':memory:')) {
    super();

    this.#db = db;

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        checkpoint BLOB NOT NULL,
        metadata BLOB NOT NULL,
        parent_checkpoint_id TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      ) STRICT
    `);

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS search_indexes (
        thread_id TEXT PRIMARY KEY,
        index_data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT
    `);
  }

  indexMessage(thread_id, {id, role, content}) {
    if (!id || !content) return;

    const row = this.#db
      .prepare(`SELECT index_data FROM search_indexes WHERE thread_id = ?`)
      .get(thread_id);

    const ms = row ? deserializeIndex(row.index_data) : createIndex();

    // TODO: дедупликация — проверять ms.has(id) перед добавлением
    ms.add({id, role, content});

    this.#db
      .prepare(
        `INSERT INTO search_indexes (thread_id, index_data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(thread_id)
         DO UPDATE SET index_data = excluded.index_data, updated_at = excluded.updated_at`
      )
      .run(thread_id, serializeIndex(ms), Date.now());
  }

  search(thread_id, query) {
    if (!query || !thread_id) return [];

    const row = this.#db
      .prepare(`SELECT index_data FROM search_indexes WHERE thread_id = ?`)
      .get(thread_id);

    if (!row) return [];

    const ms = deserializeIndex(row.index_data);

    return ms.search(query, {
      fuzzy: 0.2,
      prefix: true,
      limit: 3,
    });
  }

  async getTuple(config) {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? '';
    const checkpoint_id = config.configurable?.checkpoint_id;

    if (!thread_id) {
      return undefined;
    }

    let row;
    if (checkpoint_id) {
      row = this.#db
        .prepare(
          `SELECT checkpoint, metadata, parent_checkpoint_id FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`
        )
        .get(thread_id, checkpoint_ns, checkpoint_id);
    } else {
      row = this.#db
        .prepare(
          `SELECT checkpoint, metadata, parent_checkpoint_id, checkpoint_id FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?
           ORDER BY updated_at DESC, checkpoint_id DESC
           LIMIT 1`
        )
        .get(thread_id, checkpoint_ns);
    }

    if (!row) {
      return undefined;
    }

    const deserializedCheckpoint = await this.serde.loadsTyped('json', row.checkpoint);
    const deserializedMetadata = await this.serde.loadsTyped('json', row.metadata);

    const checkpointTuple = {
      config: checkpoint_id ? config : {
        configurable: {
          thread_id,
          checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint: deserializedCheckpoint,
      metadata: deserializedMetadata,
      pendingWrites: [],
    };

    if (row.parent_checkpoint_id) {
      checkpointTuple.parentConfig = {
        configurable: {
          thread_id,
          checkpoint_ns,
          checkpoint_id: row.parent_checkpoint_id,
        },
      };
    }

    return checkpointTuple;
  }

  async put(config, checkpoint, metadata) {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = String(config.configurable?.checkpoint_ns ?? '');
    const parent_checkpoint_id = config.configurable?.checkpoint_id || null;

    if (!thread_id) {
      throw new Error('Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.');
    }

    const [[, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(checkpoint),
      this.serde.dumpsTyped(metadata),
    ]);
    const checkpoint_id = checkpoint.id;

    this.#db
      .prepare(
        `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, checkpoint, metadata, parent_checkpoint_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id)
         DO UPDATE SET
           checkpoint = excluded.checkpoint,
           metadata = excluded.metadata,
           parent_checkpoint_id = excluded.parent_checkpoint_id,
           updated_at = excluded.updated_at`
      )
      .run(
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        serializedCheckpoint,
        serializedMetadata,
        parent_checkpoint_id,
        Date.now()
      );

    // Индексируем новые сообщения из чекпоинта для поиска по истории
    const messages = checkpoint.channel_values?.messages ?? [];
    for (const msg of messages) {
      const role = msg._getType?.() ?? msg.role ?? 'unknown';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      this.indexMessage(thread_id, {id: msg.id, role, content});
    }

    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id,
      },
    };
  }

  async putWrites(config, writes, taskId) {
    // Обычно writes не нужны для SQLite memory
    // но хук обязателен
  }

  async* list(config, options) {
    const {before, limit, filter} = options ?? {};
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? '';

    let query = `SELECT thread_id, checkpoint_ns, checkpoint_id, checkpoint, metadata, parent_checkpoint_id FROM checkpoints`;
    const params = [];

    const conditions = [];
    if (thread_id) {
      conditions.push('thread_id = ?');
      params.push(thread_id);
    }
    if (checkpoint_ns) {
      conditions.push('checkpoint_ns = ?');
      params.push(checkpoint_ns);
    }
    if (before?.configurable?.checkpoint_id) {
      conditions.push('checkpoint_id < ?');
      params.push(before.configurable.checkpoint_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY updated_at DESC, checkpoint_id DESC';

    if (limit !== undefined) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.#db.prepare(query).all(...params);

    for (const row of rows) {
      const deserializedCheckpoint = await this.serde.loadsTyped('json', row.checkpoint);
      const deserializedMetadata = await this.serde.loadsTyped('json', row.metadata);

      if (filter && !Object.entries(filter).every(([key, value]) => deserializedMetadata[key] === value)) {
        continue;
      }

      const checkpointTuple = {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint: deserializedCheckpoint,
        metadata: deserializedMetadata,
        pendingWrites: [],
      };

      if (row.parent_checkpoint_id) {
        checkpointTuple.parentConfig = {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.parent_checkpoint_id,
          },
        };
      }

      yield checkpointTuple;
    }
  }

  clear() {
    this.#db.exec(`DELETE FROM checkpoints`);
  }
}
