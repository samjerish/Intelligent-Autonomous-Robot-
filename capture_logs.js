import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    fs.appendFileSync('browser_console_real.log', `[${msg.type()}] ${msg.text()}\n`);
  });

  page.on('pageerror', error => {
    fs.appendFileSync('browser_console_real.log', `[PAGE ERROR] ${error.message}\n${error.stack}\n`);
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 5000 });
    fs.appendFileSync('browser_console_real.log', "Loaded\n");
    await new Promise(r => setTimeout(r, 3000));
  } catch (e) {
    fs.appendFileSync('browser_console_real.log', `[ERROR] ${e.message}\n`);
  }
  
  await browser.close();
})();
