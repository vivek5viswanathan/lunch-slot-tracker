const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Supabase Configuration (Get these from Supabase Project Settings -> API)
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const slotLimits = { '12:30': 100, '1:00': 100, '1:30': 100 };
let slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };

// Fetch current counts from Supabase
async function loadCounts() {
  const { data, error } = await supabase.from('slot_counts').select('*');
  if (!error && data) {
    data.forEach(row => {
      slotCounts[row.slot_time] = row.count;
    });
  }
}

// Update count in Supabase
async function updateSlotInDb(slotTime, newCount) {
  await supabase
    .from('slot_counts')
    .update({ count: newCount })
    .eq('slot_time', slotTime);
}

app.use(express.static('public'));

io.on('connection', async (socket) => {
  await loadCounts();
  socket.emit('updateCounts', { counts: slotCounts, limits: slotLimits });

  socket.on('allocateSlot', async (slotTime) => {
    if (slotCounts[slotTime] < slotLimits[slotTime]) {
      slotCounts[slotTime]++;
      await updateSlotInDb(slotTime, slotCounts[slotTime]);
      io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
    }
  });

  socket.on('resetCounts', async () => {
    slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };
    for (let slot in slotCounts) {
      await updateSlotInDb(slot, 0);
    }
    io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
  });
});

// Add this socket handler inside io.on('connection', async (socket) => { ... })

socket.on('unassignSlot', async (slotTime) => {
  if (slotCounts[slotTime] > 0) {
    slotCounts[slotTime]--;
    await updateSlotInDb(slotTime, slotCounts[slotTime]); // Updates Supabase
    io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await loadCounts();
  console.log(`Server running on port ${PORT}`);
});
