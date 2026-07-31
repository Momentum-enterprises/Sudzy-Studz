import crypto from 'node:crypto';

const PACKAGE_LABELS = {
  quick: 'Quick Studz',
  full: 'Full Studz',
  showroom: 'Showroom',
};

const VEHICLE_LABELS = {
  sedan: 'Sedan',
  'suv-truck': 'SUV / Truck',
  'xl-vehicle': 'XL Vehicle',
};

const PRICES = {
  quick: { sedan: 49, 'suv-truck': 69, 'xl-vehicle': 79 },
  full: { sedan: 99, 'suv-truck': 119, 'xl-vehicle': 139 },
  showroom: { sedan: 169, 'suv-truck': 189, 'xl-vehicle': 209 },
};

const ADD_ONS = {
  'steam-clean-interior': { label: 'Steam Clean Interior', price: 45 },
  'wax-protection': { label: 'Wax & Protection', price: 99 },
  'pet-hair-removal': { label: 'Pet Hair Removal', price: 45 },
  'carpet-shampoo': { label: 'Carpet Shampoo', price: 40 },
  'headlight-restoration': { label: 'Headlight Restoration', price: 40 },
  'plastic-correction': { label: 'Plastic Correction', price: 25 },
  'odor-treatment': { label: 'Odor Treatment', price: 25 },
};

const PACKAGE_INCLUDED_ADD_ONS = {
  quick: [],
  full: [],
  showroom: ['steam-clean-interior', 'pet-hair-removal', 'carpet-shampoo'],
};

const BOOKING_TO_EMAIL = process.env.BOOKING_TO_EMAIL || 'contact@sudzystudz.com';
const BOOKING_REPLY_TO = 'contact@sudzystudz.com';
const BOOKING_TIMEZONE = process.env.BOOKING_TIMEZONE || 'America/Los_Angeles';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMultilineSecret(value) {
  return normalizeString(value).replace(/\\n/g, '\n');
}

function getIncludedAddOnSet(packageKey) {
  return new Set(PACKAGE_INCLUDED_ADD_ONS[packageKey] || []);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function parseRequestBody(body) {
  if (!body) return null;
  if (typeof body === 'string') return JSON.parse(body);
  return body;
}

function validatePayload(payload) {
  const customer = payload?.customer || {};
  const vehicle = payload?.vehicle || {};
  const booking = payload?.booking || {};
  const errors = [];

  const normalized = {
    customer: {
      fullName: normalizeString(customer.fullName),
      phone: normalizeString(customer.phone),
      email: normalizeString(customer.email),
      address: normalizeString(customer.address),
    },
    vehicle: {
      makeModel: normalizeString(vehicle.makeModel),
      type: normalizeString(vehicle.type),
    },
    booking: {
      package: normalizeString(booking.package),
      addOns: Array.isArray(booking.addOns) ? booking.addOns.filter((key) => Object.prototype.hasOwnProperty.call(ADD_ONS, key)) : [],
      preferredTimes: Array.isArray(booking.preferredTimes) ? booking.preferredTimes.map(normalizeString).slice(0, 3) : [],
      notes: normalizeString(booking.notes),
      firstResponder: Boolean(booking.firstResponder),
    },
  };

  if (!normalized.customer.fullName) errors.push('Full name is required.');
  if (!normalized.customer.phone || !isValidPhone(normalized.customer.phone)) errors.push('A valid phone number is required.');
  if (!normalized.customer.email || !isValidEmail(normalized.customer.email)) errors.push('A valid email address is required.');
  if (!normalized.customer.address) errors.push('Service address is required.');
  if (!normalized.vehicle.makeModel) errors.push('Vehicle make and model is required.');
  if (!Object.prototype.hasOwnProperty.call(VEHICLE_LABELS, normalized.vehicle.type)) errors.push('Vehicle type is required.');
  if (!Object.prototype.hasOwnProperty.call(PACKAGE_LABELS, normalized.booking.package)) errors.push('Package selection is required.');
  if (normalized.booking.preferredTimes.length !== 3 || normalized.booking.preferredTimes.some((value) => !value)) {
    errors.push('Three preferred date and time options are required.');
  }

  const includedSet = getIncludedAddOnSet(normalized.booking.package);
  const includedAddOns = normalized.booking.addOns.filter((key) => includedSet.has(key));
  const paidAddOns = normalized.booking.addOns.filter((key) => !includedSet.has(key));

  const basePrice = normalized.vehicle.type && normalized.booking.package
    ? PRICES[normalized.booking.package][normalized.vehicle.type]
    : 0;
  const addOnTotal = paidAddOns.reduce((sum, key) => sum + ADD_ONS[key].price, 0);
  const total = normalized.booking.firstResponder ? 0 : basePrice + addOnTotal;

  return {
    errors,
    data: {
      ...normalized,
      pricing: {
        basePrice,
        addOnTotal,
        total,
      },
      includedAddOns,
      paidAddOns,
    },
  };
}

function buildAddOnLines(addOns) {
  if (!addOns.length) return 'None';
  return addOns.map((key) => `${ADD_ONS[key].label} (${formatMoney(ADD_ONS[key].price)})`).join(', ');
}

function buildIncludedAddOnLines(addOns) {
  if (!addOns.length) return 'None';
  return addOns.map((key) => ADD_ONS[key].label).join(', ');
}

function formatPreferredTime(value) {
  const normalized = normalizeString(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return normalized;

  const date = new Date(`${normalized}:00`);
  if (Number.isNaN(date.getTime())) return normalized;

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildAdminEmail(data) {
  const packageLine = `${PACKAGE_LABELS[data.booking.package]} - ${formatMoney(data.pricing.basePrice)}`;
  const totalLine = data.booking.firstResponder
    ? '$0.00 - First responder / military appreciation detail'
    : formatMoney(data.pricing.total);

  return {
    subject: `New booking request from ${data.customer.fullName}`,
    text: [
      'New booking request from Sudzy Studz website:',
      '',
      'CUSTOMER',
      `Name: ${data.customer.fullName}`,
      `Phone: ${data.customer.phone}`,
      `Email: ${data.customer.email}`,
      `Address: ${data.customer.address}`,
      '',
      'VEHICLE',
      `Type: ${VEHICLE_LABELS[data.vehicle.type]}`,
      `Make/Model: ${data.vehicle.makeModel}`,
      '',
      'PACKAGE',
      packageLine,
      '',
      'ADD-ONS',
      `Paid: ${buildAddOnLines(data.paidAddOns)}`,
      `Included: ${buildIncludedAddOnLines(data.includedAddOns)}`,
      '',
      'PREFERRED TIMES',
      `Option 1: ${formatPreferredTime(data.booking.preferredTimes[0])}`,
      `Option 2: ${formatPreferredTime(data.booking.preferredTimes[1])}`,
      `Option 3: ${formatPreferredTime(data.booking.preferredTimes[2])}`,
      '',
      'NOTES',
      data.booking.notes || 'None',
      '',
      `FIRST RESPONDER / MILITARY: ${data.booking.firstResponder ? 'Yes' : 'No'}`,
      '',
      `TOTAL: ${totalLine}`,
    ].join('\n'),
  };
}

function buildCustomerEmail(data) {
  const totalLine = data.booking.firstResponder
    ? '$0.00 - First responder / military appreciation detail'
    : formatMoney(data.pricing.total);
  const paidAddOnLine = data.paidAddOns.length ? buildAddOnLines(data.paidAddOns) : 'None';
  const includedAddOnLine = data.includedAddOns.length ? buildIncludedAddOnLines(data.includedAddOns) : 'None';

  return {
    subject: 'We got your booking request - Sudzy Studz',
    text: [
      `Hi ${data.customer.fullName},`,
      '',
      'Thanks for booking with Sudzy Studz. We got your request and will confirm your appointment within 24 hours by email or text.',
      '',
      'Here is what you booked:',
      `- ${PACKAGE_LABELS[data.booking.package]} for your ${VEHICLE_LABELS[data.vehicle.type]}`,
      `- Paid add-ons: ${paidAddOnLine}`,
      `- Included add-ons: ${includedAddOnLine}`,
      `- Preferred times: ${data.booking.preferredTimes.map(formatPreferredTime).join('; ')}`,
      `- Total: ${totalLine}`,
      '',
      'If anything needs to change, just reply to this email.',
      '',
      'Thanks,',
      'The Sudzy Studz Team',
      'contact@sudzystudz.com',
    ].join('\n'),
  };
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
    scope: 'https://www.googleapis.com/auth/calendar.events',
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

function addMinutesToLocalDateTime(localDateTime, minutesToAdd) {
  const parsed = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!parsed) return null;
  const [, year, month, day, hour, minute] = parsed;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0));
  date.setUTCMinutes(date.getUTCMinutes() + minutesToAdd);

  const two = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}T${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:00`;
}

function buildCalendarDescription(data) {
  const totalLine = data.booking.firstResponder
    ? '$0.00 - First responder / military appreciation detail'
    : formatMoney(data.pricing.total);

  return [
    'New booking request from Sudzy Studz website',
    '',
    'Status: Pending confirmation',
    '',
    `Customer: ${data.customer.fullName}`,
    `Phone: ${data.customer.phone}`,
    `Email: ${data.customer.email}`,
    `Address: ${data.customer.address}`,
    '',
    `Vehicle: ${VEHICLE_LABELS[data.vehicle.type]} - ${data.vehicle.makeModel}`,
    `Package: ${PACKAGE_LABELS[data.booking.package]} (${formatMoney(data.pricing.basePrice)})`,
    `Paid add-ons: ${buildAddOnLines(data.paidAddOns)}`,
    `Included add-ons: ${buildIncludedAddOnLines(data.includedAddOns)}`,
    '',
    `Preferred option 1: ${formatPreferredTime(data.booking.preferredTimes[0])}`,
    `Preferred option 2: ${formatPreferredTime(data.booking.preferredTimes[1])}`,
    `Preferred option 3: ${formatPreferredTime(data.booking.preferredTimes[2])}`,
    '',
    `First responder / military: ${data.booking.firstResponder ? 'Yes' : 'No'}`,
    `Total: ${totalLine}`,
    '',
    `Notes: ${data.booking.notes || 'None'}`,
  ].join('\n');
}

async function createCalendarEvent(data) {
  if (!hasCalendarConfig()) {
    return { created: false, skipped: true, reason: 'calendar-not-configured' };
  }

  const firstPreferredTime = data.booking.preferredTimes[0];
  const startDateTime = `${firstPreferredTime}:00`;
  const endDateTime = addMinutesToLocalDateTime(firstPreferredTime, 120);
  if (!endDateTime) {
    return { created: false, skipped: true, reason: 'invalid-preferred-time' };
  }

  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `Booking request - ${data.customer.fullName}`,
      location: data.customer.address,
      description: buildCalendarDescription(data),
      start: {
        dateTime: startDateTime,
        timeZone: BOOKING_TIMEZONE,
      },
      end: {
        dateTime: endDateTime,
        timeZone: BOOKING_TIMEZONE,
      },
      attendees: [
        { email: data.customer.email },
      ],
      reminders: {
        useDefault: true,
      },
      extendedProperties: {
        private: {
          source: 'sudzy-studz-booking-form',
          status: 'pending-confirmation',
        },
      },
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Failed to create Google Calendar event.');
  }

  return {
    created: true,
    eventId: result.id,
    eventLink: result.htmlLink,
  };
}

async function sendResendEmail({ to, subject, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error('Missing email configuration. Set RESEND_API_KEY and BOOKING_FROM_EMAIL.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      reply_to: replyTo,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.message || result?.error || 'Failed to send email.';
    throw new Error(message);
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let payload;
  try {
    payload = parseRequestBody(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid booking request body.' });
  }

  const { errors, data } = validatePayload(payload);
  if (errors.length) {
    return res.status(400).json({ error: errors[0] });
  }

  try {
    const adminEmail = buildAdminEmail(data);
    const customerEmail = buildCustomerEmail(data);

    await sendResendEmail({
      to: BOOKING_TO_EMAIL,
      subject: adminEmail.subject,
      text: adminEmail.text,
      replyTo: data.customer.email,
    });

    await sendResendEmail({
      to: data.customer.email,
      subject: customerEmail.subject,
      text: customerEmail.text,
      replyTo: BOOKING_REPLY_TO,
    });

    let calendar = { created: false, skipped: true, reason: 'calendar-not-configured' };
    try {
      calendar = await createCalendarEvent(data);
    } catch (calendarError) {
      console.error('Calendar event creation failed:', calendarError);
      calendar = {
        created: false,
        skipped: false,
        reason: calendarError instanceof Error ? calendarError.message : 'calendar-error',
      };
    }

    return res.status(200).json({
      ok: true,
      name: data.customer.fullName,
      email: data.customer.email,
      phone: data.customer.phone,
      calendar,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send booking request.',
    });
  }
}