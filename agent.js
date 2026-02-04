import {MessagesAnnotation, Command, Annotation, StateGraph} from '@langchain/langgraph';
import {AIMessage, HumanMessage, RemoveMessage} from '@langchain/core/messages';
import {ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from '@langchain/core/prompts';
import {ToolNode, toolsCondition} from '@langchain/langgraph/prebuilt';
import debug from 'debug';

import {SchemaMemory} from './memory.js';

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  artifact: Annotation({
    default: () => null,
  }),
});

export default class AgentService {
  constructor(model, tools, systemPrompt, db) {
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
    this.agent = this.#buildGraph().compile({
      checkpointer: new SchemaMemory(db),
    });
  }

  #buildGraph() {
    const callModel = async (state) => {
      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(this.systemPrompt),
        new MessagesPlaceholder('messages'),
      ]);
      const chain = prompt.pipe(this.model);

      const response = await chain.invoke({
        messages: state.messages,
      });

      debug.log('MODEL RESPONSE RAW ->', response);

      return {
        messages: [response],
      };
    };

    const customToolNode = async (state) => {
      debug.log('TOOLS NODE: messages before tool invocation ->', state.messages);

      const tNode = new ToolNode(this.tools, {
        handleToolErrors: true,
      });

      const result = await tNode.invoke(state);
      debug.log('TOOLS NODE: result after invocation ->', result);

      return result;
    }

    const postToolNode = async (state) => {
      const lastToolMessage = state.messages[state.messages.length - 1];

      const isError = lastToolMessage?.additional_kwargs?.isError ||
        lastToolMessage?.status === 'error';

      if (isError) {
        return new Command({
          update: {
            messages: [
              ...state.messages,
              new AIMessage({
                content: lastToolMessage?.content || 'Инструмент не вернул данных',
                invalid_tool_calls: [
                  {
                    name: lastToolMessage.name,
                    args: '', // todo - здесь параметры приведшие к ошибке
                    id: lastToolMessage.id,
                    error: lastToolMessage.content ?? 'Произошла ошибка',
                  },
                ],
              }),
            ],
            artifact: lastToolMessage?.artifact || {},
          },
          goto: 'rollback',
        });
      }

      if (!lastToolMessage?.content) {
        return new Command({
          update: {
            messages: [
              new AIMessage({
                content: 'Инструмент не вернул данных',
                invalid_tool_calls: [],
              }),
            ],
            artifact: lastToolMessage?.artifact || {},
          },
          goto: '__end__',
        });
      }

       return new Command({
         update: {
          artifact: lastToolMessage?.artifact || {},
         },
         goto: 'agent',
       });
    }

    const rollbackNode = async (state) => {
      debug.log('ОШИБКА: Запуск отката транзакций...', state);
      const lastToolMessage = state.messages[state.messages.length - 1];
      return {
        undoStack: [],
        messages: [
          new AIMessage({
            content: lastToolMessage.content || 'Произошла техническая ошибка.'
          }),
        ],
        artifact: null,
      };
    };

    return new StateGraph(AgentState)
      .addNode('agent', callModel)
      .addNode('tools', customToolNode)
      .addNode('postTool', postToolNode)
      .addNode('rollback', rollbackNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', toolsCondition)
      .addEdge('tools', 'postTool')
      .addEdge('rollback', '__end__');
  }

  async clearState({ configurable }) {
    const currentState = await this.agent.getState({ configurable });
    const messages = currentState.values.messages;

    if (messages?.length === 0) {
      return;
    }
    const deletions = messages.map((m) => new RemoveMessage({
      id: m.id,
    }));

    await this.agent.updateState({
      configurable,
    }, {
      messages: deletions,
      artifact: null,
    });
  }

  async execute(state, options = {}) {
    return this.agent.invoke({
      messages: [
        new HumanMessage(state.input),
      ],
    }, {
      ...options,
    });
  }
}
