import crypto from 'node:crypto';

const BOOKING_TIMEZONE = process.env.BOOKING_TIMEZONE || 'America/Los_Angeles';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

const SLOT_INTERVAL_MINUTES = Number(process.env.BOOKING_SLOT_INTERVAL_MINUTES || 30);
const SLOT_DURATION_MINUTES = Number(process.env.BOOKING_SLOT_DURATION_MINUTES || 120);
const BUSINESS_START_MINUTE = Number(process.env.BOOKING_START_MINUTE || 8 * 60);
const BUSINESS_END_MINUTE = Number(process.env.BOOKING_END_MINUTE || 18 * 60);
const DEFAULT_BUSINESS_DAYS = '1,2,3,4,5,6';
const BUSINESS_DAYS = (process.env.BOOKING_BUSINESS_DAYS || DEFAULT_BUSINESS_DAYS)
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMultilineSecret(value) {
  return normalizeString(value).replace(/\\n/g, '\n');
}

function hasCalendarConfig() {
  return Boolean(
    GOOGLE_CALENDAR_ID
    && GOOGLE_SERVICE_ACCOUNT_EMAIL
    && normalizeMultilineSecret(GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  );
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createServiceAccountJwt() {
  const privateKey = normalizeMultilineSecret(GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey);

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getGoogleAccessToken() {
  const assertion = createServiceAccountJwt();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || 'Failed to get Google access token.');
  }

  return result.access_token;
}

async function fetchBusyRanges(timeMinIso, timeMaxIso) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone: BOOKING_TIMEZONE,
      items: [{ id: GOOGLE_CALENDAR_ID }],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Failed to read calendar availability.');
  }

  const busy = result?.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
  return busy
    .map((range) => ({
      startMs: Number(new Date(range.start)),
      endMs: Number(new Date(range.end)),
    }))
    .filter((range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMs));
}

function roundUpToInterval(date, intervalMinutes) {
  const rounded = new Date(date.getTime());
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const add = (intervalMinutes - (minutes % intervalMinutes)) % intervalMinutes;
  rounded.setMinutes(minutes + add);
  return rounded;
}

function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex: WEEKDAY_TO_INDEX[map.weekday] ?? -1,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function overlapsBusy(slotStartMs, slotEndMs, busyRanges) {
  return busyRanges.some((range) => slotStartMs < range.endMs && slotEndMs > range.startMs);
}

function buildAvailabilitySlots({ now, days, busyRanges }) {
  const slotsByDate = new Map();
  const start = roundUpToInterval(now, SLOT_INTERVAL_MINUTES);
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  for (let cursorMs = start.getTime(); cursorMs < end.getTime(); cursorMs += SLOT_INTERVAL_MINUTES * 60 * 1000) {
    const slotStart = new Date(cursorMs);
    const slotEndMs = cursorMs + SLOT_DURATION_MINUTES * 60 * 1000;
    const local = getLocalParts(slotStart, BOOKING_TIMEZONE);

    if (!BUSINESS_DAYS.includes(local.weekdayIndex)) continue;

    const minuteOfDay = local.hour * 60 + local.minute;
    if (minuteOfDay < BUSINESS_START_MINUTE) continue;
    if (minuteOfDay + SLOT_DURATION_MINUTES > BUSINESS_END_MINUTE) continue;
    if (overlapsBusy(cursorMs, slotEndMs, busyRanges)) continue;

    const dateKey = `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
    const dateLabel = slotStart.toLocaleDateString('en-US', {
      timeZone: BOOKING_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeLabel = slotStart.toLocaleTimeString('en-US', {
      timeZone: BOOKING_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
    });

    if (!slotsByDate.has(dateKey)) {
      slotsByDate.set(dateKey, { date: dateKey, label: dateLabel, slots: [] });
    }

    slotsByDate.get(dateKey).slots.push({
      start: slotStart.toISOString(),
      label: timeLabel,
    });
  }

  return Array.from(slotsByDate.values()).filter((entry) => entry.slots.length);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!hasCalendarConfig()) {
    return res.status(503).json({ error: 'Calendar integration is not configured yet.' });
  }

  const requestedDays = Number(req.query?.days || 14);
  const days = Number.isFinite(requestedDays) ? Math.max(3, Math.min(45, requestedDays)) : 14;

  try {
    const now = new Date();
    const timeMinIso = now.toISOString();
    const timeMaxIso = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const busyRanges = await fetchBusyRanges(timeMinIso, timeMaxIso);
    const dates = buildAvailabilitySlots({ now, days, busyRanges });

    return res.status(200).json({
      ok: true,
      timeZone: BOOKING_TIMEZONE,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
      dates,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load calendar availability.',
    });
  }
}
