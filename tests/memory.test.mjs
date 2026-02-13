import assert from 'node:assert';
import {describe, test, beforeEach, afterEach} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {SchemaMemory} from '../memory.js';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';

describe('SchemaMemory SQLite Implementation', () => {
  const testDbPath = path.join(os.tmpdir(), 'test-schema-memory.sqlite');

  beforeEach(() => {
    // Clean up before each test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should create database and table on initialization', () => {
    const memory = new SchemaMemory(testDbPath);
    assert.ok(fs.existsSync(testDbPath), 'Database file should be created');
  });

  test('should save and retrieve a checkpoint', async () => {
    const memory = new SchemaMemory(testDbPath);
    const config = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
      },
    };

    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = {test: 'value1'};
    const metadata = {source: 'test'};

    const putResult = await memory.put(config, checkpoint, metadata);
    assert.ok(putResult.configurable.checkpoint_id, 'Should return checkpoint_id');

    const retrievedTuple = await memory.getTuple({
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_id: putResult.configurable.checkpoint_id,
      },
    });

    assert.ok(retrievedTuple, 'Should retrieve checkpoint');
    assert.strictEqual(retrievedTuple.checkpoint.channel_values.test, 'value1');
    assert.strictEqual(retrievedTuple.metadata.source, 'test');
  });

  test('should retrieve latest checkpoint without checkpoint_id', async () => {
    const memory = new SchemaMemory(testDbPath);
    const config = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
      },
    };

    const checkpoint1 = emptyCheckpoint();
    checkpoint1.channel_values = {test: 'value1'};
    await memory.put(config, checkpoint1, {});

    const checkpoint2 = emptyCheckpoint();
    checkpoint2.channel_values = {test: 'value2'};
    await memory.put(config, checkpoint2, {});

    const latestTuple = await memory.getTuple(config);
    assert.ok(latestTuple, 'Should retrieve latest checkpoint');
    assert.strictEqual(latestTuple.checkpoint.channel_values.test, 'value2');
  });

  test('should list all checkpoints for a thread', async () => {
    const memory = new SchemaMemory(testDbPath);
    const config = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
      },
    };

    const checkpoint1 = emptyCheckpoint();
    checkpoint1.channel_values = {test: 'value1'};
    await memory.put(config, checkpoint1, {});

    const checkpoint2 = emptyCheckpoint();
    checkpoint2.channel_values = {test: 'value2'};
    await memory.put(config, checkpoint2, {});

    let count = 0;
    for await (const tuple of memory.list(config)) {
      count++;
      assert.ok(tuple.config.configurable.thread_id === 'test-thread-1');
    }

    assert.strictEqual(count, 2, 'Should list 2 checkpoints');
  });

  test('should support checkpoint namespaces', async () => {
    const memory = new SchemaMemory(testDbPath);
    const config1 = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: 'namespace1',
      },
    };
    const config2 = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: 'namespace2',
      },
    };

    const checkpoint1 = emptyCheckpoint();
    checkpoint1.channel_values = {namespace: 'ns1'};
    await memory.put(config1, checkpoint1, {});

    const checkpoint2 = emptyCheckpoint();
    checkpoint2.channel_values = {namespace: 'ns2'};
    await memory.put(config2, checkpoint2, {});

    const retrieved1 = await memory.getTuple(config1);
    const retrieved2 = await memory.getTuple(config2);

    assert.strictEqual(retrieved1.checkpoint.channel_values.namespace, 'ns1');
    assert.strictEqual(retrieved2.checkpoint.channel_values.namespace, 'ns2');
  });

  test('should clear all checkpoints', async () => {
    const memory = new SchemaMemory(testDbPath);
    const config = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
      },
    };

    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = {test: 'value1'};
    await memory.put(config, checkpoint, {});

    memory.clear();

    const afterClear = await memory.getTuple(config);
    assert.strictEqual(afterClear, undefined, 'Should return undefined after clear');
  });

  test('should persist data across instances (restart simulation)', async () => {
    // Create first instance and save data
    const memory1 = new SchemaMemory(testDbPath);
    const config = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
      },
    };

    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = {persisted: 'value'};
    const metadata = {source: 'persistence-test'};

    const putResult = await memory1.put(config, checkpoint, metadata);

    // Create new instance to simulate restart
    const memory2 = new SchemaMemory(testDbPath);

    const retrievedTuple = await memory2.getTuple({
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_id: putResult.configurable.checkpoint_id,
      },
    });

    assert.ok(retrievedTuple, 'Data should persist across instances');
    assert.strictEqual(retrievedTuple.checkpoint.channel_values.persisted, 'value');
    assert.strictEqual(retrievedTuple.metadata.source, 'persistence-test');
  });

  test('should handle parent checkpoint references', async () => {
    const memory = new SchemaMemory(testDbPath);
    
    // First checkpoint
    const config1 = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
      },
    };
    const checkpoint1 = emptyCheckpoint();
    checkpoint1.channel_values = {step: 1};
    const result1 = await memory.put(config1, checkpoint1, {});

    // Second checkpoint with parent
    const config2 = {
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_ns: '',
        checkpoint_id: result1.configurable.checkpoint_id,
      },
    };
    const checkpoint2 = emptyCheckpoint();
    checkpoint2.channel_values = {step: 2};
    const result2 = await memory.put(config2, checkpoint2, {});

    const retrieved = await memory.getTuple({
      configurable: {
        thread_id: 'test-thread-1',
        checkpoint_id: result2.configurable.checkpoint_id,
      },
    });

    assert.ok(retrieved.parentConfig, 'Should have parent config');
    assert.strictEqual(retrieved.parentConfig.configurable.checkpoint_id, result1.configurable.checkpoint_id);
  });
});
