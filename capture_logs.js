import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Emulate iPhone
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.log(`PAGE ERROR: ${error.message}`);
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
    const html = await page.content();
    console.log("HTML:", html.substring(0, 500));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  await browser.close();
})();
