// googleSheets.js
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

const SHEET_NAME = 'UsuariosTemporales';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SECRET_KEY = process.env.JWT_SECRET || 'bibliotecaVirtual';

// Parsea las credenciales de Google (desde variable de entorno en Railway)
const rawCredentials = process.env.GOOGLE_CREDENTIALS
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
  : null;

// Si el private_key tiene "\n" escapados, los reemplazamos por saltos reales
if (rawCredentials && rawCredentials.private_key) {
  rawCredentials.private_key = rawCredentials.private_key.replace(/\\n/g, '\n');
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const auth = new google.auth.JWT(
  rawCredentials.client_email,
  null,
  rawCredentials.private_key,
  SCOPES
);

const sheets = google.sheets({ version: 'v4', auth });

// Obtener datos de la hoja
async function getSheetData() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
  });
  return res.data.values;
}

// Actualizar celdas
async function updateSheet(range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// Agregar fila nueva
async function appendRow(values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

// Verificar si el correo ya tiene acceso
async function checkEmailAccess(email) {
  const data = await getSheetData();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === email) {
      const token = row[1];
      const expira = new Date(row[2]);
      const estado = row[4] === 'TRUE';
      const usado = row[5] === 'TRUE';

      if (!estado || usado || expira < new Date()) {
        return { success: false, message: 'No autorizado o token expirado' };
      }

      return { success: true, token };
    }
  }
  return { success: false, message: 'No autorizado' };
}

// Autorizar usuario y generar token
async function authorizeUser(email) {
  const token = jwt.sign({ sub: email }, SECRET_KEY, { expiresIn: '30m' });
  const expira = new Date(Date.now() + 30 * 60000).toISOString();
  const data = await getSheetData();

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      await updateSheet(`${SHEET_NAME}!B${i + 1}:F${i + 1}`, [[token, expira, '1', 'TRUE', 'FALSE']]);
      found = true;
      break;
    }
  }

  if (!found) {
    await appendRow([email, token, expira, '1', 'TRUE', 'FALSE']);
  }
  return { success: true, token };
}

// Validar token
async function validateToken(token) {
  try {
    jwt.verify(token, SECRET_KEY);
  } catch {
    return { success: false, message: 'Token inválido o expirado' };
  }

  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token) {
      const expira = new Date(data[i][2]);
      const estado = data[i][4] === 'TRUE';
      const usado = data[i][5] === 'TRUE';
      if (!estado || usado || expira < new Date()) {
        return { success: false, message: 'Token inválido o expirado' };
      }
      return { success: true, email: data[i][0] };
    }
  }
  return { success: false, message: 'Token no encontrado' };
}

// Marcar token como usado
async function markTokenUsed(token) {
  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token) {
      await updateSheet(`${SHEET_NAME}!F${i + 1}`, [['TRUE']]);
      return { success: true };
    }
  }
  return { success: false, message: 'Token no encontrado' };
}

module.exports = { checkEmailAccess, authorizeUser, validateToken, markTokenUsed };
