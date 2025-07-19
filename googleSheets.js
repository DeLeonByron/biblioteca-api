const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SHEET_NAME = 'UsuariosTemporales';
const SPREADSHEET_ID = '16O35yDL1nUwNBMEBYMUYONYS6iAXOdfBRrKr_nLg-PM';
const SECRET_KEY = process.env.JWT_SECRET || 'bibliotecaVirtual';

console.log('🔍 [googleSheets] Inicializando módulo...');

// --- Verificar GOOGLE_CREDENTIALS ---
if (!process.env.GOOGLE_CREDENTIALS) {
  throw new Error('❌ GOOGLE_CREDENTIALS no está definida en el entorno');
}

let rawCredentials;
try {
  rawCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  if (rawCredentials.private_key) {
    rawCredentials.private_key = rawCredentials.private_key.replace(/\\n/g, '\n');
  }
  console.log('✅ [googleSheets] Credenciales parseadas correctamente.');
} catch (err) {
  console.error('❌ [googleSheets] Error al parsear GOOGLE_CREDENTIALS:', err.message);
  throw err;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.JWT(
  rawCredentials.client_email,
  null,
  rawCredentials.private_key,
  SCOPES
);

const sheets = google.sheets({ version: 'v4', auth });

// --- Funciones para validaciones extra ---
function validatePrivateKey() {
  console.log('🔍 [debug] Validando estructura de la clave privada...');
  const pk = rawCredentials.private_key || '';
  console.log('   - Tiene encabezado BEGIN?:', pk.startsWith('-----BEGIN PRIVATE KEY-----'));
  console.log('   - Tiene pie END?:', pk.trim().endsWith('-----END PRIVATE KEY-----'));

  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update('test');
    sign.sign(pk);
    console.log('✅ [debug] La clave privada puede firmar (válida).');
    return true;
  } catch (err) {
    console.error('❌ [debug] La clave privada NO puede firmar:', err.message);
    return false;
  }
}

async function testAuth() {
  console.log('🔍 [debug] Probando autorización JWT con Google...');
  try {
    await auth.authorize();
    console.log('✅ [debug] Autorización con Google OK.');
    return true;
  } catch (err) {
    console.error('❌ [debug] Falla en auth.authorize():', err.message);
    console.error('📄 Stack:', err.stack);
    return false;
  }
}

// --- Funciones principales ---
async function getSheetData() {
  console.log('📄 [googleSheets] Leyendo datos de la hoja...');
  console.log('ℹ️ Spreadsheet ID:', SPREADSHEET_ID);
  console.log('ℹ️ Sheet Name:', SHEET_NAME);
  console.log('ℹ️ Client Email:', rawCredentials.client_email);

  // Validar clave y firma ANTES de llamar a Google
  const keyValid = validatePrivateKey();
  if (!keyValid) {
    console.error('❌ [googleSheets] La clave privada parece inválida. Deteniendo.');
    throw new Error('Clave privada inválida: no se puede firmar JWT.');
  }

  // Verificar que el JWT de auth sea aceptado
  const authValid = await testAuth();
  if (!authValid) {
    console.error('❌ [googleSheets] No se pudo autenticar con Google. Revisar JWT o credenciales.');
    throw new Error('Autenticación con Google fallida.');
  }

  // Si todo está bien, hacemos la llamada real a Sheets API
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
    });
    console.log('✅ [googleSheets] Datos obtenidos correctamente.');
    return res.data.values;
  } catch (err) {
    console.error('❌ [googleSheets] Error al leer la hoja:', err.message);
    console.error('📄 Stack:', err.stack);
    throw err;
  }
}

async function appendRow(values) {
  console.log('➕ [googleSheets] Insertando nueva fila:', values);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

// --- Lógica de negocio ---
async function checkEmailAccess(email) {
  console.log(`🔍 [googleSheets] Verificando acceso para: ${email}`);
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

async function authorizeUser(email) {
  console.log(`🔑 [googleSheets] Autorizando usuario: ${email}`);
  const token = jwt.sign({ sub: email }, SECRET_KEY, { expiresIn: '30m' });
  const expira = new Date(Date.now() + 30 * 60000).toISOString();
  const data = await getSheetData();

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      console.log(`✏️ [googleSheets] Actualizando token para ${email}`);
      await updateSheet(`${SHEET_NAME}!B${i + 1}:F${i + 1}`, [[token, expira, '1', 'TRUE', 'FALSE']]);
      found = true;
      break;
    }
  }
  if (!found) {
    console.log(`➕ [googleSheets] Insertando nuevo usuario: ${email}`);
    await appendRow([email, token, expira, '1', 'TRUE', 'FALSE']);
  }
  return { success: true, token };
}

async function validateToken(token) {
  console.log(`🔍 [googleSheets] Validando token: ${token.substring(0, 8)}...`);
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

async function markTokenUsed(token) {
  console.log(`✏️ [googleSheets] Marcando token como usado: ${token.substring(0, 8)}...`);
  const data = await getSheetData();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token) {
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
  getSheetData // exportamos para ser usado en index.js
};
