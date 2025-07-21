const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'byron16garcia@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD; // App Password de Google

// --- Configuración del transporte de correo ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ADMIN_EMAIL,
    pass: GMAIL_APP_PASSWORD, // Aquí va la App Password, no tu clave real
  },
});

// --- Función para notificar al administrador ---
async function sendAdminNotification(email) {
  const acceso = `https://biblioteca-api-production-e0fd.up.railway.app/autorizar?email=${encodeURIComponent(email)}`;
  const message = `
    El usuario ${email} ha solicitado acceso temporal a la biblioteca.

    Autorizar acceso:
    <p><a href="${acceso}" target="_blank">Autorizar</a></p>
  `;

  try {
    await transporter.sendMail({
      from: ADMIN_EMAIL,
      to: ADMIN_EMAIL,
      subject: 'Solicitud de acceso temporal',
      text: message,
    });
    console.log(`✅ Notificación enviada al administrador para ${email}`);
  } catch (err) {
    console.error('❌ Error enviando correo al administrador:', err.message);
    throw err;
  }
}

async function sendUserNotification(userEmail, accessUrl) {

  const message = `
      <p>Hola,</p>
      <p>Tu acceso temporal a la Biblioteca Virtual ha sido aprobado.</p>
      <p>Puedes ingresar usando el siguiente enlace (válido por ${TOKEN_EXPIRATION_MINUTES} minutos):</p>
      <p><a href="${accessUrl}" target="_blank">LINK ACCESO TEMPORAL</a></p>
      <p>Gracias,</p>
      <p>Biblioteca Virtual</p>`;

  try {
    await transporter.sendMail({
      from: ADMIN_EMAIL,
      to: userEmail,
      subject: 'Autorización de acceso temporal',
      text: message,
    });
    console.log(`✅ Correo enviado al solicitante: ${userEmail}`);
  } catch (err) {
    console.error('❌ Error al enviar correo al:', err.message);
    throw err;
  }
}

module.exports = { sendAdminNotification, sendUserNotification };
