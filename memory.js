import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  copyCheckpoint,
} from '@langchain/langgraph-checkpoint';
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
        checkpoint_type TEXT NOT NULL DEFAULT 'json',
        metadata BLOB NOT NULL,
        metadata_type TEXT NOT NULL DEFAULT 'json',
        parent_checkpoint_id TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      ) STRICT
    `);

    this.#ensureColumn('checkpoints', 'checkpoint_type', `TEXT NOT NULL DEFAULT 'json'`);
    this.#ensureColumn('checkpoints', 'metadata_type', `TEXT NOT NULL DEFAULT 'json'`);

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoint_writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        write_index INTEGER NOT NULL,
        channel TEXT NOT NULL,
        value BLOB NOT NULL,
        value_type TEXT NOT NULL DEFAULT 'json',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, write_index)
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

  #ensureColumn(table, column, definition) {
    const columns = this.#db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(current => current.name === column)) {
      this.#db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  async #getPendingWrites(threadId, checkpointNs, checkpointId) {
    const rows = this.#db
      .prepare(
        `SELECT task_id, channel, value, value_type
         FROM checkpoint_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY task_id, write_index`
      )
      .all(threadId, checkpointNs, checkpointId);

    return Promise.all(rows.map(async row => {
      return [
        row.task_id,
        row.channel,
        await this.serde.loadsTyped(row.value_type, row.value),
      ];
    }));
  }

  indexMessage(threadId, {id, role, content}) {
    if (!id || !content) {
      return;
    }

    const row = this.#db
      .prepare(`SELECT index_data FROM search_indexes WHERE thread_id = ?`)
      .get(threadId);

    const miniSearch = row ? deserializeIndex(row.index_data) : createIndex();
    if (miniSearch.has(id)) {
      return;
    }
    miniSearch.add({id, role, content});

    this.#db
      .prepare(
        `INSERT INTO search_indexes (thread_id, index_data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(thread_id)
         DO UPDATE SET index_data = excluded.index_data, updated_at = excluded.updated_at`
      )
      .run(threadId, serializeIndex(miniSearch), Date.now());
  }

  search(threadId, query, {excludeIds = []} = {}) {
    if (!query || !threadId) {
      return [];
    }

    const row = this.#db
      .prepare(`SELECT index_data FROM search_indexes WHERE thread_id = ?`)
      .get(threadId);

    if (!row) {
      return [];
    }

    const excluded = new Set(excludeIds.filter(Boolean));
    const miniSearch = deserializeIndex(row.index_data);

    return miniSearch.search(query, {
      fuzzy: 0.2,
      prefix: true,
    })
      .filter(result => !excluded.has(result.id))
      .slice(0, 3);
  }

  async getTuple(config) {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) {
      return undefined;
    }

    let row;
    if (checkpointId) {
      row = this.#db
        .prepare(
          `SELECT checkpoint_id, checkpoint, checkpoint_type, metadata, metadata_type, parent_checkpoint_id
           FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`
        )
        .get(threadId, checkpointNs, checkpointId);
    } else {
      row = this.#db
        .prepare(
          `SELECT checkpoint_id, checkpoint, checkpoint_type, metadata, metadata_type, parent_checkpoint_id
           FROM checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?
           ORDER BY updated_at DESC, checkpoint_id DESC
           LIMIT 1`
        )
        .get(threadId, checkpointNs);
    }

    if (!row) {
      return undefined;
    }

    const [checkpoint, metadata, pendingWrites] = await Promise.all([
      this.serde.loadsTyped(row.checkpoint_type, row.checkpoint),
      this.serde.loadsTyped(row.metadata_type, row.metadata),
      this.#getPendingWrites(threadId, checkpointNs, row.checkpoint_id),
    ]);

    const checkpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    };

    if (row.parent_checkpoint_id) {
      checkpointTuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.parent_checkpoint_id,
        },
      };
    }

    return checkpointTuple;
  }

  async put(config, checkpoint, metadata, _newVersions) {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = String(config.configurable?.checkpoint_ns ?? '');
    const parentCheckpointId = config.configurable?.checkpoint_id || null;

    if (!threadId) {
      throw new Error('Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.');
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const [
      [checkpointType, serializedCheckpoint],
      [metadataType, serializedMetadata],
    ] = await Promise.all([
      this.serde.dumpsTyped(preparedCheckpoint),
      this.serde.dumpsTyped(metadata),
    ]);
    const checkpointId = preparedCheckpoint.id;

    this.#db
      .prepare(
        `INSERT INTO checkpoints (
           thread_id, checkpoint_ns, checkpoint_id,
           checkpoint, checkpoint_type, metadata, metadata_type,
           parent_checkpoint_id, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id)
         DO UPDATE SET
           checkpoint = excluded.checkpoint,
           checkpoint_type = excluded.checkpoint_type,
           metadata = excluded.metadata,
           metadata_type = excluded.metadata_type,
           parent_checkpoint_id = excluded.parent_checkpoint_id,
           updated_at = excluded.updated_at`
      )
      .run(
        threadId,
        checkpointNs,
        checkpointId,
        serializedCheckpoint,
        checkpointType,
        serializedMetadata,
        metadataType,
        parentCheckpointId,
        Date.now()
      );

    const messages = preparedCheckpoint.channel_values?.messages ?? [];
    for (const message of messages) {
      const role = message._getType?.() ?? message.role ?? 'unknown';
      const content = typeof message.content === 'string' ?
        message.content :
        JSON.stringify(message.content);
      this.indexMessage(threadId, {
        id: message.id,
        role,
        content,
      });
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  async putWrites(config, writes, taskId) {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) {
      throw new Error('Failed to put writes. The passed RunnableConfig is missing a required "thread_id" field.');
    }
    if (!checkpointId) {
      throw new Error('Failed to put writes. The passed RunnableConfig is missing a required "checkpoint_id" field.');
    }

    for (const [index, [channel, value]] of writes.entries()) {
      const writeIndex = WRITES_IDX_MAP[channel] ?? index;
      const [valueType, serializedValue] = await this.serde.dumpsTyped(value);
      const values = [
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        writeIndex,
        channel,
        serializedValue,
        valueType,
      ];

      if (writeIndex >= 0) {
        this.#db
          .prepare(
            `INSERT OR IGNORE INTO checkpoint_writes (
               thread_id, checkpoint_ns, checkpoint_id, task_id,
               write_index, channel, value, value_type
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...values);
      } else {
        this.#db
          .prepare(
            `INSERT INTO checkpoint_writes (
               thread_id, checkpoint_ns, checkpoint_id, task_id,
               write_index, channel, value, value_type
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id, task_id, write_index)
             DO UPDATE SET
               channel = excluded.channel,
               value = excluded.value,
               value_type = excluded.value_type`
          )
          .run(...values);
      }
    }
  }

  async* list(config, options) {
    const {before, limit, filter} = options ?? {};
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns;

    let query = `
      SELECT
        thread_id, checkpoint_ns, checkpoint_id,
        checkpoint, checkpoint_type, metadata, metadata_type,
        parent_checkpoint_id
      FROM checkpoints
    `;
    const params = [];
    const conditions = [];

    if (threadId) {
      conditions.push('thread_id = ?');
      params.push(threadId);
    }
    if (checkpointNs !== undefined) {
      conditions.push('checkpoint_ns = ?');
      params.push(checkpointNs);
    }
    if (before?.configurable?.checkpoint_id) {
      conditions.push('checkpoint_id < ?');
      params.push(before.configurable.checkpoint_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY updated_at DESC, checkpoint_id DESC';

    if (limit !== undefined) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.#db.prepare(query).all(...params);

    for (const row of rows) {
      const [checkpoint, metadata, pendingWrites] = await Promise.all([
        this.serde.loadsTyped(row.checkpoint_type, row.checkpoint),
        this.serde.loadsTyped(row.metadata_type, row.metadata),
        this.#getPendingWrites(row.thread_id, row.checkpoint_ns, row.checkpoint_id),
      ]);

      if (filter && !Object.entries(filter).every(([key, value]) => metadata[key] === value)) {
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
        checkpoint,
        metadata,
        pendingWrites,
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

  async deleteThread(threadId) {
    this.#db.exec('BEGIN');
    try {
      this.#db.prepare(`DELETE FROM checkpoint_writes WHERE thread_id = ?`).run(threadId);
      this.#db.prepare(`DELETE FROM checkpoints WHERE thread_id = ?`).run(threadId);
      this.#db.prepare(`DELETE FROM search_indexes WHERE thread_id = ?`).run(threadId);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  clear() {
    this.#db.exec(`
      DELETE FROM checkpoint_writes;
      DELETE FROM checkpoints;
      DELETE FROM search_indexes;
    `);
  }
}
