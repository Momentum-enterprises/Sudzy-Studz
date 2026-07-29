import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('.');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sudzyadmin';
const stripe = STRIPE_SECRET_KEY ? (await import('stripe')).default(STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' }) : null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

const getRequestBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const writeJsonFile = async (filePath, data) => {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
};

const updateDonationTotal = async (cents) => {
  const donationPath = normalize(join(ROOT, 'donation.json'));
  const content = await readFile(donationPath, 'utf8');
  const data = JSON.parse(content);
  const current = Number(data.donationAmount || 0);
  data.donationAmount = Number((((current * 100) + cents) / 100).toFixed(2));
  data.lastUpdated = new Date().toISOString();
  await writeJsonFile(donationPath, data);
  return data;
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    if (req.method === 'POST' && urlPath === '/create-checkout-session') {
      const body = await getRequestBody(req);
      let payload;
      try {
        payload = JSON.parse(body.toString());
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const amount = Math.round(Number(payload.amount) * 100);
      if (!amount || amount < 50) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Enter an amount of at least $0.50' }));
        return;
      }

      if (!stripe) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Stripe is not configured on the server' }));
        return;
      }

      const frequency = payload.frequency === 'monthly' ? 'monthly' : 'once';
      const origin = `http://${req.headers.host || '127.0.0.1:' + PORT}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: frequency === 'monthly' ? 'subscription' : 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: { name: 'Sudzy Studz donation' },
            ...(frequency === 'monthly' ? { recurring: { interval: 'month' } } : {}),
          },
          quantity: 1,
        }],
        success_url: `${origin}/?payment=success`,
        cancel_url: `${origin}/?payment=cancel`,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: session.url }));
      return;
    }

    if (req.method === 'POST' && urlPath === '/record-offline-donation') {
      const body = await getRequestBody(req);
      let payload;
      try {
        payload = JSON.parse(body.toString());
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const amount = Number(payload.amount);
      const note = String(payload.note || '').trim();
      const password = String(payload.password || '');

      if (!amount || amount <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Amount must be greater than zero' }));
        return;
      }

      if (password !== ADMIN_PASSWORD) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid admin password' }));
        return;
      }

      const updated = await updateDonationTotal(Math.round(amount * 100));
      console.log('Offline donation recorded:', { amount, note, updatedAt: updated.lastUpdated });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(updated));
      return;
    }

    if (req.method === 'POST' && urlPath === '/webhook') {
      const rawBody = await getRequestBody(req);
      const signature = req.headers['stripe-signature'];

      if (!stripe || !STRIPE_WEBHOOK_SECRET || !signature) {
        res.writeHead(400).end('Webhook misconfigured');
        return;
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        res.writeHead(400).end(`Webhook error: ${err.message}`);
        return;
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const amount = Number(session.amount_total || session.amount_subtotal || 0);
        if (amount > 0 && String(session.currency).toLowerCase() === 'usd') {
          await updateDonationTotal(amount);
        }
      }

      if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        const amount = Number(invoice.amount_paid || 0);
        if (amount > 0 && String(invoice.currency).toLowerCase() === 'usd') {
          await updateDonationTotal(amount);
        }
      }

      res.writeHead(200).end('ok');
      return;
    }

    let filePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    let normalizedPath = normalize(join(ROOT, filePath));
    if (!normalizedPath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    let s = await stat(normalizedPath).catch(() => null);
    if (s && s.isDirectory()) {
      const indexPath = normalize(join(normalizedPath, 'index.html'));
      if (indexPath.startsWith(ROOT)) {
        const indexStat = await stat(indexPath).catch(() => null);
        if (indexStat && indexStat.isFile()) {
          normalizedPath = indexPath;
          s = indexStat;
        }
      }
    }

    if (!s || !s.isFile()) { res.writeHead(404).end('Not found'); return; }

    const data = await readFile(normalizedPath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(normalizedPath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

server.listen(PORT, HOST, () => console.log(`serving ${ROOT} at http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`));
