import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
    const html = await page.content();
    console.log(html);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  await browser.close();
})();
