const nodemailer = require('nodemailer');
const { TOKEN_EXPIRATION_MINUTES } = require('./googleSheets'); // Importamos la constante

const ADMIN_EMAIL = 'postgradosinternacionalesgt@gmail.com';
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
  const messageHtml = `
    <p>El usuario <strong>${email}</strong> ha solicitado acceso temporal a la biblioteca.</p>
    <p>Para autorizar el acceso, haz clic aquí:</p>
    <p><a href="${acceso}" target="_blank">Autorizar acceso</a></p>
  `;

  try {
    await transporter.sendMail({
      from: ADMIN_EMAIL,
      to: ADMIN_EMAIL,
      subject: 'Solicitud de acceso temporal',
      text: `El usuario ${email} ha solicitado acceso temporal. Autorizar en: ${acceso}`,
      html: messageHtml, // Enviamos HTML
    });
    console.log(`✅ Notificación enviada al administrador para ${email}`);
  } catch (err) {
    console.error('❌ Error enviando correo al administrador:', err.message);
    throw err;
  }
}

// --- Función para notificar al usuario ---
async function sendUserNotification(userEmail, accessUrl) {
  const messageHtml = `
    <p>Hola,</p>
    <p>Tu acceso temporal a la Biblioteca Virtual ha sido aprobado.</p>
    <p>Puedes ingresar usando el siguiente enlace:</p>
    <p><a href="${accessUrl}" target="_blank">LINK DE ACCESO TEMPORAL</a></p>
    <p>Gracias,</p>
    <p><strong>Biblioteca Virtual</strong></p>
  `;

  try {
    await transporter.sendMail({
      from: ADMIN_EMAIL,
      to: userEmail,
      subject: 'Autorización de acceso temporal',
      text: `Tu acceso temporal a la Biblioteca Virtual ha sido aprobado. Enlace válido por ${TOKEN_EXPIRATION_MINUTES} minutos: ${accessUrl}`,
      html: messageHtml, // Enviamos HTML
    });
    console.log(`✅ Correo enviado al solicitante: ${userEmail}`);
  } catch (err) {
    console.error('❌ Error al enviar correo al usuario:', err.message);
    throw err;
  }
}

module.exports = { sendAdminNotification, sendUserNotification };
