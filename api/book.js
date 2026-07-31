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
  'wax-protection': { label: 'Wax & Protection', price: 45 },
  'pet-hair-removal': { label: 'Pet Hair Removal', price: 45 },
  'carpet-shampoo': { label: 'Carpet Shampoo', price: 40 },
  'headlight-restoration': { label: 'Headlight Restoration', price: 40 },
  'plastic-correction': { label: 'Plastic Correction', price: 25 },
  'odor-treatment': { label: 'Odor Treatment', price: 25 },
};

const BOOKING_TO_EMAIL = process.env.BOOKING_TO_EMAIL || 'contact@sudzystudz.com';
const BOOKING_REPLY_TO = 'contact@sudzystudz.com';

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

  const basePrice = normalized.vehicle.type && normalized.booking.package
    ? PRICES[normalized.booking.package][normalized.vehicle.type]
    : 0;
  const addOnTotal = normalized.booking.addOns.reduce((sum, key) => sum + ADD_ONS[key].price, 0);
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
    },
  };
}

function buildAddOnLines(addOns) {
  if (!addOns.length) return 'None';
  return addOns.map((key) => `${ADD_ONS[key].label} (${formatMoney(ADD_ONS[key].price)})`).join(', ');
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
      buildAddOnLines(data.booking.addOns),
      '',
      'PREFERRED TIMES',
      `Option 1: ${data.booking.preferredTimes[0]}`,
      `Option 2: ${data.booking.preferredTimes[1]}`,
      `Option 3: ${data.booking.preferredTimes[2]}`,
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
  const addOnLine = data.booking.addOns.length ? buildAddOnLines(data.booking.addOns) : 'None';

  return {
    subject: 'We got your booking request - Sudzy Studz',
    text: [
      `Hi ${data.customer.fullName},`,
      '',
      'Thanks for booking with Sudzy Studz. We got your request and will confirm your appointment within 24 hours by email or text.',
      '',
      'Here is what you booked:',
      `- ${PACKAGE_LABELS[data.booking.package]} for your ${VEHICLE_LABELS[data.vehicle.type]}`,
      `- Add-ons: ${addOnLine}`,
      `- Preferred times: ${data.booking.preferredTimes.join('; ')}`,
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

    return res.status(200).json({
      ok: true,
      name: data.customer.fullName,
      email: data.customer.email,
      phone: data.customer.phone,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send booking request.',
    });
  }
}