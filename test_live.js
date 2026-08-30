const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

async function testFetch() {
  // We need to use TypeScript or ts-node to run the typescript file.
  // We can just use Next.js's dev server to run it, but let's compile it.
}
testFetch();
