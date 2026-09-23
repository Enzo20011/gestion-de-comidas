const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client;
let currentQR = '';
let isConnected = false;

function initWhatsApp() {
  console.log('[WhatsApp] Inicializando cliente...');
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './data/whatsapp_session'
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', async (qr) => {
    try {
      currentQR = await qrcode.toDataURL(qr);
      console.log('[WhatsApp] Nuevo código QR generado. Escanéalo en el panel de Admin.');
    } catch (err) {
      console.error('[WhatsApp] Error generando QR', err);
    }
  });

  client.on('ready', () => {
    isConnected = true;
    currentQR = '';
    console.log('[WhatsApp] Cliente listo y conectado.');
  });
  
  client.on('disconnected', (reason) => {
    isConnected = false;
    currentQR = '';
    console.log('[WhatsApp] Cliente desconectado. Razón:', reason);
    console.log('[WhatsApp] Si quieres volver a conectar, debes reiniciar la terminal del servidor.');
  });
  
  client.on('auth_failure', msg => {
    isConnected = false;
    currentQR = '';
    console.error('[WhatsApp] Fallo de autenticación:', msg);
    console.log('[WhatsApp] Si quieres volver a conectar, debes reiniciar la terminal del servidor.');
  });

  client.initialize().catch(err => {
    console.error('[WhatsApp] Error inicializando:', err);
  });
}

function getWhatsAppStatus() {
  return {
    connected: isConnected,
    qr: currentQR
  };
}

async function sendMessage(phone, message) {
  if (!isConnected || !client) return false;
  if (!phone) return false;
  
  try {
    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return false;
    
    // Asumimos Argentina por defecto si no empieza con código de país.
    // Esto debería ajustarse a tu país real.
    if (!cleanPhone.startsWith('549')) {
      if (cleanPhone.startsWith('54')) cleanPhone = cleanPhone.replace(/^54/, '549');
      else cleanPhone = '549' + cleanPhone;
    }
    
    const chatId = `${cleanPhone}@c.us`;
    await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] Mensaje enviado a ${cleanPhone}`);
    return true;
  } catch (error) {
    console.error(`[WhatsApp] Error al enviar mensaje a ${phone}:`, error);
    return false;
  }
}

module.exports = { initWhatsApp, getWhatsAppStatus, sendMessage };
