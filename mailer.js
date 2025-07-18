const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'byron16garcia@gmail.com';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ADMIN_EMAIL,
    pass: 'TU_APP_PASSWORD', // Usa una App Password de Gmail
  },
});

async function sendAdminNotification(email) {
  const message = `
    El usuario ${email} ha solicitado acceso temporal a la biblioteca.

    Autorizar acceso:
    http://TU_DOMINIO/autorizar?email=${encodeURIComponent(email)}
  `;

  await transporter.sendMail({
    from: ADMIN_EMAIL,
    to: ADMIN_EMAIL,
    subject: 'Solicitud de acceso temporal',
    text: message,
  });
}

module.exports = { sendAdminNotification };
