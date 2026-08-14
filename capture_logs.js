import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`${msg.type().toUpperCase()}: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.log(`PAGE ERROR: ${error.message}`);
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 5000 });
  } catch (e) {
    console.log(`Navigation error: ${e.message}`);
  }
  
  await browser.close();
})();
