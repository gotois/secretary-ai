import {MessagesAnnotation, Command, Annotation, StateGraph} from '@langchain/langgraph';
import {AIMessage, HumanMessage, RemoveMessage, ToolMessage} from '@langchain/core/messages';
import {ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from '@langchain/core/prompts';
import {ToolNode, toolsCondition} from '@langchain/langgraph/prebuilt';
import debug from 'debug';

import {SchemaMemory} from './memory.js';

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  artifact: Annotation({
    default: () => [],
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
    const callModel = async ({ messages }) => {
      let prompt;

      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];
      if (firstMessage instanceof HumanMessage && lastMessage instanceof ToolMessage) {
        const template = `Сформируй итоговый ответ для пользователя:\n${lastMessage.content}`;
        prompt = ChatPromptTemplate.fromMessages([
          SystemMessagePromptTemplate.fromTemplate(template),
          new MessagesPlaceholder('messages'),
        ]);
      } else {
        prompt = ChatPromptTemplate.fromMessages([
          SystemMessagePromptTemplate.fromTemplate(this.systemPrompt),
          new MessagesPlaceholder('messages'),
        ]);
      }

      const chain = prompt.pipe(this.model);

      const response = await chain.invoke({
        messages,
      });

      debug.log('MODEL RESPONSE RAW ->', response);

      return {
        messages: [response],
      };
    };

    const customToolNode = async (state) => {
      debug.log('TOOLS NODE: messages before tool invocation ->', state);

      // if (response.tool_calls.length === 0) {
      //   debug.log('TOOLS NODE: skipping tool invocation.');
      //   return state;
      // }

      const tNode = new ToolNode(this.tools, {
        handleToolErrors: true,
      });

      const result = await tNode.invoke(state);
      debug.log('TOOLS NODE: result after invocation ->', result);

      return result;
    }

    const postToolNode = async ({ messages }) => {
      const lastToolMessage = messages[messages.length - 1];

      const isError = lastToolMessage?.additional_kwargs?.isError ||
        lastToolMessage?.status === 'error';

      if (isError) {
        return new Command({
          update: {
            messages: [
              ...messages,
              new AIMessage({
                content: lastToolMessage?.content || 'Инструмент не вернул данных',
                invalid_tool_calls: lastToolMessage ? [
                  {
                    name: lastToolMessage.name,
                    args: '', // todo - здесь параметры приведшие к ошибке
                    id: lastToolMessage.id,
                    error: lastToolMessage.content ?? 'Произошла ошибка',
                  },
                ] : [],
              }),
            ],
            artifact: lastToolMessage?.artifact || [],
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
            artifact: lastToolMessage?.artifact || [],
          },
          goto: '__end__',
        });
      }

      return new Command({
        update: {
          artifact: lastToolMessage?.artifact || [],
        },
        goto: 'agent',
      });
    }

    return new StateGraph(AgentState)
      .addNode('agent', callModel)
      .addNode('tools', customToolNode)
      .addNode('postTool', postToolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', toolsCondition)
      .addEdge('tools', 'postTool');
  }

  async clearState({ configurable }) {
    debug.log('CLEAR STATE');
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
      artifact: [],
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
