import {MessagesAnnotation, Command, Annotation, StateGraph} from '@langchain/langgraph';
import {AIMessage, HumanMessage, ToolMessage} from '@langchain/core/messages';
import {ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from '@langchain/core/prompts';
import {ToolNode, toolsCondition} from '@langchain/langgraph/prebuilt';
import createDebug from 'debug';

import {SchemaMemory} from './memory.js';

const log = createDebug('secretary-ai:agent');

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  artifact: Annotation({
    default: () => [],
  }),
  thread_id: Annotation({
    default: () => null,
  }),
});

export default class AgentService {
  constructor(model, tools, systemPrompt, memoryOrDb) {
    if (!model) {
      throw new Error('Model is not defined');
    }
    if (!systemPrompt) {
      throw new Error('Empty system prompt');
    }
    if (!(Array.isArray(tools) && tools.length)) {
      throw new Error('Tools is not defined');
    }
    this.tools = tools;
    this.systemPrompt = systemPrompt;
    this.model = model.bindTools(this.tools);
    this.memory = memoryOrDb instanceof SchemaMemory ?
      memoryOrDb :
      new SchemaMemory(memoryOrDb);
    this.agent = this.#buildGraph(this.memory).compile({
      checkpointer: this.memory,
    });
  }

  #buildGraph(memory) {
    const toolNode = new ToolNode(this.tools, {
      handleToolErrors: true,
    });

    const callModel = async ({messages, thread_id}) => {
      let historyContext = '';
      if (thread_id) {
        const lastHuman = [...messages].reverse().find(message => message instanceof HumanMessage);
        if (lastHuman) {
          const query = typeof lastHuman.content === 'string' ?
            lastHuman.content :
            JSON.stringify(lastHuman.content);
          const results = memory.search(thread_id, query, {
            excludeIds: [lastHuman.id],
          });
          if (results.length > 0) {
            const lines = results.map(result => `[${result.role}]: ${result.content}`).join('\n');
            historyContext = `\n## Контекст из истории:\n${lines}`;
          }
        }
      }

      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(this.systemPrompt + historyContext),
        new MessagesPlaceholder('messages'),
      ]);
      const response = await prompt.pipe(this.model).invoke({
        messages,
      });

      log('Model returned a response with %d tool calls', response.tool_calls?.length ?? 0);

      return {
        messages: [response],
      };
    };

    const runTools = async state => {
      const lastMessage = state.messages[state.messages.length - 1];
      log('Invoking %d tool calls', lastMessage?.tool_calls?.length ?? 0);
      return toolNode.invoke(state);
    };

    const postToolNode = async ({messages}) => {
      const toolMessages = [];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (!(message instanceof ToolMessage)) {
          break;
        }
        toolMessages.unshift(message);
      }

      const artifact = toolMessages.flatMap(message => {
        if (message.artifact === undefined || message.artifact === null) {
          return [];
        }
        return Array.isArray(message.artifact) ? message.artifact : [message.artifact];
      });
      const hasError = toolMessages.some(message => message.status === 'error');
      const hasContent = toolMessages.some(message => {
        return typeof message.content === 'string' ?
          Boolean(message.content) :
          message.content.length > 0;
      });

      if (hasError || !hasContent) {
        return new Command({
          update: {
            artifact,
          },
          goto: 'rollback',
        });
      }

      return new Command({
        update: {
          artifact,
        },
        goto: 'agent',
      });
    };

    const rollbackNode = () => {
      return {
        messages: [
          new AIMessage({
            content: 'Произошла ошибка. Попробуйте ещё раз.',
          }),
        ],
      };
    };

    return new StateGraph(AgentState)
      .addNode('agent', callModel)
      .addNode('tools', runTools)
      .addNode('postTool', postToolNode)
      .addNode('rollback', rollbackNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', toolsCondition)
      .addEdge('tools', 'postTool')
      .addEdge('rollback', '__end__');
  }

  async clear(threadId) {
    await this.memory.deleteThread(threadId);
  }

  async execute(state, options = {}) {
    return this.agent.invoke({
      messages: [
        new HumanMessage(state.input),
      ],
      artifact: [],
      thread_id: options.configurable?.thread_id ?? null,
    }, {
      ...options,
    });
  }
}
