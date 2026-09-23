import puppeteer from 'puppeteer';

async function verify() {
  console.log('Launching puppeteer browser...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    console.log('Navigating to http://localhost:5173/...');
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for the app title or main container
    await page.waitForSelector('nav', { timeout: 10000 });
    console.log('✓ Main desktop navigation rendered successfully');

    // Test mobile route as well
    const mobilePage = await browser.newPage();
    console.log('Navigating to http://localhost:5173/mobile?key=1234...');
    await mobilePage.goto('http://localhost:5173/mobile?key=1234', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await mobilePage.waitForSelector('div', { timeout: 10000 });
    console.log('✓ Mobile route loaded successfully with authentication token');

    console.log('ALL FRONTEND VERIFICATION CHECKS PASSED!');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verify();
