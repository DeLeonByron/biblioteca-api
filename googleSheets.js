// googleSheets.js
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const SHEET_NAME = 'UsuariosTemporales';
const SPREADSHEET_ID = '16O35yDL1nUwNBMEBYMUYONYS6iAXOdfBRrKr_nLg-PM';
const SECRET_KEY = process.env.JWT_SECRET || 'bibliotecaVirtual';

// --- Tiempo de expiración del token (en minutos) ---
const TOKEN_EXPIRATION_MINUTES = 30;

// --- Funciones de fecha ---
function formatLocalDate(date = new Date()) {
  // Convierte siempre a hora local de Guatemala en formato YYYY-MM-DD HH:mm:ss
  const guatemalaTime = new Date(
    date.toLocaleString('en-US', { timeZone: 'America/Guatemala' })
  );
  const year = guatemalaTime.getFullYear();
  const month = String(guatemalaTime.getMonth() + 1).padStart(2, '0');
  const day = String(guatemalaTime.getDate()).padStart(2, '0');
  const hours = String(guatemalaTime.getHours()).padStart(2, '0');
  const minutes = String(guatemalaTime.getMinutes()).padStart(2, '0');
  const seconds = String(guatemalaTime.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(0);
  const [datePart, timePart] = dateStr.trim().split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

// Devuelve un objeto Date con la hora actual de Guatemala
function getNowGuatemala() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Guatemala' })
  );
}

// --- Configuración de credenciales ---
if (!process.env.GOOGLE_CREDENTIALS) {
  throw new Error('❌ GOOGLE_CREDENTIALS no está definida en el entorno');
}

let rawCredentials;
try {
  rawCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  if (rawCredentials.private_key) {
    rawCredentials.private_key = rawCredentials.private_key.replace(/\\n/g, '\n');
  }
} catch (err) {
  console.error('❌ Error al parsear GOOGLE_CREDENTIALS:', err.message);
  throw err;
}

const credsPath = path.join(__dirname, 'service-account.json');
fs.writeFileSync(credsPath, JSON.stringify(rawCredentials, null, 2));

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({ keyFile: credsPath, scopes: SCOPES });

let sheets;
async function getSheetsClient() {
  if (!sheets) {
    const client = await auth.getClient();
    sheets = google.sheets({ version: 'v4', auth: client });
  }
  return sheets;
}

// --- Funciones de Google Sheets ---
async function updateSheet(range, values) {
  const sheetsClient = await getSheetsClient();
  console.log(`✏️ [googleSheets] Actualizando rango ${range} con:`, values);
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// Obtener datos de la hoja
async function getSheetData() {
  const sheetsClient = await getSheetsClient();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
  });
  return res.data.values;
}

async function appendRow(values) {
  const sheetsClient = await getSheetsClient();
  console.log('➕ [googleSheets] Insertando nueva fila:', values);
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

// --- Lógica de negocio ---
async function checkEmailAccess(email) {
  const data = await getSheetData();
  const now = getNowGuatemala();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = (row[0] || '').trim();

    if (rowEmail.toLowerCase() === email.toLowerCase()) {
      const token = (row[1] || '').trim();
      const expira = parseLocalDate(row[2]);
      const estado = (row[4] || '').trim().toUpperCase() === 'TRUE';
      const usado = (row[5] || '').trim().toUpperCase() === 'TRUE';

      console.log(`🕒 Ahora (GT): ${formatLocalDate(now)}`);
      console.log(`🕒 Expira (GT): ${row[2]}`);
      console.log(`Estado: ${estado}, Usado: ${usado}`);

      if (!estado) return { success: false, message: 'Usuario deshabilitado' };
      if (usado) return { success: false, message: 'Token ya usado' };
      if (expira.getTime() <= now.getTime()) {
        return { success: false, message: 'Token expirado' };
      }
      return { success: true, token };
    }
  }
  return { success: false, message: 'No autorizado' };
}

async function authorizeUser(email) {
  const token = jwt.sign({ sub: email }, SECRET_KEY, {
    expiresIn: `${TOKEN_EXPIRATION_MINUTES}m`,
  });
  const expiraDate = new Date(Date.now() + TOKEN_EXPIRATION_MINUTES * 60000);
  const expiraLocal = formatLocalDate(expiraDate);

  const data = await getSheetData();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').trim().toLowerCase() === email.toLowerCase()) {
      await updateSheet(`${SHEET_NAME}!B${i + 1}:F${i + 1}`, [[token, expiraLocal, '1', 'TRUE', 'FALSE']]);
      found = true;
      break;
    }
  }
  if (!found) {
    await appendRow([email, token, expiraLocal, '1', 'TRUE', 'FALSE']);
  }
  return { success: true, token };
}

async function validateToken(token) {
  try {
    jwt.verify(token, SECRET_KEY);
  } catch {
    return { success: false, message: 'Token inválido o expirado' };
  }

  const data = await getSheetData();
  const now = getNowGuatemala();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').trim() === token) {
      const expira = parseLocalDate(data[i][2]);
      const estado = (data[i][4] || '').trim().toUpperCase() === 'TRUE';
      const usado = (data[i][5] || '').trim().toUpperCase() === 'TRUE';

      if (!estado || usado || expira.getTime() <= now.getTime()) {
        return { success: false, message: 'Token inválido o expirado' };
      }
      return { success: true, email: data[i][0] };
    }
  }
  return { success: false, message: 'Token no encontrado' };
}

async function markTokenUsed(token) {
  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').trim() === token) {
      await updateSheet(`${SHEET_NAME}!F${i + 1}`, [['TRUE']]);
      return { success: true };
    }
  }
  return { success: false, message: 'Token no encontrado' };
}

module.exports = {
  checkEmailAccess,
  authorizeUser,
  validateToken,
  markTokenUsed,
  getSheetData,
  updateSheet,
  appendRow,
};
