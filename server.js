const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// In-memory slot counts (Max 100 each)
const slotLimits = { '12:30': 100, '1:00': 100, '1:30': 100 };
let slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };

app.use(express.static('public'));

io.on('connection', (socket) => {
  // Send initial counts to newly connected staff
  socket.emit('updateCounts', { counts: slotCounts, limits: slotLimits });

  // Handle slot allocation tap
  socket.on('allocateSlot', (slotTime) => {
    if (slotCounts[slotTime] < slotLimits[slotTime]) {
      slotCounts[slotTime]++;
      // Broadcast updated counts to ALL connected staff in real time
      io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
    }
  });

  // Handle resetting counts if needed
  socket.on('resetCounts', () => {
    slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };
    io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
