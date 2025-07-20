const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

// --- Crear un service-account.json limpio para Google Auth ---
const credsPath = path.join(__dirname, 'service-account.json');
try {
  fs.writeFileSync(credsPath, JSON.stringify(rawCredentials, null, 2));
  console.log('✅ [googleSheets] Archivo service-account.json generado.');
} catch (err) {
  console.error('❌ [googleSheets] Error al escribir service-account.json:', err.message);
  throw err;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  keyFile: credsPath,
  scopes: SCOPES,
});

let sheets;
async function getSheetsClient() {
  if (!sheets) {
    const client = await auth.getClient();
    sheets = google.sheets({ version: 'v4', auth: client });
  }
  return sheets;
}

// --- Validaciones adicionales ---
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
    const client = await auth.getClient();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
    await client.request({ url });
    console.log('✅ [debug] Autorización con Google OK.');
    return true;
  } catch (err) {
    console.error('❌ [debug] Falla en autenticación con Google:', err.message);
    console.error('📄 Stack:', err.stack);
    return false;
  }
}

// --- Función principal para obtener datos ---
async function getSheetData() {
  console.log('📄 [googleSheets] Leyendo datos de la hoja...');
  console.log('ℹ️ Spreadsheet ID:', SPREADSHEET_ID);
  console.log('ℹ️ Sheet Name:', SHEET_NAME);
  console.log('ℹ️ Client Email:', rawCredentials.client_email);

  // Validar clave privada primero
  const keyValid = validatePrivateKey();
  if (!keyValid) {
    throw new Error('❌ [googleSheets] Clave privada inválida: no se puede firmar JWT.');
  }

  // Probar autenticación antes de llamar la API
  const authValid = await testAuth();
  if (!authValid) {
    throw new Error('❌ [googleSheets] No se pudo autenticar con Google. Revisar credenciales o JWT.');
  }

  try {
    const sheetsClient = await getSheetsClient();
    const res = await sheetsClient.spreadsheets.values.get({
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

// --- Funciones adicionales (sin cambios) ---
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

async function checkEmailAccess(email) {
  console.log(`🔍 [googleSheets] Verificando acceso para: ${email}`);
  const data = await getSheetData();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = (row[0] || '').trim();

    if (rowEmail.toLowerCase() === email.toLowerCase()) {
      const token = (row[1] || '').trim();
      const expira = new Date(row[2]);
      const estado = (row[4] || '').trim().toUpperCase() === 'TRUE';
      const usado = (row[5] || '').trim().toUpperCase() === 'TRUE';

      console.log(`🕒 Expira: ${expira.toISOString()}, Estado: ${estado}, Usado: ${usado}`);

      if (!estado) return { success: false, message: 'Usuario deshabilitado' };
      if (usado) return { success: false, message: 'Token ya usado' };
      if (expira < new Date()) return { success: false, message: 'Token expirado' };

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
  getSheetData,
};
