const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { checkEmailAccess, authorizeUser, validateToken, markTokenUsed } = require('./googleSheets');
const { sendAdminNotification } = require('./mailer');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

// POST: Verifica si el usuario existe o envía notificación
app.post('/solicitar', async (req, res) => {
  const email = req.body.email;
  if (!email) return res.status(400).json({ success: false, message: "Falta el correo" });

  try {
    const result = await checkEmailAccess(email);
    if (result.success) {
      return res.json(result);
    }

    // Si no tiene acceso, enviar notificación
    await sendAdminNotification(email);
    res.json({ success: false, message: "Solicitud enviada al administrador" });
  } catch (error) {
    console.error('Error en /solicitar:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET: Autorizar usuario y generar token
app.get('/autorizar', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ success: false, message: "Correo requerido" });

  try {
    const result = await authorizeUser(email);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET: Validar token
app.get('/validar', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ success: false, message: "Token requerido" });

  try {
    const result = await validateToken(token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT: Marcar token como usado
app.put('/marcar', async (req, res) => {
  const token = req.body.token;
  if (!token) return res.status(400).json({ success: false, message: "Token requerido" });

  try {
    const result = await markTokenUsed(token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
