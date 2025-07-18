const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'byron16garcia@gmail.com';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ADMIN_EMAIL,
    pass: 'Ingeniero.18', // Usa una App Password de Gmail
  },
});

async function sendAdminNotification(email) {
  const message = `
    El usuario ${email} ha solicitado acceso temporal a la biblioteca.

    Autorizar acceso:
    https://biblioteca-api-production-e0fd.up.railway.app//autorizar?email=${encodeURIComponent(email)}
  `;

  await transporter.sendMail({
    from: ADMIN_EMAIL,
    to: ADMIN_EMAIL,
    subject: 'Solicitud de acceso temporal',
    text: message,
  });
}

module.exports = { sendAdminNotification };
