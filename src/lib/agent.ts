import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { fetchAndProcessData } from './data-pipeline';
import { SYSTEM_PROMPT } from './prompts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const queryDataTool: FunctionDeclaration = {
  name: 'query_monday_data',
  description: 'Fetches and optionally filters live data from Monday.com Deals and Work Orders. Use this to get data to answer user queries.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      dataset: {
        type: SchemaType.STRING,
        description: 'Which dataset to query: "deals", "workOrders", or "both"',
      },
      filterField: {
        type: SchemaType.STRING,
        description: 'Optional field to filter by (e.g. "Sector/service", "Deal Status", "Execution Status")',
      },
      filterValue: {
        type: SchemaType.STRING,
        description: 'Value to match for the filter (case-insensitive)',
      }
    },
    required: ['dataset'],
  },
};

export async function chatWithAgent(messages: { role: string; content: string }[]) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: [queryDataTool] }],
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
  
  // Gemini requires the first message in history to be from 'user'
  while (history.length > 0 && history[0].role === 'model') {
    history.shift();
  }
  
  const lastMessage = messages[messages.length - 1].content;

  const chat = model.startChat({ history });

  let result = await chat.sendMessage(lastMessage);
  let response = result.response;
  
  // Handle function calls
  let functionCalls = response.functionCalls();
  let callsCount = 0;
  
  while (functionCalls && functionCalls.length > 0 && callsCount < 3) {
    callsCount++;
    const call = functionCalls[0];
    
    if (call.name === 'query_monday_data') {
      const args = call.args as any;
      
      try {
        const fullData = await fetchAndProcessData();
        let resultData: any = { metadata: fullData.metadata };
        
        // Apply basic filtering if requested
        let deals = fullData.deals;
        let wos = fullData.workOrders;
        
        if (args.filterField && args.filterValue) {
          const field = args.filterField;
          const val = String(args.filterValue).toLowerCase();
          deals = deals.filter(d => String(d[field] || '').toLowerCase().includes(val));
          wos = wos.filter(w => String(w[field] || '').toLowerCase().includes(val));
        }

        if (args.dataset === 'deals') resultData.deals = deals;
        else if (args.dataset === 'workOrders') resultData.workOrders = wos;
        else {
          resultData.deals = deals;
          resultData.workOrders = wos;
        }

        // Send tool response back to model as text to bypass role issues
        const jsonStr = JSON.stringify(resultData);
        result = await chat.sendMessage(`Data retrieved from ${call.name}: ${jsonStr}`);
        response = result.response;
        functionCalls = response.functionCalls();
        
      } catch (err: any) {
        // Send error back to model as text
        result = await chat.sendMessage(`Error calling ${call.name}: ${err.message}`);
        response = result.response;
        functionCalls = response.functionCalls();
      }
    } else {
      break;
    }
  }

  return response.text();
}
