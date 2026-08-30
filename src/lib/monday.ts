import fs from 'fs';
import path from 'path';

export async function executeMondayQuery(query: string, variables?: any) {
  const apiKey = process.env.MONDAY_API_KEY;
  if (apiKey === 'mock') {
    throw new Error('Using mock data - executeMondayQuery should not be called');
  }
  if (!apiKey) {
    throw new Error('MONDAY_API_KEY is not set');
  }

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
      'API-Version': '2023-10',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
    cache: 'no-store', // No caching as per decision log
  });

  if (!response.ok) {
    throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export interface MondayColumnValue {
  id: string;
  text: string;
  value?: string;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

export async function fetchAllBoardItems(boardId: string): Promise<MondayItem[]> {
  const apiKey = process.env.MONDAY_API_KEY;
  if (apiKey === 'mock') {
    const isDeals = boardId === (process.env.MONDAY_BOARD_ID_DEALS || 'mock_deals_id');
    const filename = isDeals ? 'mock_deals.json' : 'mock_work_orders.json';
    const filePath = path.join(process.cwd(), 'data', filename);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data.items;
    }
    throw new Error(`Mock file not found: ${filePath}`);
  }
  if (!apiKey) {
    throw new Error('MONDAY_API_KEY is missing. Must provide key or set to "mock"');
  }

  const query = `
    query($boardId: [ID!], $cursor: String) {
      boards(ids: $boardId) {
        items_page(limit: 500, cursor: $cursor) {
          cursor
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  let allItems: MondayItem[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  let attempts = 0;

  while (hasMore && attempts < 10) { // Safety limit
    attempts++;
    const data = await executeMondayQuery(query, { boardId: [boardId], cursor });
    
    const board = data.data.boards[0];
    if (!board) {
      throw new Error(`Board not found: ${boardId}`);
    }

    const itemsPage = board.items_page;
    allItems = allItems.concat(itemsPage.items);
    
    if (itemsPage.cursor) {
      cursor = itemsPage.cursor;
    } else {
      hasMore = false;
    }
  }

  return allItems;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export async function getBoardSchema(boardId: string): Promise<MondayColumn[]> {
  const apiKey = process.env.MONDAY_API_KEY;
  if (apiKey === 'mock') {
    const isDeals = boardId === (process.env.MONDAY_BOARD_ID_DEALS || 'mock_deals_id');
    const filename = isDeals ? 'mock_deals.json' : 'mock_work_orders.json';
    const filePath = path.join(process.cwd(), 'data', filename);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data.columns;
    }
    throw new Error(`Mock file not found: ${filePath}`);
  }
  if (!apiKey) {
    throw new Error('MONDAY_API_KEY is missing. Must provide key or set to "mock"');
  }

  const query = `
    query($boardId: [ID!]) {
      boards(ids: $boardId) {
        columns {
          id
          title
          type
        }
      }
    }
  `;
  
  const data = await executeMondayQuery(query, { boardId: [boardId] });
  const board = data.data.boards[0];
  if (!board) {
    throw new Error(`Board not found: ${boardId}`);
  }
  
  return board.columns;
}

