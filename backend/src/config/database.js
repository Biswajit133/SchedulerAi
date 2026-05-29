const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[MongoDB] MONGODB_URI not set — running without DB. Token persistence disabled.');
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    isConnected = true;
    console.log('[MongoDB] Connected');
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[MongoDB] Disconnected');
    });
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Error:', err.message);
    });
  } catch (err) {
    console.error('[MongoDB] Connection failed (non-fatal):', err.message);
  }
}

function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDBConnected };
