import {MessagesAnnotation, StateGraph} from '@langchain/langgraph';
import {ToolNode, toolsCondition} from '@langchain/langgraph/prebuilt';
import {ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from '@langchain/core/prompts';

import {SchemaMemory} from './memory.js';

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
    this.memory = new SchemaMemory();
    this.model = model.bindTools(this.tools);
    this.agent = this._buildGraph();
  }

  _buildGraph() {
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
    const toolNode = new ToolNode(this.tools);

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', callModel)
      .addNode('tools', toolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges(
        'agent',
        toolsCondition
      )
      .addEdge('tools', 'agent');

    return workflow.compile({
      checkpointer: this.memory,
    });
  }

  async execute(input, config = {}, options = {recursionLimit: 7}) {
    return this.agent.invoke({
      messages: [{
        role: 'user', content: input.input
      }],
      config,
    }, options);
  }
}
