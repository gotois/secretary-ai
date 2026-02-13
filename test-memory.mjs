import {SchemaMemory} from './memory.js';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';
import fs from 'node:fs';

const testDbPath = '/tmp/test-memory.sqlite';

// Clean up any existing test database
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log('Testing SchemaMemory with SQLite...\n');

// Create instance
const memory = new SchemaMemory(testDbPath);
console.log('✓ SchemaMemory instance created');

// Test 1: Put a checkpoint
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
console.log('✓ Checkpoint saved:', putResult.configurable.checkpoint_id);

// Test 2: Get the checkpoint back
const retrievedTuple = await memory.getTuple({
  configurable: {
    thread_id: 'test-thread-1',
    checkpoint_id: putResult.configurable.checkpoint_id,
  },
});

if (retrievedTuple && retrievedTuple.checkpoint.channel_values.test === 'value1') {
  console.log('✓ Checkpoint retrieved successfully');
} else {
  console.error('✗ Failed to retrieve checkpoint');
  process.exit(1);
}

// Test 3: List checkpoints
let count = 0;
for await (const tuple of memory.list(config)) {
  count++;
  console.log(`✓ Listed checkpoint: ${tuple.config.configurable.checkpoint_id}`);
}
if (count === 1) {
  console.log('✓ List returned correct number of checkpoints');
} else {
  console.error('✗ List returned wrong number of checkpoints');
  process.exit(1);
}

// Test 4: Put another checkpoint for same thread
const checkpoint2 = emptyCheckpoint();
checkpoint2.channel_values = {test: 'value2'};
const putResult2 = await memory.put(config, checkpoint2, metadata);
console.log('✓ Second checkpoint saved:', putResult2.configurable.checkpoint_id);

// Test 5: Get latest checkpoint without specifying ID
const latestTuple = await memory.getTuple(config);
if (latestTuple && latestTuple.checkpoint.channel_values.test === 'value2') {
  console.log('✓ Latest checkpoint retrieved successfully');
} else {
  console.error('✗ Failed to retrieve latest checkpoint');
  process.exit(1);
}

// Test 6: Clear all checkpoints
memory.clear();
console.log('✓ Checkpoints cleared');

// Test 7: Verify cleared
const afterClear = await memory.getTuple(config);
if (!afterClear) {
  console.log('✓ Verified checkpoints are cleared');
} else {
  console.error('✗ Checkpoints still exist after clear');
  process.exit(1);
}

console.log('\n✓ All tests passed!');

// Cleanup
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
