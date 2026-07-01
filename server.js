const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const fallbackBookings = [
  {
    id: 'demo-1',
    customer_name: 'สมชาย ดีใจ',
    phone: '081-234-5678',
    date_time: '2026-07-02 14:00',
    barber_name: 'Barber Jack',
    services: ['Haircut', 'Wash & Dry'],
    total_price: 200,
    created_at: '2026-07-01T05:00:00.000Z'
  },
  {
    id: 'demo-2',
    customer_name: 'Jane Doe',
    phone: '089-876-5432',
    date_time: '2026-07-02 15:30',
    barber_name: 'Barber Leo',
    services: ['Haircut', 'Hair Styling'],
    total_price: 200,
    created_at: '2026-07-01T05:10:00.000Z'
  },
  {
    id: 'demo-3',
    customer_name: 'อนันต์ ยอดรัก',
    phone: '086-111-2222',
    date_time: '2026-07-03 11:00',
    barber_name: 'Barber Sophia',
    services: ['Haircut', 'Shaving'],
    total_price: 250,
    created_at: '2026-07-01T05:20:00.000Z'
  }
];

let memoryBookings = [...fallbackBookings];
let clients = [];

function normalizeServices(services) {
  if (Array.isArray(services)) {
    return services.map(service => String(service).trim()).filter(Boolean);
  }

  if (typeof services === 'string' && services.trim() !== '') {
    return services.split(',').map(service => service.trim()).filter(Boolean);
  }

  return ['Haircut'];
}

function normalizeBookingPayload(payload) {
  const services = normalizeServices(payload.services);

  return {
    customer_name: String(payload.customer_name).trim(),
    phone: String(payload.phone).trim(),
    date_time: String(payload.date_time).trim(),
    barber_name: payload.barber_name ? String(payload.barber_name).trim() : 'Any Available Barber',
    services,
    total_price: Number(payload.total_price) || 150
  };
}

function hasUnresolvedTemplateValue(value) {
  if (Array.isArray(value)) {
    return value.some(hasUnresolvedTemplateValue);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some(hasUnresolvedTemplateValue);
  }

  return typeof value === 'string' && /\{\{[^}]+\}\}/.test(value);
}

function sendEventToAll(data) {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

async function getBookings() {
  if (!supabase) {
    return memoryBookings;
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function createBooking(booking) {
  if (!supabase) {
    const memoryBooking = {
      id: `memory-${Date.now()}`,
      ...booking,
      created_at: new Date().toISOString()
    };
    memoryBookings.unshift(memoryBooking);
    return memoryBooking;
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert(booking)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

app.post('/webhook/botnoi', async (req, res) => {
  const { customer_name, phone, date_time } = req.body;

  if (hasUnresolvedTemplateValue(req.body)) {
    return res.status(400).json({
      success: false,
      message: 'Unresolved template values received. Check ibotnoi parameter mapping before calling this API.'
    });
  }

  if (!customer_name || !phone || !date_time) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: customer_name, phone, and date_time are required.'
    });
  }

  try {
    const newBooking = await createBooking(normalizeBookingPayload(req.body));

    console.log('New booking received via webhook:', newBooking);
    sendEventToAll({ type: 'NEW_BOOKING', booking: newBooking });

    return res.status(200).json({
      success: true,
      message: 'Webhook processed, booking registered successfully.',
      data: newBooking
    });
  } catch (error) {
    console.error('Failed to create booking:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save booking.',
      details: error.message
    });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    res.json(await getBookings());
  } catch (error) {
    console.error('Failed to fetch bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings.',
      details: error.message
    });
  }
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write('data: {"type": "CONNECTED"}\n\n');

  const clientId = Date.now();
  clients.push({ id: clientId, res });

  console.log(`SSE Client connected. Active clients: ${clients.length}`);

  const keepAliveInterval = setInterval(() => {
    res.write('data: {"type": "PING"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    clients = clients.filter(client => client.id !== clientId);
    console.log(`SSE Client disconnected. Active clients: ${clients.length}`);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('==================================================');
    console.log('Barber Shop Booking System Server is Running!');
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`Webhook URL : http://localhost:${PORT}/webhook/botnoi`);
    console.log(`Storage     : ${supabase ? 'Supabase' : 'Memory fallback'}`);
    console.log('==================================================');
  });
}

module.exports = app;
