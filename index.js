const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { checkEmailAccess, authorizeUser, validateToken, markTokenUsed } = require('./googleSheets');
const { sendAdminNotification } = require('./mailer');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

// Ruta raíz para probar que el backend funciona
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Biblioteca API funcionando 🚀' });
});

// POST: Verifica si el usuario existe o envía notificación
app.post('/solicitar', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Falta el correo" });

    const result = await checkEmailAccess(email);
    if (result.success) return res.json(result);

    // Si no tiene acceso, enviar notificación
    await sendAdminNotification(email);
    res.json({ success: false, message: "Solicitud enviada al administrador" });
  } catch (error) {
    next(error);
  }
});

// GET: Autorizar usuario y generar token
app.get('/autorizar', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: "Correo requerido" });

    const result = await authorizeUser(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET: Validar token
app.get('/validar', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: "Token requerido" });

    const result = await validateToken(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PUT: Marcar token como usado
app.put('/marcar', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Token requerido" });

    const result = await markTokenUsed(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Middleware global para manejo de errores
app.use((err, req, res, next) => {
  console.error('Error interno:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor', error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));

module.exports = app;
