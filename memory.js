import {BaseCheckpointSaver} from '@langchain/langgraph-checkpoint';

export class SchemaMemory extends BaseCheckpointSaver {
  #storage = new Map();
  #writes = new Map();

  constructor() {
    super();
  }

  async getTuple(config) {
    const thread_id = config.configurable?.thread_id;
    const checkpoint = this.#storage.get(thread_id);
    if (!checkpoint) {
      return;
    }

    return {
      config,
      checkpoint,
      metadata: {},
      parentConfig: undefined,
    };
  }

  // todo - в качестве идеи - сохранять контекст согласно спецификации Schema.org/Action
  async put(config, checkpoint, metadata) {
    const threadId = config.configurable?.thread_id;
    this.#storage.set(threadId, checkpoint);
    return {...config};
  }

  async putWrites(config, writes, taskId) {
    const thread_id = config.configurable?.thread_id;
    if (!this.#writes.has(thread_id)) {
      this.#writes.set(thread_id, []);
    }
    this.#writes.get(thread_id).push({taskId, writes});
  }

  async* list(config, options) {
    for (const [thread_id, checkpoint] of this.#storage.entries()) {
      yield {
        config: {
          configurable: {thread_id},
        },
        checkpoint,
        metadata: {},
      };
    }
  }

  clear() {
    this.#storage.clear();
    this.#writes.clear();
  }
}
