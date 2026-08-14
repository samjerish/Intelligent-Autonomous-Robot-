import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    fs.appendFileSync('browser_console.log', `[${msg.type()}] ${msg.text()}\n`);
  });

  page.on('pageerror', error => {
    fs.appendFileSync('browser_console.log', `[PAGE ERROR] ${error.message}\n${error.stack}\n`);
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 5000 });
    fs.appendFileSync('browser_console.log', "Loaded\n");
    await new Promise(r => setTimeout(r, 10000)); // wait 10 seconds
    const html = await page.content();
    fs.appendFileSync('browser_console.log', `HTML length after 10s: ${html.length}\n`);
    if (html.length < 500) {
      fs.appendFileSync('browser_console.log', `HTML: ${html}\n`);
    }
  } catch (e) {
    fs.appendFileSync('browser_console.log', `[ERROR] ${e.message}\n`);
  }
  
  await browser.close();
})();
