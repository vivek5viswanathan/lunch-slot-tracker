const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'data.json');
const slotLimits = { '12:30': 100, '1:00': 100, '1:30': 100 };
let slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };

// Load saved data on server startup/restart
if (fs.existsSync(DATA_FILE)) {
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    slotCounts = JSON.parse(rawData);
    console.log('Loaded saved counts from data.json:', slotCounts);
  } catch (err) {
    console.error('Error reading data file, using default zero counts:', err);
  }
}

// Function to safely save data to disk
function saveCounts() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(slotCounts, null, 2));
}

app.use(express.static('public'));

io.on('connection', (socket) => {
  // Send current counts to newly connected staff
  socket.emit('updateCounts', { counts: slotCounts, limits: slotLimits });

  // Handle slot allocation tap
  socket.on('allocateSlot', (slotTime) => {
    if (slotCounts[slotTime] < slotLimits[slotTime]) {
      slotCounts[slotTime]++;
      saveCounts(); // Save to file immediately
      
      // Broadcast updated counts to ALL connected staff
      io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
    }
  });

  // Handle manual reset if needed
  socket.on('resetCounts', () => {
    slotCounts = { '12:30': 0, '1:00': 0, '1:30': 0 };
    saveCounts();
    io.emit('updateCounts', { counts: slotCounts, limits: slotLimits });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
