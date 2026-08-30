import { fetchAndProcessData } from './src/lib/data-pipeline';

process.env.MONDAY_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY5ODMxMzU0MSwiYWFpIjoxMSwidWlkIjoxMTQ3OTA3MDYsImlhZCI6IjIwMjYtMDgtMzBUMDU6Mjg6MjMuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjM2NjcyMDg2LCJyZ24iOiJhcHNlMiJ9.GNrcIF-nRgm8RMoZOMpgnM5fmr7VrjLedbASo5IP8VA';
process.env.MONDAY_BOARD_ID_DEALS = '5030964103';
process.env.MONDAY_BOARD_ID_WORK_ORDERS = '5030964083';

async function run() {
  try {
    const data = await fetchAndProcessData();
    console.log("SUCCESS!");
    console.log("Deals Count:", data.metadata.dealsCount);
    console.log("Work Orders Count:", data.metadata.workOrdersCount);
    console.log("Orphans:", data.metadata.orphanedWorkOrdersCount);
    console.log("Rollups:");
    console.log(JSON.stringify(data.rollups, null, 2));
    
    // Log a few parsed amounts to check
    console.log("Sample Work Order Parsed Amount:");
    const woWithAmount = data.workOrders.find(w => w.parsedAmount > 0);
    console.log(woWithAmount ? woWithAmount.parsedAmount : "None found");
    
  } catch (error) {
    console.error("FAILED:", error);
  }
}

run();
