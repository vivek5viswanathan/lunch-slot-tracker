const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const slotLimits = { '12:30': 100, '1:00': 100, '1:30': 100 };
let slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };

async function calculateSlotCounts() {
  slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };
  const { data, error } = await supabase.from('apartments').select('slot_time, total_coupons');
  if (!error && data) {
    data.forEach(row => {
      if (row.slot_time && slotCounts[row.slot_time] !== undefined) {
        slotCounts[row.slot_time] += row.total_coupons;
      }
    });
  }
  return slotCounts;
}

app.use(express.static('public'));

io.on('connection', async (socket) => {
  await calculateSlotCounts();
  const { data: aptList } = await supabase.from('apartments').select('apartment_no, total_coupons, slot_time');
  socket.emit('initData', { counts: slotCounts, limits: slotLimits, apartments: aptList || [] });

  // Lookup apartment by number
  socket.on('lookupApartment', async (aptNo) => {
    const formattedApt = aptNo.trim().toUpperCase();
    const { data, error } = await supabase
      .from('apartments')
      .select('*')
      .ilike('apartment_no', formattedApt)
      .maybeSingle();

    if (error || !data) {
      socket.emit('apartmentResult', { success: false, message: `Apartment '${aptNo}' is not registered.` });
    } else {
      socket.emit('apartmentResult', { success: true, apartment: data });
    }
  });

  // Assign slot to an apartment
  socket.on('assignApartmentSlot', async ({ apartmentNo, targetSlot }) => {
    const { data: apt } = await supabase.from('apartments').select('*').eq('apartment_no', apartmentNo).single();
    if (!apt) return;

    await calculateSlotCounts();
    const currentTaken = slotCounts[targetSlot] || 0;
    const isSameSlot = apt.slot_time === targetSlot;

    // Check capacity
    if (!isSameSlot && (currentTaken + apt.total_coupons > slotLimits[targetSlot])) {
      socket.emit('errorMsg', `Slot ${targetSlot} PM only has ${slotLimits[targetSlot] - currentTaken} spots left, but ${apt.apartment_no} needs ${apt.total_coupons}.`);
      return;
    }

    await supabase.from('apartments').update({ slot_time: targetSlot }).eq('apartment_no', apartmentNo);
    await calculateSlotCounts();
    const { data: updatedApts } = await supabase.from('apartments').select('apartment_no, total_coupons, slot_time');

    io.emit('updateCounts', { counts: slotCounts, limits: slotLimits, apartments: updatedApts });
    socket.emit('apartmentResult', { success: true, apartment: { ...apt, slot_time: targetSlot } });
  });

  // Unassign apartment slot
  socket.on('unassignApartmentSlot', async (apartmentNo) => {
    const { data: apt } = await supabase.from('apartments').select('*').eq('apartment_no', apartmentNo).single();
    if (!apt) return;

    await supabase.from('apartments').update({ slot_time: null }).eq('apartment_no', apartmentNo);
    await calculateSlotCounts();
    const { data: updatedApts } = await supabase.from('apartments').select('apartment_no, total_coupons, slot_time');

    io.emit('updateCounts', { counts: slotCounts, limits: slotLimits, apartments: updatedApts });
    socket.emit('apartmentResult', { success: true, apartment: { ...apt, slot_time: null } });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await calculateSlotCounts();
  console.log(`Server running on port ${PORT}`);
});
