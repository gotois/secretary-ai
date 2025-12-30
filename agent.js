import {MessagesAnnotation, Command, Annotation, StateGraph} from '@langchain/langgraph';
import {AIMessage} from '@langchain/core/messages';
import {ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from '@langchain/core/prompts';
import {ToolNode, toolsCondition} from '@langchain/langgraph/prebuilt';

import {SchemaMemory} from './memory.js';

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  artifact: Annotation({
    default: () => null,
  }),
});

export default class AgentService {
  constructor(model, tools, systemPrompt) {
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
      checkpointer: new SchemaMemory(),
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
      })

      return {messages: [response]};
    };

    const customToolNode = async (state) => {
      const tNode = new ToolNode(this.tools, {
        handleToolErrors: true,
      });
      return await tNode.invoke(state);
    }

    const postToolNode = async (state) => {
      const lastToolMessage = state.messages[state.messages.length - 1];
      const contentText = lastToolMessage?.content || 'Инструмент не вернул данных';

      const isError = lastToolMessage?.additional_kwargs?.is_error ||
        lastToolMessage?.content?.includes("Error") ||
        lastToolMessage?.status === "error";

      return new Command({
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: contentText,
            }),
          ],
          artifact: lastToolMessage?.artifact || {},
        },
        goto: isError ? 'rollback' : '__end__',
      });
    }

    return new StateGraph(AgentState)
      .addNode('agent', callModel)
      .addNode('tools', customToolNode)
      .addNode('postTool', postToolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', toolsCondition)
      .addEdge('tools', 'postTool')

    return workflow.compile({
      checkpointer: this.memory,
    });
  }

  async execute(input, config = {}, options = {recursionLimit: 7}) {
    return this.agent.invoke({
      messages: [{
        role: 'user',
        content: input.input,
      }],
      config,
    }, options);
  }
}
