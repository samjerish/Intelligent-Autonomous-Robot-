import puppeteer from 'puppeteer';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  console.log('Navigating...');
  await page.goto('http://localhost:5174/');
  
  // Wait for React Three Fiber to render
  await new Promise(r => setTimeout(r, 5000));
  
  // Click Generate Mission
  console.log('Clicking Generate Mission...');
  const generateBtn = await page.$('button.w-full.bg-brand');
  if (generateBtn) {
    await generateBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('Generate button not found');
  }
  
  // Click Execute Mission
  console.log('Clicking Execute Mission...');
  // Find button containing text "Execute Mission"
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Execute Mission')) {
      await btn.click();
      break;
    }
  }
  
  // Wait a few seconds for robot to start moving
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: '/Users/samjerishd/.gemini/antigravity-ide/brain/27340585-9d65-43b0-9c94-b561d995f162/demo.png' });
  
  await browser.close();
  console.log('Done!');
})();
