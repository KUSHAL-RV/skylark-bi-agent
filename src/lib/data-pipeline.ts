import { fetchAllBoardItems, getBoardSchema, MondayItem, MondayColumn } from './monday';

export interface ParsedQuantity {
  value: number | null;
  unit: string | null;
  raw: string;
}

export interface ProcessedData {
  deals: Record<string, any>[];
  workOrders: Record<string, any>[];
  rollups: any;
  metadata: {
    dealsCount: number;
    workOrdersCount: number;
    orphanedWorkOrdersCount: number;
    orphanedWorkOrderNames: string[];
    dataQualityNotes: string[];
    isMock: boolean;
  };
}

function mapItemToObject(item: MondayItem, schema: MondayColumn[]): Record<string, any> {
  const obj: Record<string, any> = {
    id: item.id,
    name: item.name,
  };
  
  for (const col of item.column_values) {
    const schemaCol = schema.find(c => c.id === col.id);
    if (schemaCol) {
      let val = col.text;
      if (val === null || val === undefined) {
        try {
          val = col.value ? JSON.parse(col.value) : null;
        } catch {
          val = col.value;
        }
      }
      // Trim titles to prevent trailing space mismatches (e.g. "Deal Stage ")
      obj[schemaCol.title.trim()] = val;
    }
  }
  
  return obj;
}

function parseQuantity(raw: string): ParsedQuantity {
  if (!raw) return { value: null, unit: null, raw: '' };
  
  const str = String(raw).trim();
  
  // Extract number at start (including decimals/commas)
  const match = str.match(/^([\d,\.]+)\s*(.*)$/i);
  if (!match) {
    return { value: null, unit: null, raw: str };
  }
  
  let valStr = match[1].replace(/,/g, '');
  let value = parseFloat(valStr);
  if (isNaN(value)) {
    return { value: null, unit: null, raw: str };
  }
  
  let unitStr = match[2].trim().toLowerCase();
  
  // Normalize units
  let unit = unitStr;
  if (['ha', 'hectares'].includes(unitStr)) unit = 'Hectares';
  else if (['acr', 'acres', 'acers'].includes(unitStr)) unit = 'Acres';
  else if (['km'].includes(unitStr)) unit = 'KM';
  else if (['rkm'].includes(unitStr)) unit = 'RKM';
  else if (['mw'].includes(unitStr)) unit = 'MW';
  else if (['towers', 'tower'].includes(unitStr)) unit = 'Towers';
  else if (['pillars', 'pillar'].includes(unitStr)) unit = 'Pillars';
  else if (['mines', 'mine'].includes(unitStr)) unit = 'Mines';
  else if (['months', 'month'].includes(unitStr)) unit = 'Months';
  else if (['days', 'day'].includes(unitStr)) unit = 'Days';
  else if (['rooftops', 'rooftop'].includes(unitStr)) unit = 'Rooftops';
  else if (['images', 'image'].includes(unitStr)) unit = 'Images';
  else if (unitStr === '') unit = 'Units'; // default numeric only
  
  return { value, unit, raw: str };
}

export async function fetchAndProcessData(): Promise<ProcessedData> {
  const isMock = process.env.MONDAY_API_KEY === 'mock';
  
  // Use dummy IDs in mock mode if they are missing
  const dealsBoardId = process.env.MONDAY_BOARD_ID_DEALS || (isMock ? 'mock_deals_id' : '');
  const woBoardId = process.env.MONDAY_BOARD_ID_WORK_ORDERS || (isMock ? 'mock_wo_id' : '');

  if (!isMock && (!dealsBoardId || !woBoardId)) {
    throw new Error('MONDAY_BOARD_ID_DEALS and MONDAY_BOARD_ID_WORK_ORDERS must be set in live mode.');
  }

  // 1. Fetch raw data
  const [dealsSchema, woSchema, rawDeals, rawWOs] = await Promise.all([
    getBoardSchema(dealsBoardId),
    getBoardSchema(woBoardId),
    fetchAllBoardItems(dealsBoardId),
    fetchAllBoardItems(woBoardId)
  ]);

  // 2. Map to objects
  let deals = rawDeals.map(item => mapItemToObject(item, dealsSchema));
  let workOrders = rawWOs.map(item => mapItemToObject(item, woSchema));

  const dataQualityNotes: string[] = [];

  // 3. Clean Deals
  const initialDealsCount = deals.length;
  deals = deals.filter(deal => {
    // Content-based header leak strip (robust to casing and trailing spaces)
    const stageStr = String(deal['Deal Stage'] || '').trim().toLowerCase();
    const statusStr = String(deal['Deal Status'] || '').trim().toLowerCase();
    if (stageStr === 'deal stage' || statusStr === 'deal status') {
      return false;
    }
    return true;
  });
  if (initialDealsCount - deals.length > 0) {
    dataQualityNotes.push(`Filtered ${initialDealsCount - deals.length} header-leak rows from Deals.`);
  }

  // 4. Clean Work Orders
  const initialWOsCount = workOrders.length;
  workOrders = workOrders.filter(wo => {
    // If multiple columns have values matching their column name, it's a header row
    // Let's just check one key column like "Execution Status" or "Sector"
    const execStatus = String(wo['Execution Status'] || '').trim();
    if (execStatus === 'Execution Status') {
      return false;
    }
    return true;
  });
  if (initialWOsCount - workOrders.length > 0) {
    dataQualityNotes.push(`Filtered ${initialWOsCount - workOrders.length} embedded header rows from Work Orders.`);
  }

  // 5. Normalize and enrich
  deals.forEach(deal => {
    // Deal Value Parsing (strips currency symbols and commas)
    const rawVal = String(deal['Deal Value'] || deal['Masked Deal value'] || '').replace(/[,₹$£€\s]/g, '');
    deal.parsedDealValue = parseFloat(rawVal) || 0;
  });

  const orphanedWO: string[] = [];

  workOrders.forEach(wo => {
    // Parse quantity
    const rawQty = String(wo['Quantities as per PO'] || '');
    wo.parsedQuantity = parseQuantity(rawQty);

    // Normalize Billing Status typos
    if (wo['Billing Status'] === 'BIlled') {
      wo['Billing Status'] = 'Billed';
    }
    
    // Normalize amounts (example: Amount in Rupees (Excl of GST) (Masked))
    const amountCol = Object.keys(wo).find(k => k.includes('Amount in Rupees') && k.includes('Excl'));
    if (amountCol && wo[amountCol]) {
      // Billed Amount Parsing (strips currency symbols and commas)
      const rawBilled = String(wo[amountCol] || '').replace(/[,₹$£€\s]/g, '');
      wo.parsedAmount = parseFloat(rawBilled) || 0;
    }

    // Join with Deals
    // In Work Orders, the primary column is likely "Deal name masked".
    // Let's use `wo.name` to match `deal.name` (or whatever the primary column is named)
    // Actually, it's safer to use `name` since Monday always maps the first column to `name`.
    const dealName = wo.name;
    const matchingDeal = deals.find(d => d.name === dealName);
    
    if (matchingDeal) {
      wo.matchedDeal = {
        status: matchingDeal['Deal Status'],
        stage: matchingDeal['Deal Stage'],
        sector: matchingDeal['Sector/service'],
        value: matchingDeal.parsedDealValue
      };
    } else {
      wo.matchedDeal = null;
      if (dealName) orphanedWO.push(dealName);
    }
  });

  // Unique orphaned WOs
  const uniqueOrphans = Array.from(new Set(orphanedWO));
  if (uniqueOrphans.length > 0) {
    dataQualityNotes.push(`${uniqueOrphans.length} Work Orders have no matching Deal (Orphaned). Note: Cross-board queries rely on Deal Name, which is not 100% matched.`);
  }
  
  dataQualityNotes.push(`Note: Client codes do not overlap across boards. Cross-board analysis must be Deal-based.`);

  // 6. Pre-compute standard rollups to avoid LLM math errors
  const rollups = {
    dealsBySector: {} as Record<string, { count: number; totalValue: number }>,
    dealsByStage: {} as Record<string, { count: number; totalValue: number }>,
    dealsByStatus: {} as Record<string, { count: number; totalValue: number }>,
    workOrdersBySector: {} as Record<string, { count: number; totalBilled: number }>,
    workOrdersByExecutionStatus: {} as Record<string, { count: number }>
  };

  deals.forEach(d => {
    const sector = d['Sector/service'] || 'Unknown';
    const stage = d['Deal Stage'] || 'Unknown';
    const status = d['Deal Status'] || 'Unknown';
    const val = d.parsedDealValue || 0;

    if (!rollups.dealsBySector[sector]) rollups.dealsBySector[sector] = { count: 0, totalValue: 0 };
    rollups.dealsBySector[sector].count++;
    rollups.dealsBySector[sector].totalValue += val;

    if (!rollups.dealsByStage[stage]) rollups.dealsByStage[stage] = { count: 0, totalValue: 0 };
    rollups.dealsByStage[stage].count++;
    rollups.dealsByStage[stage].totalValue += val;

    if (!rollups.dealsByStatus[status]) rollups.dealsByStatus[status] = { count: 0, totalValue: 0 };
    rollups.dealsByStatus[status].count++;
    rollups.dealsByStatus[status].totalValue += val;
  });

  workOrders.forEach(w => {
    const sector = w['Sector'] || (w.matchedDeal ? w.matchedDeal.sector : 'Unknown');
    const execStatus = w['Execution Status'] || 'Unknown';
    const billed = w.parsedAmount || 0;

    if (!rollups.workOrdersBySector[sector]) rollups.workOrdersBySector[sector] = { count: 0, totalBilled: 0 };
    rollups.workOrdersBySector[sector].count++;
    rollups.workOrdersBySector[sector].totalBilled += billed;

    if (!rollups.workOrdersByExecutionStatus[execStatus]) rollups.workOrdersByExecutionStatus[execStatus] = { count: 0 };
    rollups.workOrdersByExecutionStatus[execStatus].count++;
  });

  return {
    deals,
    workOrders,
    rollups,
    metadata: {
      dealsCount: deals.length,
      workOrdersCount: workOrders.length,
      orphanedWorkOrdersCount: uniqueOrphans.length,
      orphanedWorkOrderNames: uniqueOrphans,
      dataQualityNotes,
      isMock: process.env.MONDAY_API_KEY === 'mock'
    }
  };
}
