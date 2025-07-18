// googleSheets.js
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

const SHEET_NAME = 'UsuariosTemporales';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SECRET_KEY = process.env.JWT_SECRET || 'bibliotecaVirtual';

// --- Manejo seguro de credenciales (Railway/Render) ---
if (!process.env.GOOGLE_CREDENTIALS) {
  console.error('[ERROR] GOOGLE_CREDENTIALS no está definida en las variables de entorno.');
  throw new Error('La variable de entorno GOOGLE_CREDENTIALS no está definida');
}

let rawCredentials;
try {
  console.log('[INFO] Parseando GOOGLE_CREDENTIALS...');
  rawCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  if (rawCredentials.private_key) {
    console.log('[INFO] Ajustando saltos de línea en private_key...');
    rawCredentials.private_key = rawCredentials.private_key.replace(/\\n/g, '\n');
  }
  console.log('[INFO] Credenciales cargadas correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo parsear GOOGLE_CREDENTIALS:', err.message);
  throw new Error('Error al parsear GOOGLE_CREDENTIALS: ' + err.message);
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let auth;

try {
  console.log('[INFO] Creando cliente JWT para Google API...');
  auth = new google.auth.JWT(
    rawCredentials.client_email,
    null,
    rawCredentials.private_key,
    SCOPES
  );
  console.log('[INFO] Cliente JWT creado correctamente.');
} catch (err) {
  console.error('[ERROR] Error creando cliente JWT:', err.message);
  throw new Error('Error creando cliente JWT: ' + err.message);
}

const sheets = google.sheets({ version: 'v4', auth });

// --- Funciones auxiliares para manipular Google Sheets ---
async function getSheetData() {
  console.log('[DEBUG] Llamando a getSheetData...');
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
    });
    console.log('[DEBUG] Datos obtenidos de la hoja:', res.data.values?.length || 0, 'filas.');
    return res.data.values;
  } catch (err) {
    console.error('[ERROR] Error al obtener datos de Google Sheets:', err.message);
    throw err;
  }
}

async function updateSheet(range, values) {
  console.log(`[DEBUG] Actualizando rango ${range} en Google Sheets...`);
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    console.log('[DEBUG] Rango actualizado correctamente.');
  } catch (err) {
    console.error('[ERROR] Error al actualizar Google Sheets:', err.message);
    throw err;
  }
}

async function appendRow(values) {
  console.log('[DEBUG] Agregando fila en Google Sheets...');
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
    console.log('[DEBUG] Fila agregada correctamente.');
  } catch (err) {
    console.error('[ERROR] Error al agregar fila en Google Sheets:', err.message);
    throw err;
  }
}

// --- Lógica de negocio ---
async function checkEmailAccess(email) {
  console.log(`[INFO] Verificando acceso para el email: ${email}`);
  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === email) {
      console.log(`[INFO] Usuario encontrado en fila ${i + 1}`);
      const token = row[1];
      const expira = new Date(row[2]);
      const estado = row[4] === 'TRUE';
      const usado = row[5] === 'TRUE';

      if (!estado || usado || expira < new Date()) {
        console.warn('[WARN] Usuario no autorizado o token expirado.');
        return { success: false, message: 'No autorizado o token expirado' };
      }

      return { success: true, token };
    }
  }
  console.warn('[WARN] Usuario no encontrado en la hoja.');
  return { success: false, message: 'No autorizado' };
}

async function authorizeUser(email) {
  console.log(`[INFO] Autorizando usuario: ${email}`);
  const token = jwt.sign({ sub: email }, SECRET_KEY, { expiresIn: '30m' });
  const expira = new Date(Date.now() + 30 * 60000).toISOString();
  const data = await getSheetData();

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      console.log(`[DEBUG] Usuario ya existe, actualizando fila ${i + 1}`);
      await updateSheet(`${SHEET_NAME}!B${i + 1}:F${i + 1}`, [[token, expira, '1', 'TRUE', 'FALSE']]);
      found = true;
      break;
    }
  }

  if (!found) {
    console.log('[DEBUG] Usuario nuevo, agregando fila...');
    await appendRow([email, token, expira, '1', 'TRUE', 'FALSE']);
  }
  console.log('[INFO] Token generado correctamente.');
  return { success: true, token };
}

async function validateToken(token) {
  console.log('[INFO] Validando token...');
  try {
    jwt.verify(token, SECRET_KEY);
  } catch (err) {
    console.warn('[WARN] Token inválido o expirado (JWT):', err.message);
    return { success: false, message: 'Token inválido o expirado' };
  }

  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token) {
      const expira = new Date(data[i][2]);
      const estado = data[i][4] === 'TRUE';
      const usado = data[i][5] === 'TRUE';
      if (!estado || usado || expira < new Date()) {
        console.warn('[WARN] Token inválido por estado/uso/expiración.');
        return { success: false, message: 'Token inválido o expirado' };
      }
      console.log('[INFO] Token válido.');
      return { success: true, email: data[i][0] };
    }
  }
  console.warn('[WARN] Token no encontrado en Google Sheets.');
  return { success: false, message: 'Token no encontrado' };
}

async function markTokenUsed(token) {
  console.log('[INFO] Marcando token como usado...');
  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token) {
      console.log(`[DEBUG] Token encontrado en fila ${i + 1}, actualizando...`);
      await updateSheet(`${SHEET_NAME}!F${i + 1}`, [['TRUE']]);
      console.log('[INFO] Token marcado como usado.');
      return { success: true };
    }
  }
  console.warn('[WARN] Token no encontrado para marcar.');
  return { success: false, message: 'Token no encontrado' };
}

module.exports = { checkEmailAccess, authorizeUser, validateToken, markTokenUsed };
