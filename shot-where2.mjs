import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args:['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 2200, deviceScaleFactor: 2 });
await p.goto('http://localhost:3001', { waitUntil:'networkidle0' });
await p.evaluate(async () => {
  for (let y=0; y<=document.body.scrollHeight; y+=400) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,150)); }
  document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'));
  document.querySelector('#where').scrollIntoView();
  await new Promise(r=>setTimeout(r,700));
});
await new Promise(r=>setTimeout(r,1400));
const el = await p.$('#where');
await el.screenshot({ path: './temporary screenshots/screenshot-15-where2.png' });
await b.close();
console.log('ok');
