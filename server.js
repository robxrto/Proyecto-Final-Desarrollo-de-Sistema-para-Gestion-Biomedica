const express = require('express');
const app = express();
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const fs = require('fs');
const multer = require('multer');
const JSZip = require('jszip');
const xlsx = require('xlsx');
const os = require('os');

require('dotenv').config();
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: '-08:00'
});

// Conexión a MySQL
db.connect((err) => {
  if (err) {
    console.error('❌ Error al conectar con MySQL:', err);
    process.exit(1);
  }
  console.log('✅ Conexión a MySQL establecida');
  createMensajesTable();
  createCitasTable();
  createHistorialesTable();
  createHorariosMedicoTable();
});

// Crear tabla de mensajes si no existe
function createMensajesTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS mensajes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      remitente_id INT NOT NULL,
      destinatario_id INT NOT NULL,
      asunto VARCHAR(255),
      mensaje TEXT NOT NULL,
      fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
      leido BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (remitente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      INDEX idx_remitente (remitente_id),
      INDEX idx_destinatario (destinatario_id),
      INDEX idx_fecha_envio (fecha_envio)
    )
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) console.error('❌ Error al crear tabla mensajes:', err.message);
    else console.log('✅ Tabla de mensajes verificada/creada correctamente');
  });
}

// Crear tabla de citas si no existe
function createCitasTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS citas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      paciente_id INT NOT NULL,
      medico_id INT NOT NULL,
      fecha DATE NOT NULL,
      hora TIME NOT NULL,
      tipo_cita VARCHAR(100) NOT NULL,
      motivo TEXT,
      notas TEXT,
      estado ENUM('pendiente', 'confirmada', 'completada', 'cancelada') DEFAULT 'pendiente',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
      FOREIGN KEY (medico_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) console.error('❌ Error al crear tabla citas:', err.message);
    else console.log('✅ Tabla de citas verificada/creada correctamente');
  });
}

// Crear tabla de historiales clínicos si no existe
function createHistorialesTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS historiales_clinicos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      paciente_id INT NOT NULL,
      medico_id INT NOT NULL,
      fecha_consulta DATE NOT NULL,
      motivo_consulta TEXT NOT NULL,
      diagnostico TEXT,
      tratamiento TEXT,
      medicamentos_prescritos TEXT,
      observaciones TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
      FOREIGN KEY (medico_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      INDEX idx_paciente (paciente_id),
      INDEX idx_medico (medico_id),
      INDEX idx_fecha_consulta (fecha_consulta)
    )
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) console.error('❌ Error al crear tabla historiales_clinicos:', err.message);
    else console.log('✅ Tabla de historiales clínicos verificada/creada correctamente');
  });
}

// Crear tabla de horarios médicos si no existe
function createHorariosMedicoTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS horarios_medico (
      id INT AUTO_INCREMENT PRIMARY KEY,
      medico_id INT NOT NULL,
      dia_semana ENUM('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo') NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fin TIME NOT NULL,
      disponible BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (medico_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      INDEX idx_medico (medico_id),
      INDEX idx_dia_semana (dia_semana)
    )
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) console.error('❌ Error al crear tabla horarios_medico:', err.message);
    else console.log('✅ Tabla de horarios_medico verificada/creada correctamente');
  });
}

// Configuración de uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

// Crear archivo Excel
function crearExcel(nombreArchivo, datos, columnas) {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(datos, { header: columnas });
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'claveSecreta123',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} - Sesión: ${req.session.user ? 'SÍ' : 'NO'} - Usuario: ${req.session.user?.nombre_usuario || 'N/A'} - Tipo: ${req.session.user?.tipo_usuario || 'N/A'}`);
  next();
});

// ========== MIDDLEWARES DE AUTENTICACIÓN ==========
function requireLogin(req, res, next) {
  if (!req.session.user) {
    console.log('🔒 Acceso denegado a ruta protegida, redirigiendo a /login');
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (roles.includes(req.session.user.tipo_usuario)) next();
    else {
      console.log(`❌ Acceso denegado para ${req.session.user.tipo_usuario} a ${req.path}`);
      res.status(403).send(`
        <!DOCTYPE html><html><head><title>403 - Acceso Denegado</title><link rel="stylesheet" href="/styles.css"></head>
        <body><div class="container"><h1>403 - Acceso Denegado</h1><p>No tienes permiso para acceder a esta página.</p>
        <p><strong>Usuario:</strong> ${req.session.user.nombre_usuario}</p><p><strong>Tipo:</strong> ${req.session.user.tipo_usuario}</p>
        <p><strong>Ruta solicitada:</strong> ${req.path}</p><a href="/dashboard">Volver al inicio</a></div></body></html>
      `);
    }
  };
}

function requireMedicoOrEnfermero(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.tipo_usuario === 'medico' || req.session.user.tipo_usuario === 'enfermero') next();
  else {
    console.log(`❌ Acceso denegado para paciente a mensajería: ${req.session.user.nombre_usuario}`);
    res.status(403).send(`
      <!DOCTYPE html><html><head><title>Acceso Restringido</title><link rel="stylesheet" href="/styles.css">
      <style>.container{max-width:600px;margin:100px auto;padding:40px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.1);text-align:center}
      .icon{font-size:60px;margin-bottom:20px}</style></head><body><div class="container"><div class="icon">🚫</div>
      <h1>Acceso Restringido</h1><p>El sistema de mensajería está disponible solo para médicos y enfermeros.</p>
      <p><strong>Usuario:</strong> ${req.session.user.nombre_usuario} (Paciente)</p>
      <p>Como paciente, puedes ver información general pero no acceder a la mensajería interna del personal médico.</p>
      <a href="/dashboard" class="menu-btn">Volver al Dashboard</a></div></body></html>
    `);
  }
}

// ========== RUTAS PÚBLICAS ==========
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/registrar', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'registrar.html'));
});

// ========== REGISTRO ESPECÍFICO PARA PACIENTES ==========
app.get('/registro-paciente', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Registro de Paciente</title>
      <link rel="stylesheet" href="/styles.css">
      <style>
        .container {
          max-width: 600px;
          margin: 50px auto;
          padding: 30px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: #333;
        }
        input[type="text"],
        input[type="password"] {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 16px;
          box-sizing: border-box;
        }
        button {
          background: #4CAF50;
          color: white;
          padding: 12px 25px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          width: 100%;
        }
        button:hover {
          background: #45a049;
        }
        .error {
          color: #ff0000;
          background: #ffe6e6;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .success {
          color: #008000;
          background: #e6ffe6;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .info {
          color: #666;
          font-size: 14px;
          margin-top: 5px;
        }
        .links {
          margin-top: 20px;
          text-align: center;
        }
        .links a {
          color: #0066cc;
          text-decoration: none;
          margin: 0 10px;
        }
        .links a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Registro de Paciente</h2>
        
        <div id="message"></div>
        
        <form id="registroForm">
          <div class="form-group">
            <label>Nombre de Usuario:</label>
            <input type="text" name="nombre_usuario" required>
            <div class="info">Este será tu nombre para iniciar sesión</div>
          </div>
          
          <div class="form-group">
            <label>Contraseña:</label>
            <input type="password" name="password" required>
            <div class="info">Mínimo 6 caracteres</div>
          </div>
          
          <div class="form-group">
            <label>Confirmar Contraseña:</label>
            <input type="password" name="confirm_password" required>
          </div>
          
          <div class="form-group">
            <label>Nombre Completo:</label>
            <input type="text" name="nombre" required>
            <div class="info">Tu nombre real completo</div>
          </div>
          
          <div class="form-group">
            <label>Causa/Diagnóstico:</label>
            <input type="text" name="causa" required>
            <div class="info">Ejemplo: Diabetes, Hipertensión, etc.</div>
          </div>
          
          <div class="form-group">
            <label>Código de Paciente:</label>
            <input type="text" name="codigo_paciente" value="PAC789" readonly>
            <div class="info">Usa este código especial para pacientes</div>
          </div>
          
          <button type="submit">Registrarse</button>
        </form>
        
        <div class="links">
          <a href="/login">¿Ya tienes cuenta? Inicia Sesión</a>
          <a href="/">Volver al Inicio</a>
        </div>
      </div>
      
      <script>
        document.getElementById('registroForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const formData = new FormData(this);
          const data = Object.fromEntries(formData.entries());
          
          if (data.password !== data.confirm_password) {
            showMessage('Las contraseñas no coinciden', 'error');
            return;
          }
          
          if (data.password.length < 6) {
            showMessage('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
          }
          
          try {
            const response = await fetch('/registro-paciente', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success) {
                showMessage('✅ ' + result.message + ' Redirigiendo...', 'success');
                setTimeout(() => {
                  window.location.href = '/login';
                }, 2000);
              } else {
                showMessage('❌ ' + result.error, 'error');
              }
            } else {
              const error = await response.json();
              showMessage('❌ ' + (error.error || 'Error en el servidor'), 'error');
            }
          } catch (error) {
            showMessage('❌ Error de conexión: ' + error.message, 'error');
          }
        });
        
        function showMessage(text, type) {
          const messageDiv = document.getElementById('message');
          messageDiv.innerHTML = '<div class="' + type + '">' + text + '</div>';
        }
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

app.post('/registro-paciente', async (req, res) => {
  try {
    const { nombre_usuario, password, nombre, causa, codigo_paciente } = req.body;

    if (!nombre_usuario || !password || !nombre || !causa) {
      return res.status(400).json({ 
        success: false, 
        error: 'Todos los campos son requeridos' 
      });
    }

    if (codigo_paciente !== 'PAC789') {
      return res.status(400).json({ 
        success: false, 
        error: 'Código de paciente inválido. Usa: PAC789' 
      });
    }

    console.log('📍 Intento de registro de paciente:', nombre_usuario);

    db.beginTransaction(async (transactionErr) => {
      if (transactionErr) {
        console.error('Error al iniciar transacción:', transactionErr);
        return res.status(500).json({ 
          success: false, 
          error: 'Error interno del servidor' 
        });
      }

      try {
        const usuarioExistente = await new Promise((resolve, reject) => {
          db.query('SELECT id FROM usuarios WHERE nombre_usuario = ?', 
            [nombre_usuario], 
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });

        if (usuarioExistente.length > 0) {
          db.rollback(() => {});
          return res.status(400).json({ 
            success: false, 
            error: 'El nombre de usuario ya existe' 
          });
        }

        const hash = await bcrypt.hash(password, 10);

        const usuarioResult = await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)',
            [nombre_usuario, hash, 'paciente'],
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });

        const usuarioId = usuarioResult.insertId;
        console.log('📍 Usuario creado con ID:', usuarioId);

        await new Promise((resolve, reject) => {
          db.query(
            'INSERT INTO pacientes (nombre, causa, fecha_registro, usuario_id) VALUES (?, ?, NOW(), ?)',
            [nombre, causa, usuarioId],
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });

        console.log('📍 Paciente registrado:', nombre);

        db.commit((commitErr) => {
          if (commitErr) {
            console.error('Error al confirmar transacción:', commitErr);
            db.rollback(() => {});
            return res.status(500).json({ 
              success: false, 
              error: 'Error al confirmar registro' 
            });
          }

          res.json({ 
            success: true, 
            message: 'Paciente ' + nombre + ' registrado exitosamente. Ahora puedes iniciar sesión.',
            usuario: nombre_usuario
          });
        });

      } catch (error) {
        db.rollback(() => {});
        console.error('Error en registro:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ 
            success: false, 
            error: 'El nombre de usuario ya existe' 
          });
        }
        
        res.status(500).json({ 
          success: false, 
          error: 'Error al registrar paciente: ' + error.message 
        });
      }
    });

  } catch (error) {
    console.error('Error general:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor: ' + error.message 
    });
  }
});

// ========== ARCHIVOS ESTÁTICOS ==========
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/pdf'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel o PDF'), false);
    }
  },
  limits: { 
    fileSize: 10 * 1024 * 1024,
    fields: 0,
    files: 1
  }
});

// ========== DEBUGGING DE BASE DE DATOS ==========
app.get('/debug/db-status', requireLogin, (req, res) => {
  db.query('SHOW TABLES', (err, tables) => {
    if (err) {
      return res.json({ 
        status: 'error', 
        message: 'Error en conexión DB', 
        error: err.message 
      });
    }
    
    db.query('DESCRIBE mensajes', (err2, mensajesStructure) => {
      if (err2) {
        console.log('⚠️ Tabla mensajes no existe, intentando crearla...');
        createMensajesTable();
        return res.json({ 
          status: 'warning', 
          message: 'Tabla mensajes no existe, creándola...',
          tables: tables.map(t => t[Object.keys(t)[0]])
        });
      }
      
      res.json({
        status: 'ok',
        message: 'Conexión a DB establecida',
        tables: tables.map(t => t[Object.keys(t)[0]]),
        mensajes_structure: mensajesStructure
      });
    });
  });
});

// ========== DASHBOARD COMPLETO ==========
app.get('/dashboard', requireLogin, async (req, res) => {
  const user = req.session.user;
  
  try {
    let pacienteId = null;
    if (user.tipo_usuario === 'paciente') {
      const pacienteResult = await new Promise((resolve, reject) => {
        db.query('SELECT id FROM pacientes WHERE usuario_id = ?', [user.id], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      
      if (pacienteResult.length > 0) {
        pacienteId = pacienteResult[0].id;
      }
    }
    
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM pacientes) as total_pacientes,
        (SELECT COUNT(*) FROM medicamentos) as total_medicamentos,
        (SELECT COUNT(*) FROM maquinas WHERE estado = 'Disponible') as total_dispositivos,
        (SELECT COUNT(*) FROM mensajes WHERE destinatario_id = ? AND leido = FALSE) as mensajes_no_leidos,
        (SELECT COUNT(*) FROM citas WHERE estado = 'pendiente') as citas_pendientes,
        (SELECT COUNT(*) FROM citas WHERE paciente_id = ?) as mis_citas,
        (SELECT COUNT(*) FROM historiales_clinicos WHERE paciente_id = ?) as mis_historiales
    `;
    
    const queryParams = user.tipo_usuario === 'paciente' ? [user.id, pacienteId || 0, pacienteId || 0] : [user.id, 0, 0];
    
    const statsResults = await new Promise((resolve, reject) => {
      db.query(statsQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const stats = statsResults[0] || {};
    
    // HTML completo del dashboard
    let html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard Hospitalario</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .dashboard-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
          }
          
          .welcome-section {
            background: linear-gradient(135deg, #608cecff 0%, #5df5b6ff 100%);
            color: white;
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          }
          
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin-bottom: 30px;
          }
          
          .stat-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
            border-left: 5px solid;
          }
          
          .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
          }
          
          .stat-card.pacientes { border-left-color: #2196F3; }
          .stat-card.medicamentos { border-left-color: #2196F3; }
          .stat-card.dispositivos { border-left-color: #2196F3; }
          .stat-card.mensajes { border-left-color: #2196F3; }
          .stat-card.citas { border-left-color: #2196F3; }
          .stat-card.mis-citas { border-left-color: #2196F3; }
          .stat-card.historiales { border-left-color: #2196F3; }
          
          .stat-number {
            font-size: 48px;
            font-weight: bold;
            margin: 10px 0;
          }
          
          .stat-title {
            font-size: 18px;
            color: #666;
            margin-bottom: 15px;
          }
          
          .modules-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 25px;
          }
          
          .module-card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          }
          
          .module-card h3 {
            color: #2c3e50;
            margin-top: 0;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
          }
          
          .module-list {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .module-list li {
            margin-bottom: 12px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
            transition: background 0.3s;
          }
          
          .module-list li:hover {
            background: #e9ecef;
          }
          
          .module-list a {
            text-decoration: none;
            color: #333;
            display: flex;
            align-items: center;
            font-weight: 500;
          }
          
          .module-list a:hover {
            color: #2196F3;
          }
          
          .icon {
            margin-right: 12px;
            font-size: 18px;
          }
          
          .message-widget {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            margin-top: 30px;
            border: 2px solid #e3f2fd;
          }
          
          .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e3f2fd;
          }
          
          .message-badge {
            background: #ff6b6b;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
          }
          
          .message-list {
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 20px;
          }
          
          .message-item {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 10px;
            background: #f8f9fa;
            border-left: 4px solid #2196F3;
          }
          
          .message-item.unread {
            background: #e3f2fd;
            border-left-color: #1976D2;
          }
          
          .message-sender {
            font-weight: bold;
            color: #2c3e50;
          }
          
          .message-preview {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          
          .message-time {
            font-size: 12px;
            color: #999;
            margin-top: 5px;
          }
          
          .btn-messaging {
            display: inline-block;
            background: #2196F3;
            color: white;
            padding: 12px 25px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            transition: background 0.3s;
          }
          
          .btn-messaging:hover {
            background: #1976D2;
            color: white;
          }
          
          .user-badge {
            display: inline-block;
            background: ${user.tipo_usuario === 'medico' ? '#4CAF50' : user.tipo_usuario === 'enfermero' ? '#2196F3' : '#9C27B0'};
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
          }
          
          @media (max-width: 768px) {
            .stats-grid,
            .modules-grid {
              grid-template-columns: 1fr;
            }
            
            .dashboard-container {
              padding: 10px;
            }
          }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        
        <div class="dashboard-container">
          <div class="welcome-section">
            <h1 style="color: white;">🏥 Bienvenido, ${user.nombre_usuario} <span class="user-badge">${user.tipo_usuario.toUpperCase()}</span></h1>
            <p style="color: white;">Sistema de Gestión Hospitalaria - Panel de Control</p>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card pacientes">
              <div class="stat-title">Pacientes Registrados</div>
              <div class="stat-number">${stats.total_pacientes || 0}</div>
              <div>Total en el sistema</div>
            </div>
    `;
    
    if (user.tipo_usuario !== 'paciente') {
      html += `
            <div class="stat-card medicamentos">
              <div class="stat-title">Medicamentos en Inventario</div>
              <div class="stat-number">${stats.total_medicamentos || 0}</div>
              <div>Disponibles para uso</div>
            </div>
            
            <div class="stat-card dispositivos">
              <div class="stat-title">Dispositivos Disponibles</div>
              <div class="stat-number">${stats.total_dispositivos || 0}</div>
              <div>Equipos médicos listos</div>
            </div>
      `;
    }
    
    if (user.tipo_usuario === 'paciente') {
      html += `
            <div class="stat-card mis-citas">
              <div class="stat-title">Mis Citas Programadas</div>
              <div class="stat-number">${stats.mis_citas || 0}</div>
              <div>Total de mis citas</div>
            </div>
            
            <div class="stat-card historiales">
              <div class="stat-title">Registros en Mi Historial</div>
              <div class="stat-number">${stats.mis_historiales || 0}</div>
              <div>Consultas médicas</div>
            </div>
      `;
    }
    
    if (user.tipo_usuario === 'medico') {
      html += `
            <div class="stat-card citas">
              <div class="stat-title">Citas Pendientes</div>
              <div class="stat-number">${stats.citas_pendientes || 0}</div>
              <div>Por atender</div>
            </div>
      `;
    }
    
    if (user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero') {
      html += `
            <div class="stat-card mensajes">
              <div class="stat-title">Mensajes Nuevos</div>
              <div class="stat-number">${stats.mensajes_no_leidos || 0}</div>
              <div>Por leer en mensajería</div>
            </div>
      `;
    }
    
    html += `
          </div>
          
          <div class="modules-grid">
            <div class="module-card">
              <h3>👥 Pacientes</h3>
              <ul class="module-list">
                <li><a href="/ver-pacientes"><span class="icon">📋</span> Ver Pacientes Registrados</a></li>
    `;
    
    if (user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero') {
      html += `
                <li><a href="/agregar-paciente"><span class="icon">➕</span> Agregar Nuevo Paciente</a></li>
                <li><a href="/eliminar-paciente"><span class="icon">🗑️</span> Eliminar Paciente</a></li>
      `;
    }
    
    html += `
              </ul>
            </div>
            
            <div class="module-card">
              <h3>📅 Citas Médicas</h3>
              <ul class="module-list">
    `;
    
    if (user.tipo_usuario === 'paciente') {
      html += `
                <li><a href="/ver-mis-citas"><span class="icon">📋</span> Ver Mis Citas</a></li>
                <li><a href="/solicitar-cita"><span class="icon">➕</span> Solicitar Nueva Cita</a></li>
      `;
    }
    
    if (user.tipo_usuario === 'medico') {
      html += `
                <li><a href="/ver-citas"><span class="icon">📋</span> Ver Todas las Citas</a></li>
                <li><a href="/ver-citas-pendientes"><span class="icon">⏳</span> Ver Citas Pendientes</a></li>
                <li><a href="/horarios-medico"><span class="icon">⏰</span> Gestionar Horarios</a></li>
      `;
    }
    
    html += `
              </ul>
            </div>
            
            <div class="module-card">
              <h3>📋 Historiales Clínicos</h3>
              <ul class="module-list">
    `;
    
    if (user.tipo_usuario === 'paciente') {
      html += `
                <li><a href="/ver-mi-historial"><span class="icon">📋</span> Ver Mi Historial Clínico</a></li>
      `;
    }
    
    if (user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero') {
      html += `
                <li><a href="/ver-historiales"><span class="icon">📋</span> Ver Historiales Clínicos</a></li>
                <li><a href="/agregar-historial"><span class="icon">➕</span> Agregar Historial</a></li>
      `;
    }
    
    html += `
              </ul>
            </div>
    `;
    
    if (user.tipo_usuario !== 'paciente') {
      html += `
            <div class="module-card">
              <h3>💊 Medicamentos</h3>
              <ul class="module-list">
                <li><a href="/ver-medicamentos"><span class="icon">📦</span> Ver Medicamentos</a></li>
      `;
      
      if (user.tipo_usuario === 'medico') {
        html += `
                <li><a href="/agregar-medicamento"><span class="icon">➕</span> Agregar Medicamento</a></li>
                <li><a href="/eliminar-medicamento"><span class="icon">🗑️</span> Eliminar Medicamento</a></li>
        `;
      }
      
      html += `
              </ul>
            </div>
            
            <div class="module-card">
              <h3>🩺 Dispositivos Médicos</h3>
              <ul class="module-list">
                <li><a href="/ver-dispositivos"><span class="icon">⚙️</span> Ver Dispositivos</a></li>
      `;
      
      if (user.tipo_usuario === 'medico') {
        html += `
                <li><a href="/agregar-dispositivo"><span class="icon">➕</span> Agregar Dispositivo</a></li>
                <li><a href="/eliminar-dispositivo"><span class="icon">🗑️</span> Eliminar Dispositivo</a></li>
        `;
      }
      
      html += `
              </ul>
            </div>
      `;
    }
    
    if (user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero') {
      html += `
            <div class="module-card">
              <h3>📁 Archivos</h3>
              <ul class="module-list">
                <li><a href="/subir-archivo"><span class="icon">📤</span> Subir Archivos</a></li>
                <li><a href="/descargar-archivos"><span class="icon">📥</span> Descargar Archivos</a></li>
              </ul>
            </div>
            
            <div class="module-card">
              <h3>📊 Reportes Excel</h3>
              <ul class="module-list">
                <li><a href="/descargar-excel"><span class="icon">📊</span> Descargar Reportes Excel</a></li>
                <li><a href="/descargar-excel-pacientes"><span class="icon">👥</span> Excel de Pacientes</a></li>
                <li><a href="/descargar-excel-medicamentos"><span class="icon">💊</span> Excel de Medicamentos</a></li>
                <li><a href="/descargar-excel-dispositivos"><span class="icon">🩺</span> Excel de Dispositivos</a></li>
                <li><a href="/descargar-excel-citas"><span class="icon">📅</span> Excel de Citas</a></li>
                <li><a href="/descargar-excel-historiales"><span class="icon">📋</span> Excel de Historiales</a></li>
              </ul>
            </div>
      `;
    }
    
    html += `
          </div>
    `;
    
    if (user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero') {
      html += `
          <div class="message-widget" id="message-widget">
            <div class="message-header">
              <h3>💬 Mensajería Interna</h3>
              <div>
                ${stats.mensajes_no_leidos > 0 ? `<span class="message-badge">${stats.mensajes_no_leidos}</span>` : ''}
              </div>
            </div>
            
            <div class="message-list" id="recent-messages">
              <div style="text-align: center; padding: 20px; color: #666;">
                Cargando mensajes recientes...
              </div>
            </div>
            
            <div style="text-align: center;">
              <a href="/mensajeria" class="btn-messaging">Ir a Mensajería Completa</a>
            </div>
          </div>
          
          <script>
            function loadRecentMessages() {
              fetch('/api/mensajes/recientes')
                .then(response => response.json())
                .then(data => {
                  const container = document.getElementById('recent-messages');
                  
                  if (data.mensajes && data.mensajes.length > 0) {
                    let html = '';
                    data.mensajes.forEach(msg => {
                      const time = new Date(msg.fecha_envio).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      
                      const date = new Date(msg.fecha_envio).toLocaleDateString('es-ES');
                      
                      html += '<div class="message-item ' + (msg.leido ? '' : 'unread') + '">' +
                                '<div class="message-sender">' +
                                  (msg.es_remitente ? '🟢 Tú' : '🔵 ' + msg.remitente_nombre) +
                                  '<span style="float: right; font-size: 12px; font-weight: normal;">' +
                                    date + ' ' + time +
                                  '</span>' +
                                '</div>' +
                                '<div class="message-preview">' +
                                  msg.mensaje.substring(0, 50) + (msg.mensaje.length > 50 ? '...' : '') +
                                '</div>' +
                                (!msg.leido && !msg.es_remitente ? '<div style="font-size: 10px; color: #2196F3; margin-top: 5px;">🆕 No leído</div>' : '') +
                              '</div>';
                    });
                    
                    container.innerHTML = html;
                  } else {
                    container.innerHTML = 
                      '<div style="text-align: center; padding: 30px; color: #666;">' +
                        '<p>No tienes mensajes todavía</p>' +
                        '<p><small>¡Envía tu primer mensaje a un colega!</small></p>' +
                      '</div>';
                  }
                })
                .catch(error => {
                  console.error('Error cargando mensajes:', error);
                  document.getElementById('recent-messages').innerHTML = 
                    '<div style="text-align: center; padding: 20px; color: #ff6b6b;">Error cargando mensajes</div>';
                });
            }
            
            loadRecentMessages();
            setInterval(loadRecentMessages, 30000);
          </script>
      `;
    }
    
    html += `
        </div>
        
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => {
              console.error('Error cargando navbar:', error);
              document.getElementById('navbar-container').innerHTML = 
                '<nav><ul><li><a href="/dashboard">🏠 Inicio</a></li><li><a href="/logout">🚪 Cerrar Sesión</a></li></ul></nav>';
            });
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).send('Error del servidor');
  }
});

// ========== APIs UTILES ==========
app.get('/api/contar-pacientes', requireLogin, (req, res) => {
  db.query('SELECT COUNT(*) as total FROM pacientes', (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en la base de datos', details: err.message });
    res.json({ total: results[0].total });
  });
});

app.get('/api/contar-medicamentos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT COUNT(*) as total FROM medicamentos', (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en la base de datos', details: err.message });
    res.json({ total: results[0].total });
  });
});

app.get('/api/contar-dispositivos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query("SELECT COUNT(*) as total FROM maquinas WHERE estado = 'Disponible'", (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en la base de datos', details: err.message });
    res.json({ total: results[0].total });
  });
});

app.get('/api/usuario-actual', requireLogin, (req, res) => {
  res.json({
    id: req.session.user.id,
    nombre_usuario: req.session.user.nombre_usuario,
    tipo_usuario: req.session.user.tipo_usuario
  });
});

app.get('/tipo-usuario', requireLogin, (req, res) => {
  res.json({ tipo_usuario: req.session.user.tipo_usuario });
});

app.get('/logout', (req, res) => {
  console.log('📍 Logout de usuario:', req.session.user?.nombre_usuario);
  req.session.destroy();
  res.redirect('/');
});

// ========== AUTENTICACIÓN ==========
app.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;
  if (!nombre_usuario || !password) return res.status(400).send('Usuario y contraseña son requeridos');

  console.log('📍 Intento de login para usuario:', nombre_usuario);
  db.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', [nombre_usuario], async (err, results) => {
    if (err) {
      console.error('Error en consulta:', err);
      return res.status(500).send('Error del servidor');
    }
    if (results.length === 0) {
      console.log('📍 Usuario no encontrado:', nombre_usuario);
      return res.send('Usuario no encontrado');
    }

    const usuario = results[0];
    try {
      const match = await bcrypt.compare(password, usuario.password_hash);
      if (!match) {
        console.log('📍 Contraseña incorrecta para usuario:', nombre_usuario);
        return res.send('Contraseña incorrecta');
      }

      req.session.user = {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        tipo_usuario: usuario.tipo_usuario
      };

      console.log('📍 Login exitoso para:', req.session.user.nombre_usuario, 'Tipo:', req.session.user.tipo_usuario);
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Error en bcrypt:', error);
      res.status(500).send('Error del servidor');
    }
  });
});

app.post('/registrar', async (req, res) => {
  const { nombre_usuario, password, codigo_acceso } = req.body;
  if (!nombre_usuario || !password || !codigo_acceso) return res.send('Todos los campos son requeridos');

  console.log('📍 Intento de registro para usuario:', nombre_usuario);
  db.query('SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?', [codigo_acceso], async (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.send('Error en la base de datos');
    }
    if (results.length === 0) {
      console.log('📍 Código de acceso inválido:', codigo_acceso);
      return res.send('Código de acceso inválido');
    }

    const tipo_usuario = results[0].tipo_usuario;
    console.log('📍 Tipo de usuario asignado:', tipo_usuario);
    try {
      const hash = await bcrypt.hash(password, 10);
      db.query('INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)',
        [nombre_usuario, hash, tipo_usuario], (err) => {
          if (err) {
            console.error('Error al registrar:', err);
            return res.send('Error al registrar usuario (¿usuario ya existe?)');
          }
          console.log('📍 Usuario registrado exitosamente:', nombre_usuario);
          res.redirect('/login');
        }
      );
    } catch (error) {
      console.error('Error en bcrypt:', error);
      res.status(500).send('Error del servidor');
    }
  });
});

// ========== NAVBAR DINÁMICO ==========
app.get('/navbar', requireLogin, (req, res) => {
  const tipo = req.session.user.tipo_usuario;
  const userId = req.session.user.id;
  
  const getUnreadCount = (callback) => {
    if (tipo === 'medico' || tipo === 'enfermero') {
      db.query('SELECT COUNT(*) as count FROM mensajes WHERE destinatario_id = ? AND leido = FALSE', 
        [userId], (err, countResults) => {
          callback(err ? 0 : countResults[0]?.count || 0);
        });
    } else {
      callback(0);
    }
  };

  getUnreadCount((unreadCount) => {
    let badge = unreadCount > 0 ? `<span id="message-badge" style="background: red; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; margin-left: 5px;">${unreadCount}</span>` : '';
    
    let menu = `<nav><ul><li><a href="/dashboard">🏠 Inicio</a></li>`;
    if (tipo === 'medico' || tipo === 'enfermero') menu += `<li><a href="/mensajeria">💬 Mensajes ${badge}</a></li>`;
    
    if (tipo === 'medico') {
      menu += `
        <li><a href="/ver-pacientes">👥 Ver Pacientes</a></li>
        <li><a href="/ver-medicamentos">💊 Ver Medicamentos</a></li>
        <li><a href="/ver-dispositivos">🩺 Ver Dispositivos</a></li>
        <li><a href="/ver-citas">📅 Ver Citas</a></li>
        <li><a href="/ver-historiales">📋 Ver Historiales</a></li>
        <li><a href="/horarios-medico">⏰ Gestionar Horarios</a></li>
        <li><a href="/agregar-paciente">➕ Agregar Paciente</a></li>
        <li><a href="/agregar-medicamento">➕ Agregar Medicamento</a></li>
        <li><a href="/agregar-dispositivo">➕ Agregar Dispositivo</a></li>
        <li><a href="/agregar-historial">➕ Agregar Historial</a></li>
        <li><a href="/eliminar-paciente">🗑️ Eliminar Paciente</a></li>
        <li><a href="/eliminar-medicamento">🗑️ Eliminar Medicamento</a></li>
        <li><a href="/eliminar-dispositivo">🗑️ Eliminar Dispositivo</a></li>
        <li><a href="/subir-archivo">📤 Subir Archivos</a></li>
        <li><a href="/descargar-archivos">📥 Descargar archivos</a></li>
        <li><a href="/descargar-excel">📊 Descargar Excel</a></li>
      `;
    } else if (tipo === 'enfermero') {
      menu += `
        <li><a href="/ver-pacientes">👥 Ver Pacientes</a></li>
        <li><a href="/ver-medicamentos">💊 Ver Medicamentos</a></li>
        <li><a href="/ver-dispositivos">🩺 Ver Dispositivos</a></li>
        <li><a href="/ver-historiales">📋 Ver Historiales</a></li>
        <li><a href="/agregar-paciente">➕ Agregar Paciente</a></li>
        <li><a href="/agregar-historial">➕ Agregar Historial</a></li>
        <li><a href="/eliminar-paciente">🗑️ Eliminar Paciente</a></li>
        <li><a href="/subir-archivo">📤 Subir Archivos</a></li>
        <li><a href="/descargar-archivos">📥 Descargar archivos</a></li>
        <li><a href="/descargar-excel">📊 Descargar Excel</a></li>
      `;
    } else if (tipo === 'paciente') {
      menu += `
        <li><a href="/ver-pacientes">👥 Ver Otros Pacientes</a></li>
        <li><a href="/ver-mis-citas">📅 Ver Mis Citas</a></li>
        <li><a href="/ver-mi-historial">📋 Ver Mi Historial</a></li>
        <li><a href="/solicitar-cita">➕ Solicitar Cita</a></li>
      `;
    }
    
    menu += `<li><a href="/logout">🚪 Cerrar Sesión</a></li></ul></nav>`;
    res.send(menu);
  });
});

// ========== RUTAS DE ARCHIVOS ==========
app.get('/subir-archivo', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subir-archivo.html'));
});

app.get('/archivos-subidos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT * FROM archivos_subidos', (error, results) => {
    if (error) return res.status(500).json({ error: 'Error en base de datos' });
    res.json(results);
  });
});

app.get('/descargar-archivos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'descargar-archivos.html'));
});

app.post('/upload', requireLogin, requireRole('medico', 'enfermero'), upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
  const usuario = req.session.user.nombre_usuario || "admin";
  
  db.query('INSERT INTO archivos_subidos (nombre_archivo, tipo, usuario, ruta) VALUES (?, ?, ?, ?)',
    [req.file.originalname, req.file.mimetype, usuario, req.file.path],
    (error) => {
      if (error) {
        console.error("Error al guardar en BD:", error);
        return res.status(500).json({ error: "Error en base de datos" });
      }
      res.json({ success: true, message: 'Archivo subido y registrado correctamente', archivo: req.file.originalname });
    }
  );
});

app.get('/generar-zip', requireLogin, requireRole('medico', 'enfermero'), async (req, res) => {
  try {
    db.query('SELECT * FROM archivos_subidos', (error, archivos) => {
      if (error) throw error;
      
      if (archivos.length === 0) {
        return res.status(404).json({ error: 'No hay archivos disponibles' });
      }

      const zip = new JSZip();
      let archivosAgregados = 0;
      
      archivos.forEach(archivo => {
        if (fs.existsSync(archivo.ruta)) {
          zip.file(archivo.nombre_archivo, fs.readFileSync(archivo.ruta));
          archivosAgregados++;
        }
      });

      if (archivosAgregados === 0) {
        return res.status(404).json({ error: 'No se encontraron archivos válidos' });
      }

      zip.generateAsync({ type: 'nodebuffer' }).then(zipData => {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=archivos.zip');
        res.send(zipData);
      });
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al generar archivo ZIP',
      details: error.message
    });
  }
});

// ========== RUTAS PARA DESCARGAR EXCEL ==========
app.get('/descargar-excel-pacientes', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT * FROM pacientes ORDER BY id', (err, results) => {
    if (err) {
      console.error('❌ Error al obtener pacientes para Excel:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).send('No hay pacientes registrados');
    }

    try {
      const datos = results.map(p => ({
        ID: p.id,
        Nombre: p.nombre,
        Causa: p.causa,
        'Fecha Registro': new Date(p.fecha_registro).toLocaleDateString('es-ES'),
        'Usuario ID': p.usuario_id || 'N/A'
      }));

      const buffer = crearExcel('pacientes', datos, ['ID', 'Nombre', 'Causa', 'Fecha Registro', 'Usuario ID']);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=pacientes.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);
      res.status(500).send('Error al generar archivo Excel');
    }
  });
});

app.get('/descargar-excel-medicamentos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT * FROM medicamentos ORDER BY id', (err, results) => {
    if (err) {
      console.error('❌ Error al obtener medicamentos para Excel:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).send('No hay medicamentos registrados');
    }

    try {
      const datos = results.map(m => ({
        ID: m.id,
        Nombre: m.nombre,
        Función: m.funcion
      }));

      const buffer = crearExcel('medicamentos', datos, ['ID', 'Nombre', 'Función']);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=medicamentos.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);
      res.status(500).send('Error al generar archivo Excel');
    }
  });
});

app.get('/descargar-excel-dispositivos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT * FROM maquinas ORDER BY id', (err, results) => {
    if (err) {
      console.error('❌ Error al obtener dispositivos para Excel:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).send('No hay dispositivos médicos registrados');
    }

    try {
      const datos = results.map(d => ({
        ID: d.id,
        Nombre: d.nombre,
        Tipo: d.tipo,
        Estado: d.estado
      }));

      const buffer = crearExcel('dispositivos', datos, ['ID', 'Nombre', 'Tipo', 'Estado']);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=dispositivos_medicos.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);
      res.status(500).send('Error al generar archivo Excel');
    }
  });
});

app.get('/descargar-excel-citas', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const query = `
    SELECT 
      c.id,
      p.nombre as paciente_nombre,
      u.nombre_usuario as medico_nombre,
      c.fecha,
      c.hora,
      c.tipo_cita,
      c.motivo,
      c.estado,
      c.fecha_creacion
    FROM citas c
    LEFT JOIN pacientes p ON c.paciente_id = p.id
    LEFT JOIN usuarios u ON c.medico_id = u.id
    ORDER BY c.fecha DESC, c.hora DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error al obtener citas para Excel:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).send('No hay citas registradas');
    }

    try {
      const datos = results.map(c => ({
        ID: c.id,
        Paciente: c.paciente_nombre,
        Médico: c.medico_nombre,
        Fecha: new Date(c.fecha).toLocaleDateString('es-ES'),
        Hora: c.hora,
        'Tipo Cita': c.tipo_cita,
        Motivo: c.motivo,
        Estado: c.estado,
        'Fecha Creación': new Date(c.fecha_creacion).toLocaleDateString('es-ES')
      }));

      const buffer = crearExcel('citas', datos, ['ID', 'Paciente', 'Médico', 'Fecha', 'Hora', 'Tipo Cita', 'Motivo', 'Estado', 'Fecha Creación']);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=citas.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);
      res.status(500).send('Error al generar archivo Excel');
    }
  });
});

app.get('/descargar-excel-historiales', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const query = `
    SELECT 
      hc.id,
      p.nombre as paciente_nombre,
      u.nombre_usuario as medico_nombre,
      hc.fecha_consulta,
      hc.motivo_consulta,
      hc.diagnostico,
      hc.tratamiento,
      hc.medicamentos_prescritos,
      hc.fecha_creacion
    FROM historiales_clinicos hc
    LEFT JOIN pacientes p ON hc.paciente_id = p.id
    LEFT JOIN usuarios u ON hc.medico_id = u.id
    ORDER BY hc.fecha_consulta DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error al obtener historiales para Excel:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).send('No hay historiales clínicos registrados');
    }

    try {
      const datos = results.map(h => ({
        ID: h.id,
        Paciente: h.paciente_nombre,
        Médico: h.medico_nombre,
        'Fecha Consulta': new Date(h.fecha_consulta).toLocaleDateString('es-ES'),
        'Motivo Consulta': h.motivo_consulta,
        Diagnóstico: h.diagnostico || 'No especificado',
        Tratamiento: h.tratamiento || 'No especificado',
        'Medicamentos Prescritos': h.medicamentos_prescritos || 'No especificado',
        'Fecha Creación': new Date(h.fecha_creacion).toLocaleDateString('es-ES')
      }));

      const buffer = crearExcel('historiales_clinicos', datos, ['ID', 'Paciente', 'Médico', 'Fecha Consulta', 'Motivo Consulta', 'Diagnóstico', 'Tratamiento', 'Medicamentos Prescritos', 'Fecha Creación']);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=historiales_clinicos.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);
      res.status(500).send('Error al generar archivo Excel');
    }
  });
});

app.get('/descargar-todos-excel', requireLogin, requireRole('medico', 'enfermero'), async (req, res) => {
  try {
    const zip = new JSZip();
    
    const agregarAlZip = (nombreTabla, query, callback) => {
      return new Promise((resolve, reject) => {
        db.query(query, (err, results) => {
          if (err) return reject(err);
          callback(results);
          resolve();
        });
      });
    };
    
    await agregarAlZip('pacientes', 'SELECT * FROM pacientes ORDER BY id', (results) => {
      if (results.length > 0) {
        const datos = results.map(p => ({
          ID: p.id,
          Nombre: p.nombre,
          Causa: p.causa,
          'Fecha Registro': new Date(p.fecha_registro).toLocaleDateString('es-ES'),
          'Usuario ID': p.usuario_id || 'N/A'
        }));
        
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(datos);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        zip.file('pacientes.xlsx', buffer);
      }
    });
    
    await agregarAlZip('medicamentos', 'SELECT * FROM medicamentos ORDER BY id', (results) => {
      if (results.length > 0) {
        const datos = results.map(m => ({
          ID: m.id,
          Nombre: m.nombre,
          Función: m.funcion
        }));
        
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(datos);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        zip.file('medicamentos.xlsx', buffer);
      }
    });
    
    await agregarAlZip('maquinas', 'SELECT * FROM maquinas ORDER BY id', (results) => {
      if (results.length > 0) {
        const datos = results.map(d => ({
          ID: d.id,
          Nombre: d.nombre,
          Tipo: d.tipo,
          Estado: d.estado
        }));
        
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(datos);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        zip.file('dispositivos_medicos.xlsx', buffer);
      }
    });
    
    const citasQuery = `
      SELECT 
        c.id,
        p.nombre as paciente_nombre,
        u.nombre_usuario as medico_nombre,
        c.fecha,
        c.hora,
        c.tipo_cita,
        c.motivo,
        c.estado,
        c.fecha_creacion
      FROM citas c
      LEFT JOIN pacientes p ON c.paciente_id = p.id
      LEFT JOIN usuarios u ON c.medico_id = u.id
      ORDER BY c.fecha DESC, c.hora DESC
    `;
    
    await agregarAlZip('citas', citasQuery, (results) => {
      if (results.length > 0) {
        const datos = results.map(c => ({
          ID: c.id,
          Paciente: c.paciente_nombre,
          Médico: c.medico_nombre,
          Fecha: new Date(c.fecha).toLocaleDateString('es-ES'),
          Hora: c.hora,
          'Tipo Cita': c.tipo_cita,
          Motivo: c.motivo,
          Estado: c.estado,
          'Fecha Creación': new Date(c.fecha_creacion).toLocaleDateString('es-ES')
        }));
        
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(datos);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        zip.file('citas.xlsx', buffer);
      }
    });
    
    const historialesQuery = `
      SELECT 
        hc.id,
        p.nombre as paciente_nombre,
        u.nombre_usuario as medico_nombre,
        hc.fecha_consulta,
        hc.motivo_consulta,
        hc.diagnostico,
        hc.tratamiento,
        hc.medicamentos_prescritos,
        hc.fecha_creacion
      FROM historiales_clinicos hc
      LEFT JOIN pacientes p ON hc.paciente_id = p.id
      LEFT JOIN usuarios u ON hc.medico_id = u.id
      ORDER BY hc.fecha_consulta DESC
    `;
    
    await agregarAlZip('historiales_clinicos', historialesQuery, (results) => {
      if (results.length > 0) {
        const datos = results.map(h => ({
          ID: h.id,
          Paciente: h.paciente_nombre,
          Médico: h.medico_nombre,
          'Fecha Consulta': new Date(h.fecha_consulta).toLocaleDateString('es-ES'),
          'Motivo Consulta': h.motivo_consulta,
          Diagnóstico: h.diagnostico || 'No especificado',
          Tratamiento: h.tratamiento || 'No especificado',
          'Medicamentos Prescritos': h.medicamentos_prescritos || 'No especificado',
          'Fecha Creación': new Date(h.fecha_creacion).toLocaleDateString('es-ES')
        }));
        
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(datos);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        zip.file('historiales_clinicos.xlsx', buffer);
      }
    });
    
    const zipData = await zip.generateAsync({ type: 'nodebuffer' });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=reportes_completos.zip');
    res.send(zipData);
    
  } catch (error) {
    console.error('❌ Error al generar ZIP de Excel:', error);
    res.status(500).send('Error al generar archivos ZIP');
  }
});

app.get('/descargar-excel', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Descargar Reportes Excel</title>
      <link rel="stylesheet" href="/styles.css">
      <style>
        .container {
          max-width: 800px;
          margin: 50px auto;
          padding: 30px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        h1 {
          color: #2c3e50;
          margin-bottom: 30px;
          text-align: center;
        }
        .download-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .download-card {
          background: #f8f9fa;
          border: 2px solid #e9ecef;
          border-radius: 10px;
          padding: 25px;
          text-align: center;
          transition: all 0.3s ease;
        }
        .download-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          border-color: #3498db;
        }
        .download-card h3 {
          margin-top: 0;
          color: #2c3e50;
        }
        .download-btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 12px 25px;
          border-radius: 5px;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin-top: 10px;
          transition: background 0.3s ease;
        }
        .download-btn:hover {
          background: #2980b9;
        }
        .download-btn.pacientes { background: #2ecc71; }
        .download-btn.pacientes:hover { background: #27ae60; }
        .download-btn.medicamentos { background: #e74c3c; }
        .download-btn.medicamentos:hover { background: #c0392b; }
        .download-btn.dispositivos { background: #9b59b6; }
        .download-btn.dispositivos:hover { background: #8e44ad; }
        .download-btn.citas { background: #FF9800; }
        .download-btn.citas:hover { background: #F57C00; }
        .download-btn.historiales { background: #607D8B; }
        .download-btn.historiales:hover { background: #455A64; }
        .download-btn.todos { 
          background: linear-gradient(135deg, #2ecc71, #3498db, #9b59b6, #FF9800, #607D8B);
          font-weight: bold;
          margin-top: 20px;
        }
        .download-btn.todos:hover { 
          background: linear-gradient(135deg, #27ae60, #2980b9, #8e44ad, #F57C00, #455A64);
        }
        .stats {
          background: #f8f9fa;
          border-left: 4px solid #3498db;
          padding: 15px;
          margin-bottom: 20px;
          border-radius: 0 5px 5px 0;
        }
        .info-text {
          color: #666;
          font-size: 14px;
          margin-top: 5px;
        }
        .back-btn {
          display: inline-block;
          margin-top: 20px;
          color: #3498db;
          text-decoration: none;
        }
        .back-btn:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div id="navbar-container"></div>
      <div class="container">
        <h1>📊 Descargar Reportes en Excel</h1>
        
        <div class="stats">
          <p>Selecciona los reportes que deseas descargar en formato Excel (.xlsx)</p>
          <p class="info-text">Los archivos se generan en tiempo real con los datos actuales</p>
        </div>
        
        <div class="download-grid">
          <div class="download-card">
            <h3>👥 Pacientes</h3>
            <p>Listado completo de pacientes registrados</p>
            <a href="/descargar-excel-pacientes" class="download-btn pacientes">
              📥 Descargar Excel
            </a>
          </div>
          
          <div class="download-card">
            <h3>💊 Medicamentos</h3>
            <p>Catálogo de medicamentos disponibles</p>
            <a href="/descargar-excel-medicamentos" class="download-btn medicamentos">
              📥 Descargar Excel
            </a>
          </div>
          
          <div class="download-card">
            <h3>🩺 Dispositivos Médicos</h3>
            <p>Inventario de dispositivos y equipos</p>
            <a href="/descargar-excel-dispositivos" class="download-btn dispositivos">
              📥 Descargar Excel
            </a>
          </div>
          
          <div class="download-card">
            <h3>📅 Citas Médicas</h3>
            <p>Registro de citas programadas</p>
            <a href="/descargar-excel-citas" class="download-btn citas">
              📥 Descargar Excel
            </a>
          </div>
          
          <div class="download-card">
            <h3>📋 Historiales Clínicos</h3>
            <p>Registros médicos de pacientes</p>
            <a href="/descargar-excel-historiales" class="download-btn historiales">
              📥 Descargar Excel
            </a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 40px;">
          <h3>📦 Descarga Completa</h3>
          <p>Obtén todos los reportes en un solo archivo ZIP</p>
          <a href="/descargar-todos-excel" class="download-btn todos">
            📦 Descargar Todos (ZIP)
          </a>
        </div>
        
        <div style="text-align: center; margin-top: 40px;">
          <a href="/dashboard" class="back-btn">← Volver</a>
        </div>
      </div>
      
      <script>
        fetch('/navbar')
          .then(response => response.text())
          .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
          })
          .catch(error => console.error('Error cargando navbar:', error));
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// ========== RUTAS DE PACIENTES ==========
app.get('/ver-pacientes', requireLogin, (req, res) => {
  console.log('👥 Acceso a /ver-pacientes por: ' + req.session.user.nombre_usuario + ' (' + req.session.user.tipo_usuario + ')');
  
  db.query('SELECT * FROM pacientes', (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.send('Error al obtener pacientes.');
    }

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .actions { display: flex; gap: 10px; margin-bottom: 20px; }
          .action-btn { 
            background: #4CAF50; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 5px; 
            cursor: pointer; 
            text-decoration: none; 
            display: inline-block;
          }
          .action-btn:hover { background: #45a049; }
          .action-btn.historial { background: #607D8B; }
          .action-btn.historial:hover { background: #455A64; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>Pacientes Registrados</h1>
          ${req.session.user.tipo_usuario === 'medico' || req.session.user.tipo_usuario === 'enfermero' ? `
          <div class="actions">
            <a href="/agregar-paciente" class="action-btn">➕ Agregar Paciente</a>
            <a href="/agregar-historial" class="action-btn historial">📋 Agregar Historial</a>
          </div>
          ` : ''}
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar paciente por nombre, causa o ID...">
          </div>
          <table class="delete-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Causa</th>
                <th>Fecha de Registro</th>
                ${req.session.user.tipo_usuario === 'medico' || req.session.user.tipo_usuario === 'enfermero' ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach(p => {
      html += `
              <tr>
                <td>${p.id}</td>
                <td><strong>${p.nombre}</strong></td>
                <td>${p.causa}</td>
                <td>${new Date(p.fecha_registro).toLocaleDateString('es-ES', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</td>
                ${req.session.user.tipo_usuario === 'medico' || req.session.user.tipo_usuario === 'enfermero' ? `
                <td>
                  <a href="/ver-historial-paciente/${p.id}" class="action-btn historial" style="padding: 5px 10px; font-size: 14px;">
                    📋 Historial
                  </a>
                </td>
                ` : ''}
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        <script>
          fetch('/navbar')
            .then(response => {
              if (!response.ok) {
                throw new Error('Error al cargar navbar');
              }
              return response.text();
            })
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => {
              console.error('Error cargando navbar:', error);
              document.getElementById('navbar-container').innerHTML = 
                '<nav><ul><li><a href="/dashboard">🏠 Inicio</a></li><li><a href="/logout">🚪 Cerrar Sesión</a></li></ul></nav>';
            });
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const filas = document.querySelectorAll('.delete-table tbody tr');
            
            filas.forEach((fila) => {
              const texto = fila.innerText.toLowerCase();
              fila.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
});

// ========== HISTORIALES CLÍNICOS ==========

// Ver historial clínico de un paciente (para médicos y enfermeros)
app.get('/ver-historial-paciente/:pacienteId', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const pacienteId = req.params.pacienteId;
  
  const query = `
    SELECT 
      hc.*,
      p.nombre as paciente_nombre,
      u.nombre_usuario as medico_nombre
    FROM historiales_clinicos hc
    LEFT JOIN pacientes p ON hc.paciente_id = p.id
    LEFT JOIN usuarios u ON hc.medico_id = u.id
    WHERE hc.paciente_id = ?
    ORDER BY hc.fecha_consulta DESC
  `;
  
  db.query('SELECT * FROM pacientes WHERE id = ?', [pacienteId], (err, pacienteResults) => {
    if (err || pacienteResults.length === 0) {
      console.error('Error obteniendo paciente:', err);
      return res.status(404).send('Paciente no encontrado');
    }
    
    const paciente = pacienteResults[0];
    
    db.query(query, [pacienteId], (err, results) => {
      if (err) {
        console.error('Error obteniendo historial:', err);
        return res.status(500).send('Error al obtener historial clínico.');
      }
      
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Historial Clínico - ${paciente.nombre}</title>
          <style>
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .paciente-info {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 10px;
              margin-bottom: 30px;
              border-left: 5px solid #607D8B;
            }
            .historial-card {
              background: white;
              border-radius: 10px;
              padding: 25px;
              margin-bottom: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              border-left: 5px solid #4CAF50;
            }
            .historial-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 2px solid #f0f0f0;
            }
            .historial-section {
              margin-bottom: 15px;
            }
            .section-title {
              font-weight: bold;
              color: #333;
              margin-bottom: 5px;
              display: flex;
              align-items: center;
            }
            .section-content {
              padding: 10px;
              background: #f8f9fa;
              border-radius: 5px;
              white-space: pre-line;
            }
            .empty-state {
              text-align: center;
              padding: 50px;
              color: #666;
              font-size: 18px;
            }
            .actions {
              display: flex;
              gap: 10px;
              margin-bottom: 20px;
            }
            .action-btn { 
              background: #4CAF50; 
              color: white; 
              padding: 10px 20px; 
              border: none; 
              border-radius: 5px; 
              cursor: pointer; 
              text-decoration: none; 
              display: inline-block;
            }
            .action-btn:hover { background: #45a049; }
            .action-btn.historial { background: #607D8B; }
            .action-btn.historial:hover { background: #455A64; }
            .action-btn.delete { background: #f44336; }
            .action-btn.delete:hover { background: #d32f2f; }
            .action-btn.edit { background: #FF9800; }
            .action-btn.edit:hover { background: #F57C00; }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <div class="paciente-info">
              <h1>📋 Historial Clínico</h1>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h2 style="margin-top: 5px;">${paciente.nombre}</h2>
                  <p><strong>Causa/Diagnóstico:</strong> ${paciente.causa}</p>
                  <p><strong>Fecha de Registro:</strong> ${new Date(paciente.fecha_registro).toLocaleDateString('es-ES')}</p>
                </div>
                <div>
                  <a href="/agregar-historial/${paciente.id}" class="action-btn">➕ Nuevo Registro</a>
                </div>
              </div>
            </div>
            
            <div class="actions">
              <a href="/ver-pacientes" class="action-btn">← Volver a Pacientes</a>
              <a href="/agregar-historial/${paciente.id}" class="action-btn historial">➕ Agregar Registro</a>
            </div>
      `;
      
      if (results.length > 0) {
        results.forEach(historial => {
          const fecha = new Date(historial.fecha_consulta).toLocaleDateString('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          
          html += `
            <div class="historial-card">
              <div class="historial-header">
                <div>
                  <h3 style="margin: 0;">Consulta del ${fecha}</h3>
                  <p style="margin: 5px 0 0 0; color: #666;">Atendido por: ${historial.medico_nombre || 'Médico'}</p>
                </div>
                <div>
                  <a href="/editar-historial/${historial.id}" class="action-btn edit" style="padding: 5px 10px; font-size: 14px;">
                    ✏️ Editar
                  </a>
                  <form action="/eliminar-historial/${historial.id}" method="POST" style="display: inline;">
                    <button type="submit" class="action-btn delete" style="padding: 5px 10px; font-size: 14px;" 
                            onclick="return confirm('¿Estás seguro de eliminar este registro del historial?')">
                      🗑️ Eliminar
                    </button>
                  </form>
                </div>
              </div>
              
              <div class="historial-section">
                <div class="section-title">📝 Motivo de la Consulta:</div>
                <div class="section-content">${historial.motivo_consulta}</div>
              </div>
              
              ${historial.diagnostico ? `
              <div class="historial-section">
                <div class="section-title">🩺 Diagnóstico:</div>
                <div class="section-content">${historial.diagnostico}</div>
              </div>
              ` : ''}
              
              ${historial.tratamiento ? `
              <div class="historial-section">
                <div class="section-title">💊 Tratamiento:</div>
                <div class="section-content">${historial.tratamiento}</div>
              </div>
              ` : ''}
              
              ${historial.medicamentos_prescritos ? `
              <div class="historial-section">
                <div class="section-title">💊 Medicamentos Prescritos:</div>
                <div class="section-content">${historial.medicamentos_prescritos}</div>
              </div>
              ` : ''}
              
              ${historial.observaciones ? `
              <div class="historial-section">
                <div class="section-title">📄 Observaciones:</div>
                <div class="section-content">${historial.observaciones}</div>
              </div>
              ` : ''}
              
              <div style="font-size: 12px; color: #666; margin-top: 15px; text-align: right;">
                Registrado: ${new Date(historial.fecha_creacion).toLocaleDateString('es-ES')}
                ${historial.fecha_actualizacion ? ` | Actualizado: ${new Date(historial.fecha_actualizacion).toLocaleDateString('es-ES')}` : ''}
              </div>
            </div>
          `;
        });
      } else {
        html += `
          <div class="empty-state">
            <p>📭 No hay registros en el historial clínico de este paciente</p>
            <p>¡Agrega el primer registro médico!</p>
            <a href="/agregar-historial/${paciente.id}" class="action-btn historial" style="margin-top: 20px;">
              ➕ Agregar Primer Registro
            </a>
          </div>
        `;
      }
      
      html += `
            <div style="text-align: center; margin-top: 40px;">
              <a href="/ver-pacientes" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
                ← Volver a Pacientes
              </a>
            </div>
          </div>
          
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              })
              .catch(error => console.error('Error cargando navbar:', error));
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    });
  });
});

// Ver historial clínico propio (para pacientes) - CORREGIDA
app.get('/ver-mi-historial', requireLogin, requireRole('paciente'), (req, res) => {
  const user = req.session.user;
  
  // Primero obtener el ID del paciente desde la tabla pacientes usando el usuario_id
  db.query('SELECT id, nombre, causa, fecha_registro FROM pacientes WHERE usuario_id = ?', [user.id], (err, pacienteResults) => {
    if (err) {
      console.error('Error obteniendo paciente:', err);
      return res.status(500).send('Error al obtener información del paciente.');
    }
    
    if (pacienteResults.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Paciente no encontrado</title>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>⚠️ Paciente no encontrado</h1>
            <p>No se encontró un perfil de paciente asociado a tu cuenta.</p>
            <p>Por favor, contacta al administrador del sistema.</p>
            <a href="/dashboard" class="menu-btn">← Volver al inicio</a>
          </div>
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              });
          </script>
        </body>
        </html>
      `);
    }
    
    const paciente = pacienteResults[0];
    const pacienteId = paciente.id;
    
    const query = `
      SELECT 
        hc.*,
        p.nombre as paciente_nombre,
        u.nombre_usuario as medico_nombre
      FROM historiales_clinicos hc
      LEFT JOIN pacientes p ON hc.paciente_id = p.id
      LEFT JOIN usuarios u ON hc.medico_id = u.id
      WHERE hc.paciente_id = ?
      ORDER BY hc.fecha_consulta DESC
    `;
    
    db.query(query, [pacienteId], (err, results) => {
      if (err) {
        console.error('Error obteniendo historial:', err);
        return res.status(500).send('Error al obtener historial clínico.');
      }
      
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Mi Historial Clínico</title>
          <style>
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .paciente-info {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 10px;
              margin-bottom: 30px;
              border-left: 5px solid #9C27B0;
            }
            .historial-card {
              background: white;
              border-radius: 10px;
              padding: 25px;
              margin-bottom: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              border-left: 5px solid #4CAF50;
            }
            .historial-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 2px solid #f0f0f0;
            }
            .historial-section {
              margin-bottom: 15px;
            }
            .section-title {
              font-weight: bold;
              color: #333;
              margin-bottom: 5px;
              display: flex;
              align-items: center;
            }
            .section-content {
              padding: 10px;
              background: #f8f9fa;
              border-radius: 5px;
              white-space: pre-line;
            }
            .empty-state {
              text-align: center;
              padding: 50px;
              color: #666;
              font-size: 18px;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <div class="paciente-info">
              <h1>📋 Mi Historial Clínico</h1>
              <div>
                <h2 style="margin-top: 5px;">${paciente.nombre}</h2>
                <p><strong>Causa/Diagnóstico:</strong> ${paciente.causa}</p>
                <p><strong>Fecha de Registro:</strong> ${new Date(paciente.fecha_registro).toLocaleDateString('es-ES')}</p>
              </div>
            </div>
      `;
      
      if (results.length > 0) {
        results.forEach(historial => {
          const fecha = new Date(historial.fecha_consulta).toLocaleDateString('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          
          html += `
            <div class="historial-card">
              <div class="historial-header">
                <div>
                  <h3 style="margin: 0;">Consulta del ${fecha}</h3>
                  <p style="margin: 5px 0 0 0; color: #666;">Atendido por: ${historial.medico_nombre || 'Médico'}</p>
                </div>
              </div>
              
              <div class="historial-section">
                <div class="section-title">📝 Motivo de la Consulta:</div>
                <div class="section-content">${historial.motivo_consulta}</div>
              </div>
              
              ${historial.diagnostico ? `
              <div class="historial-section">
                <div class="section-title">🩺 Diagnóstico:</div>
                <div class="section-content">${historial.diagnostico}</div>
              </div>
              ` : ''}
              
              ${historial.tratamiento ? `
              <div class="historial-section">
                <div class="section-title">💊 Tratamiento:</div>
                <div class="section-content">${historial.tratamiento}</div>
              </div>
              ` : ''}
              
              ${historial.medicamentos_prescritos ? `
              <div class="historial-section">
                <div class="section-title">💊 Medicamentos Prescritos:</div>
                <div class="section-content">${historial.medicamentos_prescritos}</div>
              </div>
              ` : ''}
              
              ${historial.observaciones ? `
              <div class="historial-section">
                <div class="section-title">📄 Observaciones:</div>
                <div class="section-content">${historial.observaciones}</div>
              </div>
              ` : ''}
              
              <div style="font-size: 12px; color: #666; margin-top: 15px; text-align: right;">
                Registrado: ${new Date(historial.fecha_creacion).toLocaleDateString('es-ES')}
              </div>
            </div>
          `;
        });
      } else {
        html += `
          <div class="empty-state">
            <p>📭 No hay registros en tu historial clínico</p>
            <p>¡Solicita una cita médica para comenzar tu historial!</p>
            <a href="/solicitar-cita" class="menu-btn" style="margin-top: 20px; display: inline-block;">
              📅 Solicitar Cita Médica
            </a>
          </div>
        `;
      }
      
      html += `
              <div style="text-align: center; margin-top: 40px;">
                <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
                  ← Volver al inicio
                </a>
              </div>
            </div>
            
            <script>
              fetch('/navbar')
                .then(response => response.text())
                .then(html => {
                  document.getElementById('navbar-container').innerHTML = html;
                })
                .catch(error => console.error('Error cargando navbar:', error));
            </script>
          </body>
          </html>
        `;
        
      res.send(html);
    });
  });
});

// Ver todos los historiales (para médicos y enfermeros)
app.get('/ver-historiales', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const query = `
    SELECT 
      hc.*,
      p.nombre as paciente_nombre,
      u.nombre_usuario as medico_nombre
    FROM historiales_clinicos hc
    LEFT JOIN pacientes p ON hc.paciente_id = p.id
    LEFT JOIN usuarios u ON hc.medico_id = u.id
    ORDER BY hc.fecha_consulta DESC
    LIMIT 50
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error obteniendo historiales:', err);
      return res.status(500).send('Error al obtener historiales clínicos.');
    }
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Historiales Clínicos</title>
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .search-container {
            margin-bottom: 20px;
          }
          .historial-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            border-left: 5px solid #607D8B;
          }
          .historial-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .historial-preview {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .view-btn {
            background: #607D8B;
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            text-decoration: none;
            font-size: 14px;
          }
          .view-btn:hover {
            background: #455A64;
          }
          .empty-state {
            text-align: center;
            padding: 50px;
            color: #666;
            font-size: 18px;
          }
          .actions {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
          }
          .action-btn { 
            background: #4CAF50; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 5px; 
            cursor: pointer; 
            text-decoration: none; 
            display: inline-block;
          }
          .action-btn:hover { background: #45a049; }
          .action-btn.historial { background: #607D8B; }
          .action-btn.historial:hover { background: #455A64; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>📋 Historiales Clínicos</h1>
          
          <div class="actions">
            <a href="/agregar-historial" class="action-btn historial">➕ Agregar Historial</a>
            <a href="/ver-pacientes" class="action-btn">👥 Ver Pacientes</a>
          </div>
          
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar por paciente, médico o diagnóstico...">
          </div>
    `;
    
    if (results.length > 0) {
      results.forEach(historial => {
        const fecha = new Date(historial.fecha_consulta).toLocaleDateString('es-ES');
        const preview = historial.motivo_consulta.substring(0, 100) + (historial.motivo_consulta.length > 100 ? '...' : '');
        
        html += `
          <div class="historial-card">
            <div class="historial-header">
              <div>
                <h3 style="margin: 0;">${historial.paciente_nombre}</h3>
                <p style="margin: 5px 0; color: #666; font-size: 14px;">
                  📅 ${fecha} | 👨‍⚕️ ${historial.medico_nombre || 'Médico'}
                </p>
              </div>
              <a href="/ver-historial-paciente/${historial.paciente_id}" class="view-btn">
                Ver Completo
              </a>
            </div>
            <div class="historial-preview">
              <strong>Motivo:</strong> ${preview}
            </div>
            ${historial.diagnostico ? `
            <div style="font-size: 13px; color: #666;">
              <strong>Diagnóstico:</strong> ${historial.diagnostico.substring(0, 50)}${historial.diagnostico.length > 50 ? '...' : ''}
            </div>
            ` : ''}
          </div>
        `;
      });
    } else {
      html += `
        <div class="empty-state">
          <p>📭 No hay historiales clínicos registrados</p>
          <p>¡Agrega el primer historial médico!</p>
          <a href="/agregar-historial" class="action-btn historial" style="margin-top: 20px;">
            ➕ Agregar Primer Historial
          </a>
        </div>
      `;
    }
    
    html += `
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('.historial-card');
            
            cards.forEach((card) => {
              const texto = card.innerText.toLowerCase();
              card.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  });
});

// Agregar historial clínico
app.get('/agregar-historial/:pacienteId?', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const pacienteId = req.params.pacienteId;
  
  let pacienteSelect = '';
  let pacienteInfo = '';
  
  if (pacienteId) {
    // Si hay un paciente específico, obtener su información
    db.query('SELECT * FROM pacientes WHERE id = ?', [pacienteId], (err, results) => {
      if (err || results.length === 0) {
        return res.redirect('/ver-pacientes');
      }
      
      const paciente = results[0];
      pacienteInfo = `
        <div class="paciente-info" style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <h3 style="margin-top: 0;">Agregando historial para:</h3>
          <p><strong>Nombre:</strong> ${paciente.nombre}</p>
          <p><strong>Causa/Diagnóstico:</strong> ${paciente.causa}</p>
          <input type="hidden" name="paciente_id" value="${paciente.id}">
        </div>
      `;
      
      renderForm(pacienteSelect, pacienteInfo);
    });
  } else {
    // Si no hay paciente específico, mostrar selector
    db.query('SELECT * FROM pacientes ORDER BY nombre', (err, pacientes) => {
      if (err) {
        console.error('Error obteniendo pacientes:', err);
        return res.status(500).send('Error al cargar formulario.');
      }
      
      pacientes.forEach(p => {
        pacienteSelect += `<option value="${p.id}">${p.nombre} - ${p.causa}</option>`;
      });
      
      renderForm(pacienteSelect, pacienteInfo);
    });
  }
  
  function renderForm(pacienteSelect, pacienteInfo) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Agregar Historial Clínico</title>
        <style>
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; }
          input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            box-sizing: border-box;
          }
          textarea {
            min-height: 100px;
            resize: vertical;
          }
          button {
            background: #4CAF50;
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
          }
          button:hover { background: #45a049; }
          .info-text {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
          }
          .back-btn {
            display: inline-block;
            margin-top: 20px;
            color: #3498db;
            text-decoration: none;
          }
          .back-btn:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>📋 Agregar Historial Clínico</h1>
          
          <div id="message" style="margin-bottom: 20px;"></div>
          
          ${pacienteId ? `<a href="/ver-historial-paciente/${pacienteId}" class="back-btn">← Volver al historial del paciente</a>` : ''}
          ${!pacienteId ? `<a href="/ver-historiales" class="back-btn">← Volver a historiales</a>` : ''}
          
          <form id="historialForm">
            ${pacienteInfo}
            
            ${!pacienteId ? `
            <div class="form-group">
              <label for="paciente_id">Seleccionar Paciente:</label>
              <select id="paciente_id" name="paciente_id" required>
                <option value="">Selecciona un paciente</option>
                ${pacienteSelect}
              </select>
            </div>
            ` : ''}
            
            <div class="form-group">
              <label for="fecha_consulta">Fecha de la Consulta:</label>
              <input type="date" id="fecha_consulta" name="fecha_consulta" required 
                     value="${new Date().toISOString().split('T')[0]}">
              <div class="info-text">Fecha en que se realizó la consulta</div>
            </div>
            
            <div class="form-group">
              <label for="motivo_consulta">Motivo de la Consulta:</label>
              <textarea id="motivo_consulta" name="motivo_consulta" required 
                        placeholder="Describa el motivo principal de la consulta..."></textarea>
              <div class="info-text">Síntomas, quejas o razones de la visita</div>
            </div>
            
            <div class="form-group">
              <label for="diagnostico">Diagnóstico:</label>
              <textarea id="diagnostico" name="diagnostico" 
                        placeholder="Diagnóstico médico (opcional)..."></textarea>
              <div class="info-text">Diagnóstico principal o secundarios</div>
            </div>
            
            <div class="form-group">
              <label for="tratamiento">Tratamiento Indicado:</label>
              <textarea id="tratamiento" name="tratamiento" 
                        placeholder="Tratamiento prescrito (opcional)..."></textarea>
              <div class="info-text">Procedimientos, terapias o intervenciones</div>
            </div>
            
            <div class="form-group">
              <label for="medicamentos_prescritos">Medicamentos Prescritos:</label>
              <textarea id="medicamentos_prescritos" name="medicamentos_prescritos" 
                        placeholder="Medicamentos, dosis y frecuencia (opcional)..."></textarea>
              <div class="info-text">Incluir dosis, frecuencia y duración</div>
            </div>
            
            <div class="form-group">
              <label for="observaciones">Observaciones Adicionales:</label>
              <textarea id="observaciones" name="observaciones" 
                        placeholder="Otras observaciones relevantes (opcional)..."></textarea>
              <div class="info-text">Notas adicionales, recomendaciones, etc.</div>
            </div>
            
            <button type="submit">💾 Guardar Historial</button>
          </form>
          
          <div style="text-align: center; margin-top: 20px;">
            ${pacienteId ? `<a href="/ver-historial-paciente/${pacienteId}" class="back-btn">← Cancelar y volver</a>` : ''}
            ${!pacienteId ? `<a href="/ver-historiales" class="back-btn">← Cancelar y volver</a>` : ''}
          </div>
        </div>
        
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          document.getElementById('historialForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = Object.fromEntries(formData.entries());
            
            // Validación básica
            if (!data.fecha_consulta || !data.motivo_consulta) {
              showMessage('Fecha y motivo de consulta son requeridos', 'error');
              return;
            }
            
            try {
              const response = await fetch('/api/historiales/agregar', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
              });
              
              const result = await response.json();
              
              const messageDiv = document.getElementById('message');
              if (result.success) {
                messageDiv.innerHTML = '<div style="background: #e6ffe6; color: #008000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">✅ ' + result.message + '</div>';
                
                setTimeout(() => {
                  if (${pacienteId ? 'true' : 'false'}) {
                    window.location.href = '/ver-historial-paciente/' + data.paciente_id;
                  } else {
                    window.location.href = '/ver-historiales';
                  }
                }, 2000);
              } else {
                messageDiv.innerHTML = '<div style="background: #ffe6e6; color: #ff0000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">❌ ' + result.error + '</div>';
              }
            } catch (error) {
              const messageDiv = document.getElementById('message');
              messageDiv.innerHTML = '<div style="background: #ffe6e6; color: #ff0000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">❌ Error de conexión: ' + error.message + '</div>';
            }
          });
          
          function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.innerHTML = '<div style="background: ' + (type === 'error' ? '#ffe6e6' : '#e6ffe6') + '; color: ' + (type === 'error' ? '#ff0000' : '#008000') + '; padding: 15px; border-radius: 5px; margin-bottom: 20px;">' + text + '</div>';
          }
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  }
});

// Editar historial clínico
app.get('/editar-historial/:id', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const historialId = req.params.id;
  
  db.query('SELECT * FROM historiales_clinicos WHERE id = ?', [historialId], (err, results) => {
    if (err || results.length === 0) {
      console.error('Error obteniendo historial:', err);
      return res.status(404).send('Registro de historial no encontrado');
    }
    
    const historial = results[0];
    
    db.query('SELECT * FROM pacientes WHERE id = ?', [historial.paciente_id], (err, pacienteResults) => {
      if (err || pacienteResults.length === 0) {
        return res.status(404).send('Paciente no encontrado');
      }
      
      const paciente = pacienteResults[0];
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Editar Historial Clínico</title>
          <style>
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; }
            input, select, textarea {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 5px;
              font-size: 16px;
              box-sizing: border-box;
            }
            textarea {
              min-height: 100px;
              resize: vertical;
            }
            button {
              background: #FF9800;
              color: white;
              padding: 12px 25px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              width: 100%;
            }
            button:hover { background: #F57C00; }
            .info-text {
              color: #666;
              font-size: 14px;
              margin-top: 5px;
            }
            .paciente-info {
              background: #fff3e0;
              padding: 15px;
              border-radius: 5px;
              margin-bottom: 20px;
              border-left: 5px solid #FF9800;
            }
            .back-btn {
              display: inline-block;
              margin-top: 20px;
              color: #3498db;
              text-decoration: none;
            }
            .back-btn:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>✏️ Editar Historial Clínico</h1>
            
            <div id="message" style="margin-bottom: 20px;"></div>
            
            <a href="/ver-historial-paciente/${historial.paciente_id}" class="back-btn">← Volver al historial del paciente</a>
            
            <div class="paciente-info">
              <h3 style="margin-top: 0;">Editando historial de:</h3>
              <p><strong>Paciente:</strong> ${paciente.nombre}</p>
              <p><strong>Causa/Diagnóstico:</strong> ${paciente.causa}</p>
              <p><strong>Fecha original:</strong> ${new Date(historial.fecha_consulta).toLocaleDateString('es-ES')}</p>
            </div>
            
            <form id="historialForm">
              <input type="hidden" name="id" value="${historial.id}">
              
              <div class="form-group">
                <label for="fecha_consulta">Fecha de la Consulta:</label>
                <input type="date" id="fecha_consulta" name="fecha_consulta" required 
                       value="${historial.fecha_consulta.toISOString().split('T')[0]}">
                <div class="info-text">Fecha en que se realizó la consulta</div>
              </div>
              
              <div class="form-group">
                <label for="motivo_consulta">Motivo de la Consulta:</label>
                <textarea id="motivo_consulta" name="motivo_consulta" required 
                          placeholder="Describa el motivo principal de la consulta...">${historial.motivo_consulta}</textarea>
                <div class="info-text">Síntomas, quejas o razones de la visita</div>
              </div>
              
              <div class="form-group">
                <label for="diagnostico">Diagnóstico:</label>
                <textarea id="diagnostico" name="diagnostico" 
                          placeholder="Diagnóstico médico (opcional)...">${historial.diagnostico || ''}</textarea>
                <div class="info-text">Diagnóstico principal o secundarios</div>
              </div>
              
              <div class="form-group">
                <label for="tratamiento">Tratamiento Indicado:</label>
                <textarea id="tratamiento" name="tratamiento" 
                          placeholder="Tratamiento prescrito (opcional)...">${historial.tratamiento || ''}</textarea>
                <div class="info-text">Procedimientos, terapias o intervenciones</div>
              </div>
              
              <div class="form-group">
                <label for="medicamentos_prescritos">Medicamentos Prescritos:</label>
                <textarea id="medicamentos_prescritos" name="medicamentos_prescritos" 
                          placeholder="Medicamentos, dosis y frecuencia (opcional)...">${historial.medicamentos_prescritos || ''}</textarea>
                <div class="info-text">Incluir dosis, frecuencia y duración</div>
              </div>
              
              <div class="form-group">
                <label for="observaciones">Observaciones Adicionales:</label>
                <textarea id="observaciones" name="observaciones" 
                          placeholder="Otras observaciones relevantes (opcional)...">${historial.observaciones || ''}</textarea>
                <div class="info-text">Notas adicionales, recomendaciones, etc.</div>
              </div>
              
              <button type="submit">💾 Guardar Cambios</button>
            </form>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="/ver-historial-paciente/${historial.paciente_id}" class="back-btn">← Cancelar y volver</a>
            </div>
          </div>
          
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              })
              .catch(error => console.error('Error cargando navbar:', error));
            
            document.getElementById('historialForm').addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const formData = new FormData(this);
              const data = Object.fromEntries(formData.entries());
              
              // Validación básica
              if (!data.fecha_consulta || !data.motivo_consulta) {
                showMessage('Fecha y motivo de consulta son requeridos', 'error');
                return;
              }
              
              try {
                const response = await fetch('/api/historiales/editar', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                const messageDiv = document.getElementById('message');
                if (result.success) {
                  messageDiv.innerHTML = '<div style="background: #e6ffe6; color: #008000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">✅ ' + result.message + '</div>';
                  
                  setTimeout(() => {
                    window.location.href = '/ver-historial-paciente/${historial.paciente_id}';
                  }, 2000);
                } else {
                  messageDiv.innerHTML = '<div style="background: #ffe6e6; color: #ff0000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">❌ ' + result.error + '</div>';
                }
              } catch (error) {
                const messageDiv = document.getElementById('message');
                messageDiv.innerHTML = '<div style="background: #ffe6e6; color: #ff0000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">❌ Error de conexión: ' + error.message + '</div>';
              }
            });
            
            function showMessage(text, type) {
              const messageDiv = document.getElementById('message');
              messageDiv.innerHTML = '<div style="background: ' + (type === 'error' ? '#ffe6e6' : '#e6ffe6') + '; color: ' + (type === 'error' ? '#ff0000' : '#008000') + '; padding: 15px; border-radius: 5px; margin-bottom: 20px;">' + text + '</div>';
            }
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    });
  });
});

// Eliminar historial clínico
app.post('/eliminar-historial/:id', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const historialId = req.params.id;
  
  db.query('SELECT paciente_id FROM historiales_clinicos WHERE id = ?', [historialId], (err, results) => {
    if (err || results.length === 0) {
      console.error('Error obteniendo historial:', err);
      return res.status(404).send('Registro de historial no encontrado');
    }
    
    const pacienteId = results[0].paciente_id;
    
    db.query('DELETE FROM historiales_clinicos WHERE id = ?', [historialId], (err) => {
      if (err) {
        console.error('Error eliminando historial:', err);
        return res.status(500).send('Error al eliminar el registro de historial');
      }
      
      res.redirect(`/ver-historial-paciente/${pacienteId}`);
    });
  });
});

// ========== APIs PARA HISTORIALES CLÍNICOS ==========
app.post('/api/historiales/agregar', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const user = req.session.user;
  const { paciente_id, fecha_consulta, motivo_consulta, diagnostico, tratamiento, medicamentos_prescritos, observaciones } = req.body;
  
  if (!paciente_id || !fecha_consulta || !motivo_consulta) {
    return res.status(400).json({ 
      success: false, 
      error: 'Paciente, fecha y motivo de consulta son requeridos' 
    });
  }
  
  // Verificar que el paciente existe
  db.query('SELECT id FROM pacientes WHERE id = ?', [paciente_id], (err, pacienteResults) => {
    if (err || pacienteResults.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Paciente no encontrado' 
      });
    }
    
    const insertQuery = `
      INSERT INTO historiales_clinicos 
        (paciente_id, medico_id, fecha_consulta, motivo_consulta, diagnostico, tratamiento, medicamentos_prescritos, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(insertQuery, [
      paciente_id, 
      user.id, 
      fecha_consulta, 
      motivo_consulta, 
      diagnostico || null, 
      tratamiento || null, 
      medicamentos_prescritos || null, 
      observaciones || null
    ], (err, results) => {
      if (err) {
        console.error('Error insertando historial:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'Error al guardar el historial clínico' 
        });
      }
      
      console.log('✅ Historial clínico agregado: ID ' + results.insertId + ', Paciente ' + paciente_id + ', Médico ' + user.id);
      
      res.json({ 
        success: true, 
        message: 'Historial clínico registrado exitosamente',
        historialId: results.insertId,
        pacienteId: paciente_id
      });
    });
  });
});

app.post('/api/historiales/editar', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const user = req.session.user;
  const { id, fecha_consulta, motivo_consulta, diagnostico, tratamiento, medicamentos_prescritos, observaciones } = req.body;
  
  if (!id || !fecha_consulta || !motivo_consulta) {
    return res.status(400).json({ 
      success: false, 
      error: 'ID, fecha y motivo de consulta son requeridos' 
    });
  }
  
  // Verificar que el historial existe y pertenece al médico
  db.query('SELECT * FROM historiales_clinicos WHERE id = ?', [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registro de historial no encontrado' 
      });
    }
    
    const historial = results[0];
    
    // Solo el médico que creó el registro o administradores pueden editarlo
    if (historial.medico_id !== user.id && user.tipo_usuario !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'No tienes permiso para editar este registro' 
      });
    }
    
    const updateQuery = `
      UPDATE historiales_clinicos 
      SET fecha_consulta = ?, motivo_consulta = ?, diagnostico = ?, tratamiento = ?, 
          medicamentos_prescritos = ?, observaciones = ?, fecha_actualizacion = NOW()
      WHERE id = ?
    `;
    
    db.query(updateQuery, [
      fecha_consulta, 
      motivo_consulta, 
      diagnostico || null, 
      tratamiento || null, 
      medicamentos_prescritos || null, 
      observaciones || null,
      id
    ], (err, results) => {
      if (err) {
        console.error('Error actualizando historial:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'Error al actualizar el historial clínico' 
        });
      }
      
      console.log('✅ Historial clínico actualizado: ID ' + id);
      
      res.json({ 
        success: true, 
        message: 'Historial clínico actualizado exitosamente',
        historialId: id,
        pacienteId: historial.paciente_id
      });
    });
  });
});

// ========== AGREGAR PACIENTE ==========
app.get('/agregar-paciente', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Agregar Paciente</title>
    </head>
    <body>
      <div id="navbar-container"></div>
      <div class="container">
        <h2>Agregar Paciente</h2>
        <form action="/agregar-paciente" method="POST">
          <div class="form-group">
            <label>Nombre:</label>
            <input type="text" name="nombre" required>
          </div>
          <div class="form-group">
            <label>Causa:</label>
            <input type="text" name="causa" required>
          </div>
          <button type="submit">Guardar</button>
        </form>
        <a href="/dashboard">Volver al inicio</a>
      </div>
      <script>
        fetch('/navbar')
          .then(response => response.text())
          .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
          });
      </script>
    </body>
    </html>
  `);
});

app.post('/agregar-paciente', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const { nombre, causa } = req.body;
  
  if (!nombre || !causa) {
    return res.send('Nombre y causa son requeridos');
  }
  
  db.query('INSERT INTO pacientes (nombre, causa, fecha_registro) VALUES (?, ?, NOW())',
    [nombre, causa], (err) => {
      if (err) {
        console.error('Error:', err);
        return res.send('Error al guardar paciente.');
      }
      res.redirect('/ver-pacientes');
    });
});

// ========== ELIMINAR PACIENTE ==========
app.get('/eliminar-paciente', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT * FROM pacientes', (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.send('Error al obtener pacientes.');
    }

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Eliminar Paciente</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>Eliminar Paciente</h1>
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar paciente por nombre, causa o ID...">
          </div>
          <table class="delete-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Causa</th>
                <th>Fecha de Registro</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach(p => {
      html += `
              <tr>
                <td>${p.id}</td>
                <td><strong>${p.nombre}</strong></td>
                <td>${p.causa}</td>
                <td>${new Date(p.fecha_registro).toLocaleDateString('es-ES', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</td>
                <td>
                  <form action="/eliminar-paciente" method="POST" class="delete-form">
                    <input type="hidden" name="id" value="${p.id}">
                    <button type="submit" class="delete-btn" onclick="return confirm('¿Estás seguro de eliminar a ${p.nombre.replace(/'/g, "\\'")}? Esta acción no se puede deshacer.');">
                      🗑️ Eliminar
                    </button>
                  </form>
                </td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const filas = document.querySelectorAll('.delete-table tbody tr');
            
            filas.forEach((fila) => {
              const texto = fila.innerText.toLowerCase();
              fila.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
});

app.post('/eliminar-paciente', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  const { id } = req.body;
  
  if (!id) {
    return res.send('ID de paciente es requerido');
  }
  
  db.query('SELECT * FROM pacientes WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.send('Error al verificar paciente.');
    }
    
    if (results.length === 0) {
      return res.send('Paciente no encontrado');
    }
    
    const paciente = results[0];
    
    db.query('DELETE FROM pacientes WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Error:', err);
        return res.send('Error al eliminar paciente (puede tener registros relacionados).');
      }
      console.log('Paciente eliminado: ' + paciente.nombre + ' (ID: ' + id + ')');
      res.redirect('/eliminar-paciente');
    });
  });
});

// ========== RUTAS DE MEDICAMENTOS ==========
app.get('/ver-medicamentos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  console.log('💊 Acceso a /ver-medicamentos por: ' + req.session.user.nombre_usuario + ' (' + req.session.user.tipo_usuario + ')');
  
  db.query('SELECT * FROM medicamentos', (err, results) => {
    if (err) return res.send('Error al obtener medicamentos.');

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Medicamentos</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>💊 Medicamentos Registrados</h1>
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar medicamento por nombre o función...">
          </div>
          <table class="delete-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Función</th>
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach(m => {
      html += `
              <tr>
                <td>${m.id}</td>
                <td><strong>${m.nombre}</strong></td>
                <td>${m.funcion}</td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const filas = document.querySelectorAll('.delete-table tbody tr');
            
            filas.forEach((fila) => {
              const texto = fila.innerText.toLowerCase();
              fila.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
});

app.get('/agregar-medicamento', requireLogin, requireRole('medico'), (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Agregar Medicamento</title>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <div id="navbar-container"></div>
      <div class="container">
        <h2>Agregar Medicamento</h2>
        <form action="/agregar-medicamento" method="POST">
          <div class="form-group">
            <label>Nombre:</label>
            <input type="text" name="nombre" required>
          </div>
          <div class="form-group">
            <label>Función:</label>
            <input type="text" name="funcion" required>
          </div>
          <button type="submit">Guardar</button>
        </form>
        <a href="/dashboard">Volver al inicio</a>
      </div>
      <script>
        fetch('/navbar')
          .then(response => response.text())
          .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
          });
      </script>
    </body>
    </html>
  `);
});

app.post('/agregar-medicamento', requireLogin, requireRole('medico'), (req, res) => {
  const { nombre, funcion } = req.body;
  db.query('INSERT INTO medicamentos (nombre, funcion) VALUES (?, ?)', [nombre, funcion], (err) => {
    if (err) return res.send('Error al guardar medicamento.');
    res.redirect('/ver-medicamentos');
  });
});

// ========== ELIMINAR MEDICAMENTO ==========
app.get('/eliminar-medicamento', requireLogin, requireRole('medico'), (req, res) => {
  db.query('SELECT * FROM medicamentos', (err, results) => {
    if (err) return res.send('Error al obtener medicamentos.');

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Eliminar Medicamento</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>Eliminar Medicamento</h1>
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar medicamento por nombre o función...">
          </div>
          <table class="delete-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Función</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach(m => {
      html += `
              <tr>
                <td>${m.id}</td>
                <td><strong>${m.nombre}</strong></td>
                <td>${m.funcion}</td>
                <td>
                  <form action="/eliminar-medicamento" method="POST" class="delete-form">
                    <input type="hidden" name="id" value="${m.id}">
                    <button type="submit" class="delete-btn" onclick="return confirm('¿Estás seguro de eliminar ${m.nombre.replace(/'/g, "\\'")}? Esta acción no se puede deshacer.');">
                      🗑️ Eliminar
                    </button>
                  </form>
                </td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const filas = document.querySelectorAll('.delete-table tbody tr');
            
            filas.forEach((fila) => {
              const texto = fila.innerText.toLowerCase();
              fila.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
});

app.post('/eliminar-medicamento', requireLogin, requireRole('medico'), (req, res) => {
  const { id } = req.body;
  
  if (!id) {
    return res.send('ID de medicamento es requerido');
  }
  
  db.query('SELECT * FROM medicamentos WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.send('Error al verificar medicamento.');
    }
    
    if (results.length === 0) {
      return res.send('Medicamento no encontrado');
    }
    
    db.query('DELETE FROM medicamentos WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Error:', err);
        return res.send('Error al eliminar medicamento (puede tener registros relacionados).');
      }
      res.redirect('/eliminar-medicamento');
    });
  });
});

// ========== RUTAS DE DISPOSITIVOS MÉDICOS ==========
app.get('/ver-dispositivos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  console.log('🩺 Acceso a /ver-dispositivos por: ' + req.session.user.nombre_usuario + ' (' + req.session.user.tipo_usuario + ')');
  
  db.query('SELECT * FROM maquinas', (err, results) => {
    if (err) {
      console.error('Error al obtener dispositivos médicos:', err);
      return res.send('Error al obtener dispositivos médicos.');
    }

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dispositivos Médicos</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>🩺 Dispositivos Médicos Registrados</h1>
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar dispositivo por nombre, tipo o estado...">
          </div>
          <table class="delete-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach(m => {
      const estadoColor = m.estado === 'Disponible' ? '#d4edda' : m.estado === 'En uso' ? '#fff3cd' : '#f8d7da';
      const textoColor = m.estado === 'Disponible' ? '#155724' : m.estado === 'En uso' ? '#856404' : '#721c24';
      
      html += `
              <tr>
                <td>${m.id}</td>
                <td><strong>${m.nombre}</strong></td>
                <td>${m.tipo}</td>
                <td><span style="padding: 6px 12px; border-radius: 20px; background-color: ${estadoColor}; color: ${textoColor};">${m.estado}</span></td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        <script>
          function cargarNavbar() {
            fetch('/navbar')
              .then(response => {
                if (!response.ok) {
                  throw new Error('Error al cargar navbar');
                }
                return response.text();
              })
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              })
              .catch(error => {
                console.error('Error cargando navbar:', error);
                document.getElementById('navbar-container').innerHTML = 
                  '<nav><ul><li><a href="/dashboard">🏠 Inicio</a></li><li><a href="/logout">🚪 Cerrar Sesión</a></li></ul></nav>';
              });
          }
          
          cargarNavbar();
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const filas = document.querySelectorAll('.delete-table tbody tr');
            
            filas.forEach((fila) => {
              const texto = fila.innerText.toLowerCase();
              fila.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
});

// ========== AGREGAR DISPOSITIVO MÉDICO ==========
app.get('/agregar-dispositivo', requireLogin, requireRole('medico'), (req, res) => {
  const errorMessage = req.query.error ? decodeURIComponent(req.query.error) : '';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Agregar Dispositivo Médico</title>
      <link rel="stylesheet" href="/styles.css">
      <style>
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 30px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .error-message {
          background-color: #ffe6e6;
          color: #c00;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          border: 1px solid #ffcccc;
        }
        .success-message {
          background-color: #e6ffe6;
          color: #008000;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          border: 1px solid #ccffcc;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: #333;
        }
        input, select {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 16px;
          box-sizing: border-box;
        }
        button {
          background: #4CAF50;
          color: white;
          padding: 12px 25px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          width: 100%;
        }
        button:hover {
          background: #45a049;
        }
        .info-text {
          color: #666;
          font-size: 14px;
          margin-top: 5px;
        }
        .links {
          margin-top: 20px;
          text-align: center;
        }
        .links a {
          color: #0066cc;
          text-decoration: none;
          margin: 0 10px;
        }
        .links a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div id="navbar-container"></div>
      <div class="container">
        <h2>➕ Agregar Dispositivo Médico</h2>
        
        ${errorMessage ? '<div class="error-message">⚠️ ' + errorMessage + '</div>' : ''}
        
        <form action="/agregar-dispositivo" method="POST" id="dispositivoForm">
          <div class="form-group">
            <label for="nombre">Nombre del Dispositivo:</label>
            <input type="text" id="nombre" name="nombre" required 
                   placeholder="Ej: Monitor de Signos, Ventilador, etc.">
            <div class="info-text">Nombre descriptivo del dispositivo médico</div>
          </div>
          
          <div class="form-group">
            <label for="tipo">Tipo:</label>
            <input type="text" id="tipo" name="tipo" required 
                   placeholder="Ej: Diagnóstico, Terapéutico, Monitorización">
            <div class="info-text">Categoría o tipo de dispositivo</div>
          </div>
          
          <div class="form-group">
            <label for="estado">Estado:</label>
            <select id="estado" name="estado" required>
              <option value="">Selecciona un estado</option>
              <option value="Disponible">✅ Disponible</option>
              <option value="En uso">🔄 En uso</option>
              <option value="En mantenimiento">🔧 En mantenimiento</option>
              <option value="Descompuesto">❌ Descompuesto</option>
              <option value="Reservado">📅 Reservado</option>
            </select>
            <div class="info-text">Estado actual del dispositivo</div>
          </div>
          
          <button type="submit">💾 Guardar Dispositivo</button>
        </form>
        
        <div class="links">
          <a href="/ver-dispositivos">👁️ Ver Dispositivos</a>
          <a href="/dashboard">🏠 Volver al inicio</a>
        </div>
      </div>
      
      <script>
        fetch('/navbar')
          .then(response => response.text())
          .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
          })
          .catch(error => {
            console.error('Error cargando navbar:', error);
            document.getElementById('navbar-container').innerHTML = 
              '<nav><ul><li><a href="/dashboard">🏠 Inicio</a></li><li><a href="/logout">🚪 Cerrar Sesión</a></li></ul></nav>';
          });
        
        document.getElementById('dispositivoForm').addEventListener('submit', function(e) {
          const nombre = document.getElementById('nombre').value.trim();
          const tipo = document.getElementById('tipo').value.trim();
          const estado = document.getElementById('estado').value;
          
          if (!nombre || !tipo || !estado) {
            e.preventDefault();
            alert('❌ Por favor, complete todos los campos requeridos.');
            return false;
          }
          
          return true;
        });
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

app.post('/agregar-dispositivo', requireLogin, requireRole('medico'), (req, res) => {
  const { nombre, tipo, estado } = req.body;
  
  console.log('📝 Intentando agregar dispositivo:', { nombre, tipo, estado });
  
  if (!nombre || !tipo || !estado) {
    console.error('❌ Campos faltantes al agregar dispositivo');
    const errorMsg = encodeURIComponent('Nombre, Tipo y Estado son campos requeridos.');
    return res.redirect('/agregar-dispositivo?error=' + errorMsg);
  }
  
  db.query('INSERT INTO maquinas (nombre, tipo, estado) VALUES (?, ?, ?)', 
    [nombre, tipo, estado], 
    (err, results) => {
      if (err) {
        console.error('❌ Error en consulta SQL al agregar dispositivo:', err);
        const errorMsg = encodeURIComponent('Error al guardar en la base de datos: ' + err.message);
        return res.redirect('/agregar-dispositivo?error=' + errorMsg);
      }
      
      console.log('✅ Dispositivo médico agregado: ' + nombre + ' (ID: ' + results.insertId + ')');
      res.redirect('/ver-dispositivos');
    }
  );
});

// ========== ELIMINAR DISPOSITIVO MÉDICO ==========
app.get('/eliminar-dispositivo', requireLogin, requireRole('medico'), (req, res) => {
  db.query('SELECT * FROM maquinas', (err, results) => {
    if (err) return res.send('Error al obtener dispositivos médicos.');

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Eliminar Dispositivo Médico</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>Eliminar Dispositivo Médico</h1>
          <div class="search-container">
            <input type="text" id="buscar" placeholder="🔍 Buscar dispositivo por nombre, tipo o estado...">
          </div>
          <table class="delete-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach(m => {
      const estadoColor = m.estado === 'Disponible' ? '#d4edda' : m.estado === 'En uso' ? '#fff3cd' : '#f8d7da';
      const textoColor = m.estado === 'Disponible' ? '#155724' : m.estado === 'En uso' ? '#856404' : '#721c24';
      
      html += `
              <tr>
                <td>${m.id}</td>
                <td><strong>${m.nombre}</strong></td>
                <td>${m.tipo}</td>
                <td><span style="padding: 6px 12px; border-radius: 20px; background-color: ${estadoColor}; color: ${textoColor};">${m.estado}</span></td>
                <td>
                  <form action="/eliminar-dispositivo" method="POST" class="delete-form">
                    <input type="hidden" name="id" value="${m.id}">
                    <button type="submit" class="delete-btn" onclick="return confirm('¿Estás seguro de eliminar el dispositivo ${m.nombre.replace(/'/g, "\\'")}? Esta acción no se puede deshacer.');">
                      🗑️ Eliminar
                    </button>
                  </form>
                </td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <div style="text-align: center; margin-top: 40px;">
            <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Volver al inicio
            </a>
          </div>
        </div>
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          document.getElementById('buscar').addEventListener('keyup', (e) => {
            const query = e.target.value.toLowerCase();
            const filas = document.querySelectorAll('.delete-table tbody tr');
            
            filas.forEach((fila) => {
              const texto = fila.innerText.toLowerCase();
              fila.style.display = texto.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });
});

app.post('/eliminar-dispositivo', requireLogin, requireRole('medico'), (req, res) => {
  const { id } = req.body;
  
  if (!id) {
    return res.send('ID de dispositivo médico es requerido');
  }
  
  db.query('SELECT * FROM maquinas WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.send('Error al verificar dispositivo médico.');
    }
    
    if (results.length === 0) {
      return res.send('Dispositivo médico no encontrado');
    }
    
    db.query('DELETE FROM maquinas WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Error:', err);
        return res.send('Error al eliminar dispositivo médico.');
      }
      res.redirect('/eliminar-dispositivo');
    });
  });
});

// ========== SISTEMA DE MENSAJERÍA ==========
app.get('/mensajeria', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const tipoUsuario = req.session.user.tipo_usuario;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sistema de Mensajería Médica</title>
      <link rel="stylesheet" href="/styles.css">
      <style>
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .header-section {
          background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
          color: white;
          padding: 25px;
          border-radius: 15px;
          margin-bottom: 30px;
          box-shadow: 0 10px 30px rgba(33, 150, 243, 0.3);
        }
        
        .messaging-container {
          display: flex;
          gap: 20px;
          height: 75vh;
          background: white;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        
        .contacts-sidebar {
          width: 350px;
          border-right: 1px solid #e0e0e0;
          background: #f8f9fa;
          display: flex;
          flex-direction: column;
        }
        
        .chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .contact-item {
          padding: 18px;
          border-bottom: 1px solid #e0e0e0;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .contact-item:hover {
          background: #e9ecef;
        }
        
        .contact-item.active {
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
        }
        
        .contact-info {
          flex: 1;
          min-width: 0;
        }
        
        .contact-name {
          font-weight: bold;
          color: #333;
          font-size: 16px;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
        }
        
        .contact-type {
          font-size: 12px;
          color: white;
          padding: 3px 10px;
          border-radius: 12px;
          display: inline-block;
          margin-left: 10px;
        }
        
        .contact-type.medico {
          background: #4CAF50;
        }
        
        .contact-type.enfermero {
          background: #2196F3;
        }
        
        .last-message {
          font-size: 14px;
          color: #666;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .unread-badge {
          background: #ff6b6b;
          color: white;
          border-radius: 50%;
          min-width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          margin-left: 10px;
        }
        
        .chat-header {
          padding: 25px;
          border-bottom: 1px solid #e0e0e0;
          background: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .chat-header-info h3 {
          margin: 0;
          color: #2c3e50;
        }
        
        .chat-header-info small {
          color: #666;
        }
        
        .messages-container {
          flex: 1;
          padding: 25px;
          overflow-y: auto;
          background: #f0f2f5;
          display: flex;
          flex-direction: column;
        }
        
        .message {
          max-width: 70%;
          margin-bottom: 15px;
          padding: 15px 20px;
          border-radius: 20px;
          position: relative;
          word-wrap: break-word;
        }
        
        .message.sent {
          background: linear-gradient(135deg, #0084ff 0%, #0073e6 100%);
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 5px;
        }
        
        .message.received {
          background: white;
          color: #333;
          align-self: flex-start;
          border-bottom-left-radius: 5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .message-time {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.8);
          margin-top: 8px;
          text-align: right;
        }
        
        .message.received .message-time {
          color: #999;
        }
        
        .message-input-container {
          padding: 25px;
          border-top: 1px solid #e0e0e0;
          background: white;
        }
        
        .message-form {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        
        .message-input {
          flex: 1;
          padding: 15px 20px;
          border: 2px solid #e0e0e0;
          border-radius: 30px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.3s;
        }
        
        .message-input:focus {
          border-color: #2196f3;
        }
        
        .send-btn {
          background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          box-shadow: 0 5px 15px rgba(33, 150, 243, 0.3);
        }
        
        .send-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 8px 20px rgba(33, 150, 243, 0.4);
        }
        
        .new-message-btn {
          background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
          color: white;
          border: none;
          padding: 15px;
          border-radius: 10px;
          cursor: pointer;
          margin: 20px;
          font-size: 16px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.3s;
          box-shadow: 0 5px 15px rgba(76, 175, 80, 0.3);
        }
        
        .new-message-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(76, 175, 80, 0.4);
        }
        
        .search-contacts {
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .search-input {
          width: 100%;
          padding: 12px 20px;
          border: 2px solid #e0e0e0;
          border-radius: 25px;
          font-size: 16px;
          transition: border-color 0.3s;
        }
        
        .search-input:focus {
          border-color: #2196f3;
          outline: none;
        }
        
        .no-messages {
          text-align: center;
          color: #999;
          padding: 50px;
          font-size: 18px;
        }
        
        .contacts-list-container {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        
        .contacts-title {
          padding: 20px;
          background: #e3f2fd;
          border-bottom: 1px solid #e0e0e0;
          font-weight: bold;
          color: #1976D2;
          font-size: 18px;
        }
        
        .online-status {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 8px;
        }
        
        .online-status.online {
          background: #4CAF50;
          box-shadow: 0 0 5px #4CAF50;
        }
        
        .online-status.offline {
          background: #ccc;
        }
        
        .message-subject {
          font-weight: bold;
          margin-bottom: 8px;
          font-size: 14px;
          opacity: 0.9;
        }
        
        .message-content {
          font-size: 16px;
          line-height: 1.5;
        }
        
        .message-status {
          font-size: 12px;
          margin-left: 10px;
          opacity: 0.8;
        }
        
        @media (max-width: 1024px) {
          .messaging-container {
            flex-direction: column;
            height: auto;
            min-height: 80vh;
          }
          
          .contacts-sidebar {
            width: 100%;
            height: 300px;
          }
        }
        
        .typing-indicator {
          padding: 10px;
          font-style: italic;
          color: #666;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div id="navbar-container"></div>
      
      <div class="container">
        <div class="header-section">
          <h1>💬 Mensajería Interna del Personal Médico</h1>
          <p>Comunícate de forma segura y privada con otros profesionales de la salud</p>
          <div style="margin-top: 15px; display: flex; gap: 15px; flex-wrap: wrap;">
            <span style="background: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px;">👨‍⚕️ Solo personal autorizado</span>
            <span style="background: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px;">🔒 Comunicación segura</span>
            <span style="background: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px;">📱 En tiempo real</span>
          </div>
        </div>
        
        <div class="messaging-container">
          <div class="contacts-sidebar">
            <button class="new-message-btn" onclick="showNewMessageModal()">
              <span>✏️</span> Nuevo Mensaje
            </button>
            
            <div class="search-contacts">
              <input type="text" class="search-input" placeholder="🔍 Buscar colegas..." 
                     onkeyup="searchContacts(this.value)">
            </div>
            
            <div class="contacts-title">
              <span>👥 Colegas Disponibles</span>
              <span id="online-count" style="float: right; font-size: 14px; font-weight: normal;"></span>
            </div>
            
            <div class="contacts-list-container">
              <div id="contacts-list">
                <div class="no-messages">Cargando contactos...</div>
              </div>
            </div>
          </div>
          
          <div class="chat-main">
            <div class="chat-header" id="chat-header">
              <div class="no-messages">Selecciona un colega para comenzar a conversar</div>
            </div>
            
            <div class="messages-container" id="messages-container">
              <!-- Los mensajes se cargarán aquí -->
            </div>
            
            <div class="message-input-container" id="message-input-container" style="display: none;">
              <form class="message-form" onsubmit="sendMessage(event)">
                <input type="text" class="message-input" placeholder="Escribe tu mensaje aquí..." 
                       id="message-input" required>
                <input type="hidden" id="current-contact-id">
                <button type="submit" class="send-btn" title="Enviar mensaje">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Modal para nuevo mensaje -->
      <div id="newMessageModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
        <div style="background: white; width: 600px; max-width: 90%; border-radius: 20px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
            <h3 style="margin: 0; color: #2c3e50;">📝 Nuevo Mensaje</h3>
            <button onclick="hideNewMessageModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
          </div>
          
          <div style="margin-bottom: 25px;">
            <label style="display: block; margin-bottom: 10px; font-weight: bold; color: #333;">Para:</label>
            <select id="recipient-select" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 16px; transition: border-color 0.3s;">
              <option value="">Selecciona un colega</option>
              <!-- Las opciones se llenarán con JavaScript -->
            </select>
          </div>
          
          <div style="margin-bottom: 25px;">
            <label style="display: block; margin-bottom: 10px; font-weight: bold; color: #333;">Asunto (opcional):</label>
            <input type="text" id="subject-input" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 16px; transition: border-color 0.3s;" 
                   placeholder="Ej: Urgente, Consulta, Información importante...">
          </div>
          
          <div style="margin-bottom: 30px;">
            <label style="display: block; margin-bottom: 10px; font-weight: bold; color: #333;">Mensaje:</label>
            <textarea id="new-message-input" style="width: 100%; padding: 15px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 16px; min-height: 150px; resize: vertical; transition: border-color 0.3s;" 
                      placeholder="Escribe tu mensaje aquí..."></textarea>
          </div>
          
          <div style="display: flex; gap: 15px; justify-content: flex-end;">
            <button type="button" onclick="hideNewMessageModal()" style="padding: 12px 25px; background: #f5f5f5; color: #333; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; transition: background 0.3s;">
              Cancelar
            </button>
            <button type="button" onclick="sendNewMessage()" style="padding: 12px 25px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: transform 0.3s;">
              Enviar Mensaje
            </button>
          </div>
        </div>
      </div>
      
      <script>
        let currentContactId = null;
        let messageInterval = null;
        
        fetch('/navbar')
          .then(response => response.text())
          .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
          })
          .catch(error => {
            console.error('Error cargando navbar:', error);
          });
        
        loadContacts();
        
        function loadContacts() {
          fetch('/api/mensajes/contactos')
            .then(response => response.json())
            .then(data => {
              const contactsList = document.getElementById('contacts-list');
              
              if (data.contacts && data.contacts.length > 0) {
                contactsList.innerHTML = '';
                data.contacts.forEach(contact => {
                  const contactDiv = document.createElement('div');
                  contactDiv.className = 'contact-item';
                  contactDiv.setAttribute('data-contact-id', contact.id);
                  contactDiv.onclick = () => loadConversation(contact.id);
                  
                  let unreadBadge = '';
                  if (contact.unread_count > 0) {
                    unreadBadge = '<div class="unread-badge">' + contact.unread_count + '</div>';
                  }
                  
                  const contactTypeClass = contact.tipo_usuario === 'medico' ? 'medico' : 'enfermero';
                  
                  contactDiv.innerHTML = 
                    '<div class="contact-info">' +
                      '<div class="contact-name">' +
                        contact.nombre +
                        '<span class="contact-type ' + contactTypeClass + '">' + contact.tipo_usuario + '</span>' +
                      '</div>' +
                      '<div class="last-message">' + (contact.last_message || 'No hay mensajes') + '</div>' +
                    '</div>' +
                    unreadBadge;
                  
                  contactsList.appendChild(contactDiv);
                });
                
                document.getElementById('online-count').textContent = data.contacts.length + ' colegas';
              } else {
                contactsList.innerHTML = 
                  '<div class="no-messages">' +
                    '<p>No tienes conversaciones todavía</p>' +
                    '<p><small>¡Haz clic en "Nuevo Mensaje" para comenzar!</small></p>' +
                  '</div>';
                document.getElementById('online-count').textContent = '0 colegas';
              }
            })
            .catch(error => {
              console.error('Error cargando contactos:', error);
              document.getElementById('contacts-list').innerHTML = 
                '<div class="no-messages">' +
                  '<p>Error cargando contactos</p>' +
                  '<p><small>Intenta recargar la página</small></p>' +
                '</div>';
            });
        }
        
        function loadConversation(contactId) {
          currentContactId = contactId;
          
          document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-contact-id') == contactId) {
              item.classList.add('active');
            }
          });
          
          document.getElementById('message-input-container').style.display = 'block';
          document.getElementById('current-contact-id').value = contactId;
          
          fetch('/api/mensajes/conversacion/' + contactId)
            .then(response => response.json())
            .then(data => {
              if (data.error) {
                alert(data.error);
                return;
              }
              
              document.getElementById('chat-header').innerHTML = 
                '<div class="chat-header-info">' +
                  '<h3>' + data.contactName + '</h3>' +
                  '<small>' + (data.contactType === 'medico' ? '👨‍⚕️ Médico' : '👩‍⚕️ Enfermero/a') + '</small>' +
                '</div>' +
                '<div style="color: #666; font-size: 14px;">' +
                  (data.messages && data.messages.length > 0 ? 'Última actividad reciente' : 'Sin mensajes todavía') +
                '</div>';
              
              const messagesContainer = document.getElementById('messages-container');
              if (data.messages && data.messages.length > 0) {
                messagesContainer.innerHTML = '';
                
                data.messages.forEach(msg => {
                  const messageDiv = document.createElement('div');
                  messageDiv.className = 'message ' + (msg.sent ? 'sent' : 'received');
                  
                  const time = new Date(msg.fecha_envio).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  
                  const date = new Date(msg.fecha_envio).toLocaleDateString('es-ES');
                  
                  let subjectHtml = '';
                  if (msg.asunto) {
                    subjectHtml = '<div class="message-subject">' + msg.asunto + '</div>';
                  }
                  
                  messageDiv.innerHTML = 
                    subjectHtml +
                    '<div class="message-content">' + msg.mensaje + '</div>' +
                    '<div class="message-time">' +
                      date + ' ' + time +
                      (msg.sent ? '<span class="message-status">' + (msg.leido ? '✓✓' : '✓') + '</span>' : '') +
                    '</div>';
                  
                  messagesContainer.appendChild(messageDiv);
                });
                
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
                if (data.messages.some(msg => !msg.sent && !msg.leido)) {
                  fetch('/api/mensajes/marcar-leidos/' + contactId, { method: 'POST' });
                  setTimeout(loadContacts, 100);
                }
              } else {
                messagesContainer.innerHTML = 
                  '<div class="no-messages">' +
                    '<p>No hay mensajes todavía</p>' +
                    '<p><small>¡Envía el primer mensaje a ' + data.contactName + '!</small></p>' +
                  '</div>';
              }
            })
            .catch(error => {
              console.error('Error cargando conversación:', error);
              document.getElementById('messages-container').innerHTML = 
                '<div class="no-messages">' +
                  '<p>Error cargando la conversación</p>' +
                  '<p><small>Intenta nuevamente</small></p>' +
                '</div>';
            });
        }
        
        function sendMessage(event) {
          event.preventDefault();
          
          const messageInput = document.getElementById('message-input');
          const message = messageInput.value.trim();
          const contactId = document.getElementById('current-contact-id').value;
          
          if (!message || !contactId) return;
          
          const messagesContainer = document.getElementById('messages-container');
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message sent';
          
          const now = new Date();
          const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const date = now.toLocaleDateString('es-ES');
          
          messageDiv.innerHTML = 
            '<div class="message-content">' + message + '</div>' +
            '<div class="message-time">' +
              date + ' ' + time +
              '<span class="message-status">✓</span>' +
            '</div>';
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          
          messageInput.value = '';
          
          fetch('/api/mensajes/enviar', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              destinatario_id: contactId,
              mensaje: message
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              loadContacts();
            } else {
              alert('Error al enviar mensaje: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error enviando mensaje:', error);
            alert('Error al enviar el mensaje. Intenta nuevamente.');
          });
        }
        
        function showNewMessageModal() {
          fetch('/api/mensajes/destinatarios')
            .then(response => response.json())
            .then(data => {
              const select = document.getElementById('recipient-select');
              select.innerHTML = '<option value="">Selecciona un colega</option>';
              
              if (data.destinatarios && data.destinatarios.length > 0) {
                data.destinatarios.forEach(dest => {
                  const option = document.createElement('option');
                  option.value = dest.id;
                  const icon = dest.tipo_usuario === 'medico' ? '👨‍⚕️' : '👩‍⚕️';
                  option.textContent = icon + ' ' + dest.nombre + ' (' + dest.tipo_usuario + ')';
                  select.appendChild(option);
                });
              }
              
              document.getElementById('newMessageModal').style.display = 'flex';
              document.getElementById('subject-input').focus();
            });
        }
        
        function hideNewMessageModal() {
          document.getElementById('newMessageModal').style.display = 'none';
          document.getElementById('subject-input').value = '';
          document.getElementById('new-message-input').value = '';
          document.getElementById('recipient-select').selectedIndex = 0;
        }
        
        function sendNewMessage() {
          const recipientId = document.getElementById('recipient-select').value;
          const subject = document.getElementById('subject-input').value;
          const message = document.getElementById('new-message-input').value;
          
          if (!recipientId || !message) {
            alert('Por favor, selecciona un colega y escribe un mensaje');
            return;
          }
          
          fetch('/api/mensajes/enviar', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              destinatario_id: recipientId,
              asunto: subject,
              mensaje: message
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              hideNewMessageModal();
              loadContacts();
              
              if (currentContactId == recipientId) {
                loadConversation(recipientId);
              }
              
              alert('✅ Mensaje enviado correctamente');
            } else {
              alert('❌ Error: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error enviando mensaje:', error);
            alert('❌ Error al enviar el mensaje');
          });
        }
        
        function searchContacts(query) {
          const items = document.querySelectorAll('.contact-item');
          items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
          });
        }
        
        messageInterval = setInterval(() => {
          if (currentContactId) {
            loadConversation(currentContactId);
          }
          loadContacts();
        }, 10000);
        
        window.addEventListener('beforeunload', () => {
          if (messageInterval) clearInterval(messageInterval);
        });
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// ========== APIs DE MENSAJERÍA ==========
app.get('/api/mensajes/contactos', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  
  const query = `
    SELECT DISTINCT 
      u.id,
      u.nombre_usuario as nombre,
      u.tipo_usuario,
      (SELECT COUNT(*) FROM mensajes m 
       WHERE m.remitente_id = u.id 
         AND m.destinatario_id = ? 
         AND m.leido = FALSE) as unread_count,
      (SELECT m2.mensaje FROM mensajes m2 
       WHERE (m2.remitente_id = ? AND m2.destinatario_id = u.id) 
          OR (m2.remitente_id = u.id AND m2.destinatario_id = ?)
       ORDER BY m2.fecha_envio DESC LIMIT 1) as last_message
    FROM usuarios u
    WHERE u.id IN (
      SELECT DISTINCT remitente_id FROM mensajes WHERE destinatario_id = ?
      UNION
      SELECT DISTINCT destinatario_id FROM mensajes WHERE remitente_id = ?
    )
    AND u.id != ?
    AND u.tipo_usuario IN ('medico', 'enfermero')
    ORDER BY unread_count DESC, last_message DESC
  `;
  
  db.query(query, [usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId], 
    (err, results) => {
      if (err) {
        console.error('Error obteniendo contactos:', err);
        return res.status(500).json({ error: 'Error en la base de datos' });
      }
      
      res.json({ contacts: results });
    });
});

app.get('/api/mensajes/destinatarios', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  
  const query = `
    SELECT 
      u.id,
      u.nombre_usuario as nombre,
      u.tipo_usuario
    FROM usuarios u
    WHERE u.id != ?
      AND u.tipo_usuario IN ('medico', 'enfermero')
    ORDER BY 
      CASE WHEN u.tipo_usuario = 'medico' THEN 1 ELSE 2 END,
      nombre
  `;
  
  db.query(query, [usuarioId], (err, results) => {
    if (err) {
      console.error('Error obteniendo destinatarios:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }
    
    res.json({ destinatarios: results });
  });
});

app.get('/api/mensajes/conversacion/:contactoId', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  const contactoId = req.params.contactoId;
  
  db.query('SELECT nombre_usuario, tipo_usuario FROM usuarios WHERE id = ?', [contactoId], (err, contactTypeResults) => {
    if (err || contactTypeResults.length === 0) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    
    const contact = contactTypeResults[0];
    
    db.query(`
      SELECT 
        m.*,
        CASE WHEN m.remitente_id = ? THEN TRUE ELSE FALSE END as sent
      FROM mensajes m
      WHERE (m.remitente_id = ? AND m.destinatario_id = ?)
         OR (m.remitente_id = ? AND m.destinatario_id = ?)
      ORDER BY m.fecha_envio ASC
    `, [usuarioId, usuarioId, contactoId, contactoId, usuarioId], (err, messageResults) => {
      if (err) {
        console.error('Error obteniendo mensajes:', err);
        return res.status(500).json({ error: 'Error en la base de datos' });
      }
      
      res.json({
        contactName: contact.nombre_usuario,
        contactType: contact.tipo_usuario,
        messages: messageResults
      });
    });
  });
});

app.post('/api/mensajes/marcar-leidos/:contactoId', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  const contactoId = req.params.contactoId;
  
  db.query(`
    UPDATE mensajes 
    SET leido = TRUE 
    WHERE destinatario_id = ? 
      AND remitente_id = ? 
      AND leido = FALSE
  `, [usuarioId, contactoId], (err) => {
    if (err) {
      console.error('Error marcando mensajes como leídos:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }
    
    res.json({ success: true });
  });
});

app.get('/api/mensajes/contador-no-leidos', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  
  db.query(`
    SELECT COUNT(*) as count 
    FROM mensajes 
    WHERE destinatario_id = ? 
      AND leido = FALSE
  `, [usuarioId], (err, results) => {
    if (err) {
      console.error('Error contando mensajes no leídos:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }
    
    res.json({ count: results[0].count });
  });
});

// ========== API PARA MENSAJES RECIENTES ==========
app.get('/api/mensajes/recientes', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;

  const query = `
    SELECT 
      m.*,
      u.nombre_usuario as remitente_nombre,
      CASE WHEN m.remitente_id = ? THEN 1 ELSE 0 END as es_remitente
    FROM mensajes m
    JOIN usuarios u ON m.remitente_id = u.id
    WHERE m.destinatario_id = ? OR m.remitente_id = ?
    ORDER BY m.fecha_envio DESC
    LIMIT 10
  `;

  db.query(query, [usuarioId, usuarioId, usuarioId], (err, results) => {
    if (err) {
      console.error('Error obteniendo mensajes recientes:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    res.json({ mensajes: results });
  });
});

// ========== API PARA ENVIAR MENSAJES ==========
app.post('/api/mensajes/enviar', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  const { destinatario_id, asunto, mensaje } = req.body;

  if (!destinatario_id || !mensaje) {
    return res.status(400).json({ success: false, error: 'Destinatario y mensaje son requeridos' });
  }

  // Verificar que el destinatario sea médico o enfermero
  db.query('SELECT tipo_usuario FROM usuarios WHERE id = ?', [destinatario_id], (err, results) => {
    if (err) {
      console.error('Error verificando destinatario:', err);
      return res.status(500).json({ success: false, error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, error: 'Destinatario no encontrado' });
    }

    const destinatario = results[0];
    if (destinatario.tipo_usuario !== 'medico' && destinatario.tipo_usuario !== 'enfermero') {
      return res.status(400).json({ success: false, error: 'Solo puedes enviar mensajes a médicos o enfermeros' });
    }

    const query = `
      INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_envio, leido)
      VALUES (?, ?, ?, ?, NOW(), FALSE)
    `;

    db.query(query, [usuarioId, destinatario_id, asunto || null, mensaje], (err, results) => {
      if (err) {
        console.error('Error enviando mensaje:', err);
        return res.status(500).json({ success: false, error: 'Error en la base de datos' });
      }

      res.json({ success: true, message: 'Mensaje enviado correctamente', mensajeId: results.insertId });
    });
  });
});

// ========== SISTEMA DE PROGRAMACIÓN DE CITAS ==========
// Ver mis citas (para pacientes) - CORREGIDA
app.get('/ver-mis-citas', requireLogin, requireRole('paciente'), (req, res) => {
  const user = req.session.user;
  
  // Primero obtener el ID del paciente desde la tabla pacientes usando el usuario_id
  db.query('SELECT id, nombre FROM pacientes WHERE usuario_id = ?', [user.id], (err, pacienteResults) => {
    if (err) {
      console.error('Error obteniendo ID de paciente:', err);
      return res.status(500).send('Error al obtener información del paciente.');
    }
    
    if (pacienteResults.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Paciente no encontrado</title>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>⚠️ Paciente no encontrado</h1>
            <p>No se encontró un perfil de paciente asociado a tu cuenta.</p>
            <p>Por favor, contacta al administrador del sistema.</p>
            <a href="/dashboard" class="menu-btn">← Volver al inicio</a>
          </div>
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              });
          </script>
        </body>
        </html>
      `);
    }
    
    const paciente = pacienteResults[0];
    const pacienteId = paciente.id;
    
    const query = `
      SELECT 
        c.*,
        p.nombre as paciente_nombre,
        u.nombre_usuario as medico_nombre
      FROM citas c
      LEFT JOIN pacientes p ON c.paciente_id = p.id
      LEFT JOIN usuarios u ON c.medico_id = u.id
      WHERE c.paciente_id = ?
      ORDER BY c.fecha DESC, c.hora DESC
    `;
    
    db.query(query, [pacienteId], (err, results) => {
      if (err) {
        console.error('Error obteniendo citas:', err);
        return res.status(500).send('Error al obtener citas.');
      }
      
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Mis Citas</title>
          <style>
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .cita-card {
              background: white;
              border-radius: 10px;
              padding: 20px;
              margin-bottom: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              border-left: 5px solid;
            }
            .cita-card.pendiente { border-left-color: #FF9800; }
            .cita-card.confirmada { border-left-color: #4CAF50; }
            .cita-card.completada { border-left-color: #2196F3; }
            .cita-card.cancelada { border-left-color: #F44336; }
            .estado-badge {
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: bold;
            }
            .pendiente-badge { background: #FFF3E0; color: #FF9800; }
            .confirmada-badge { background: #E8F5E9; color: #4CAF50; }
            .completada-badge { background: #E3F2FD; color: #2196F3; }
            .cancelada-badge { background: #FFEBEE; color: #F44336; }
            .sin-citas {
              text-align: center;
              padding: 50px;
              color: #666;
              font-size: 18px;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>📅 Mis Citas Programadas</h1>
            
            <div style="margin-bottom: 30px;">
              <a href="/solicitar-cita" class="menu-btn" style="display: inline-block;">
                ➕ Solicitar Nueva Cita
              </a>
            </div>
      `;
      
      if (results.length > 0) {
        results.forEach(cita => {
          const fecha = new Date(cita.fecha).toLocaleDateString('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          
          let estadoClass = '';
          let estadoText = '';
          switch(cita.estado) {
            case 'pendiente':
              estadoClass = 'pendiente-badge';
              estadoText = '⏳ Pendiente';
              break;
            case 'confirmada':
              estadoClass = 'confirmada-badge';
              estadoText = '✅ Confirmada';
              break;
            case 'completada':
              estadoClass = 'completada-badge';
              estadoText = '✓ Completada';
              break;
            case 'cancelada':
              estadoClass = 'cancelada-badge';
              estadoText = '❌ Cancelada';
              break;
          }
          
          html += `
            <div class="cita-card ${cita.estado}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0;">Cita con ${cita.medico_nombre || 'Médico'}</h3>
                <span class="estado-badge ${estadoClass}">${estadoText}</span>
              </div>
              
              <div style="margin-bottom: 10px;">
                <strong>📅 Fecha:</strong> ${fecha}<br>
                <strong>⏰ Hora:</strong> ${cita.hora}<br>
                <strong>👨‍⚕️ Médico:</strong> ${cita.medico_nombre || 'No asignado'}<br>
                <strong>📋 Tipo:</strong> ${cita.tipo_cita}<br>
                <strong>📝 Motivo:</strong> ${cita.motivo || 'No especificado'}
              </div>
              
              ${cita.notas ? `<div style="margin-bottom: 10px;"><strong>📄 Notas:</strong> ${cita.notas}</div>` : ''}
              
              <div style="font-size: 12px; color: #666;">
                Creada: ${new Date(cita.fecha_creacion).toLocaleDateString('es-ES')}
              </div>
            </div>
          `;
        });
      } else {
        html += `
          <div class="sin-citas">
            <p>📭 No tienes citas programadas</p>
            <p>¡Solicita tu primera cita médica!</p>
            <a href="/solicitar-cita" class="menu-btn" style="display: inline-block; margin-top: 20px;">
              ➕ Solicitar Mi Primera Cita
            </a>
          </div>
        `;
      }
      
      html += `
            <div style="text-align: center; margin-top: 40px;">
              <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
                ← Volver al inicio
              </a>
            </div>
          </div>
          
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              })
              .catch(error => console.error('Error cargando navbar:', error));
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    });
  });
});

// Solicitar cita (para pacientes)
app.get('/solicitar-cita', requireLogin, requireRole('paciente'), (req, res) => {
  // Primero obtener el ID del paciente
  const user = req.session.user;
  
  db.query('SELECT id FROM pacientes WHERE usuario_id = ?', [user.id], (err, pacienteResults) => {
    if (err || pacienteResults.length === 0) {
      console.error('Error obteniendo ID de paciente:', err);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Error</title>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>⚠️ Error</h1>
            <p>No se pudo obtener tu información de paciente.</p>
            <p>Por favor, contacta al administrador.</p>
            <a href="/dashboard" class="menu-btn">← Volver al inicio</a>
          </div>
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              });
          </script>
        </body>
        </html>
      `);
    }
    
    const pacienteId = pacienteResults[0].id;
    
    // Obtener médicos disponibles
    db.query('SELECT id, nombre_usuario FROM usuarios WHERE tipo_usuario = "medico"', (err, medicos) => {
      if (err) {
        console.error('Error obteniendo médicos:', err);
        return res.status(500).send('Error al cargar el formulario.');
      }
      
      let medicoOptions = '';
      medicos.forEach(medico => {
        medicoOptions += `<option value="${medico.id}">👨‍⚕️ ${medico.nombre_usuario}</option>`;
      });
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Solicitar Cita</title>
          <style>
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; font-weight: bold; }
            input, select, textarea {
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 5px;
              font-size: 16px;
              box-sizing: border-box;
            }
            button {
              background: #4CAF50;
              color: white;
              padding: 12px 25px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              width: 100%;
            }
            button:hover { background: #45a049; }
            .info-text {
              color: #666;
              font-size: 14px;
              margin-top: 5px;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>📅 Solicitar Nueva Cita</h1>
            
            <div id="message" style="margin-bottom: 20px;"></div>
            
            <input type="hidden" id="paciente_id" value="${pacienteId}">
            
            <form id="citaForm">
              <div class="form-group">
                <label for="medico_id">Selecciona Médico:</label>
                <select id="medico_id" name="medico_id" required>
                  <option value="">Selecciona un médico</option>
                  ${medicoOptions}
                </select>
              </div>
              
              <div class="form-group">
                <label for="fecha">Fecha de la Cita:</label>
                <input type="date" id="fecha" name="fecha" required min="${new Date().toISOString().split('T')[0]}">
                <div class="info-text">Selecciona una fecha futura</div>
              </div>
              
              <div class="form-group">
                <label for="hora">Hora de la Cita:</label>
                <input type="time" id="hora" name="hora" required min="08:00" max="18:00">
                <div class="info-text">Horario de atención: 8:00 AM - 6:00 PM</div>
              </div>
              
              <div class="form-group">
                <label for="tipo_cita">Tipo de Cita:</label>
                <select id="tipo_cita" name="tipo_cita" required>
                  <option value="">Selecciona tipo</option>
                  <option value="Consulta General">Consulta General</option>
                  <option value="Control">Control</option>
                  <option value="Emergencia">Emergencia</option>
                  <option value="Examen">Examen</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="motivo">Motivo de la Cita:</label>
                <textarea id="motivo" name="motivo" rows="4" required placeholder="Describe brevemente el motivo de tu cita..."></textarea>
              </div>
              
              <div class="form-group">
                <label for="notas">Notas Adicionales (opcional):</label>
                <textarea id="notas" name="notas" rows="3" placeholder="Cualquier información adicional que quieras agregar..."></textarea>
              </div>
              
              <button type="submit">📅 Solicitar Cita</button>
            </form>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="/ver-mis-citas">← Volver a Mis Citas</a>
            </div>
          </div>
          
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              })
              .catch(error => console.error('Error cargando navbar:', error));
            
            document.getElementById('citaForm').addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const pacienteId = document.getElementById('paciente_id').value;
              const medicoId = document.getElementById('medico_id').value;
              const fecha = document.getElementById('fecha').value;
              const hora = document.getElementById('hora').value;
              const tipoCita = document.getElementById('tipo_cita').value;
              const motivo = document.getElementById('motivo').value;
              const notas = document.getElementById('notas').value;
              
              if (!pacienteId || !medicoId || !fecha || !hora || !tipoCita || !motivo) {
                alert('Por favor, completa todos los campos requeridos.');
                return;
              }
              
              const data = {
                paciente_id: pacienteId,
                medico_id: medicoId,
                fecha: fecha,
                hora: hora,
                tipo_cita: tipoCita,
                motivo: motivo,
                notas: notas
              };
              
              try {
                const response = await fetch('/api/citas/solicitar', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                const messageDiv = document.getElementById('message');
                if (result.success) {
                  messageDiv.innerHTML = '<div style="background: #e6ffe6; color: #008000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">✅ ' + result.message + '</div>';
                  document.getElementById('citaForm').reset();
                  
                  setTimeout(() => {
                    window.location.href = '/ver-mis-citas';
                  }, 3000);
                } else {
                  messageDiv.innerHTML = '<div style="background: #ffe6e6; color: #ff0000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">❌ ' + result.error + '</div>';
                }
              } catch (error) {
                const messageDiv = document.getElementById('message');
                messageDiv.innerHTML = '<div style="background: #ffe6e6; color: #ff0000; padding: 15px; border-radius: 5px; margin-bottom: 20px;">❌ Error de conexión: ' + error.message + '</div>';
              }
            });
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    });
  });
});

// Ver citas (para médicos)
app.get('/ver-citas', requireLogin, (req, res) => {
  const user = req.session.user;
  
  if (user.tipo_usuario === 'paciente') {
    return res.redirect('/ver-mis-citas');
  } else if (user.tipo_usuario === 'medico') {
    const query = `
      SELECT 
        c.*,
        p.nombre as paciente_nombre,
        u.nombre_usuario as medico_nombre
      FROM citas c
      LEFT JOIN pacientes p ON c.paciente_id = p.id
      LEFT JOIN usuarios u ON c.medico_id = u.id
      WHERE c.medico_id = ?
      ORDER BY c.fecha DESC, c.hora DESC
    `;
    
    db.query(query, [user.id], (err, results) => {
      if (err) {
        console.error('Error obteniendo citas:', err);
        return res.status(500).send('Error al obtener citas.');
      }
      
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Citas Médicas</title>
          <style>
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .citas-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
              gap: 20px;
            }
            .cita-card {
              background: white;
              border-radius: 10px;
              padding: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              border-left: 5px solid;
            }
            .cita-card.pendiente { border-left-color: #FF9800; }
            .cita-card.confirmada { border-left-color: #4CAF50; }
            .cita-card.completada { border-left-color: #2196F3; }
            .cita-card.cancelada { border-left-color: #F44336; }
            .estado-badge {
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: bold;
              display: inline-block;
            }
            .pendiente-badge { background: #FFF3E0; color: #FF9800; }
            .confirmada-badge { background: #E8F5E9; color: #4CAF50; }
            .completada-badge { background: #E3F2FD; color: #2196F3; }
            .cancelada-badge { background: #FFEBEE; color: #F44336; }
            .sin-citas {
              text-align: center;
              padding: 50px;
              color: #666;
              font-size: 18px;
              grid-column: 1 / -1;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>📅 Mis Citas Programadas</h1>
            
            <div class="citas-grid" id="citas-container">
      `;
      
      if (results.length > 0) {
        results.forEach(cita => {
          const fecha = new Date(cita.fecha).toLocaleDateString('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          
          let estadoClass = '';
          let estadoText = '';
          switch(cita.estado) {
            case 'pendiente':
              estadoClass = 'pendiente-badge';
              estadoText = '⏳ Pendiente';
              break;
            case 'confirmada':
              estadoClass = 'confirmada-badge';
              estadoText = '✅ Confirmada';
              break;
            case 'completada':
              estadoClass = 'completada-badge';
              estadoText = '✓ Completada';
              break;
            case 'cancelada':
              estadoClass = 'cancelada-badge';
              estadoText = '❌ Cancelada';
              break;
          }
          
          html += `
            <div class="cita-card ${cita.estado}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0;">${cita.paciente_nombre || 'Paciente'}</h3>
                <span class="estado-badge ${estadoClass}">${estadoText}</span>
              </div>
              
              <div style="margin-bottom: 10px;">
                <strong>📅 Fecha:</strong> ${fecha}<br>
                <strong>⏰ Hora:</strong> ${cita.hora}<br>
                <strong>📋 Tipo:</strong> ${cita.tipo_cita}<br>
                <strong>📝 Motivo:</strong> ${cita.motivo || 'No especificado'}
              </div>
              
              ${cita.notas ? `<div style="margin-bottom: 10px;"><strong>📄 Notas:</strong> ${cita.notas}</div>` : ''}
              
              <div style="font-size: 12px; color: #666;">
                Creada: ${new Date(cita.fecha_creacion).toLocaleDateString('es-ES')}
              </div>
            </div>
          `;
        });
      } else {
        html += `
          <div class="sin-citas">
            <p>📭 No hay citas programadas</p>
            <p>Los pacientes pueden solicitar citas contigo</p>
          </div>
        `;
      }
      
      html += `
            </div>
            
            <div style="text-align: center; margin-top: 40px;">
              <a href="/dashboard" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
                ← Volver al inicio
              </a>
            </div>
          </div>
          
          <script>
            fetch('/navbar')
              .then(response => response.text())
              .then(html => {
                document.getElementById('navbar-container').innerHTML = html;
              })
              .catch(error => console.error('Error cargando navbar:', error));
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    });
  } else {
    res.status(403).send('Acceso no autorizado');
  }
});

// ========== APIS PARA CITAS ==========
app.post('/api/citas/solicitar', requireLogin, (req, res) => {
  const user = req.session.user;
  const { paciente_id, medico_id, fecha, hora, tipo_cita, motivo, notas } = req.body;
  
  if (!paciente_id || !medico_id || !fecha || !hora || !tipo_cita || !motivo) {
    return res.status(400).json({ 
      success: false, 
      error: 'Todos los campos requeridos' 
    });
  }
  
  // Verificar que el paciente existe
  db.query('SELECT id FROM pacientes WHERE id = ?', [paciente_id], (err, pacienteResults) => {
    if (err || pacienteResults.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Paciente no encontrado' 
      });
    }
    
    // Verificar que el médico existe
    db.query('SELECT id FROM usuarios WHERE id = ? AND tipo_usuario = "medico"', [medico_id], (err, medicoResults) => {
      if (err || medicoResults.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Médico no encontrado' 
        });
      }
      
      // Verificar si ya existe una cita en ese horario
      const checkQuery = `
        SELECT id FROM citas 
        WHERE medico_id = ? 
          AND fecha = ? 
          AND hora = ? 
          AND estado IN ('pendiente', 'confirmada')
      `;
      
      db.query(checkQuery, [medico_id, fecha, hora], (err, existingCitas) => {
        if (err) {
          console.error('Error verificando citas existentes:', err);
          return res.status(500).json({ 
            success: false, 
            error: 'Error al verificar disponibilidad' 
          });
        }
        
        if (existingCitas.length > 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'El médico ya tiene una cita programada en ese horario' 
          });
        }
        
        // Insertar la cita
        const insertQuery = `
          INSERT INTO citas (paciente_id, medico_id, fecha, hora, tipo_cita, motivo, notas, estado)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')
        `;
        
        db.query(insertQuery, [paciente_id, medico_id, fecha, hora, tipo_cita, motivo, notas || null], (err, results) => {
          if (err) {
            console.error('Error insertando cita:', err);
            return res.status(500).json({ 
              success: false, 
              error: 'Error al crear la cita' 
            });
          }
          
          console.log('✅ Cita creada: ID ' + results.insertId + ', Paciente ' + paciente_id + ', Médico ' + medico_id);
          
          res.json({ 
            success: true, 
            message: 'Cita solicitada correctamente. El médico la revisará y confirmará.',
            citaId: results.insertId
          });
        });
      });
    });
  });
});

// ========== GESTIÓN DE HORARIOS MÉDICO ==========
app.get('/horarios-medico', requireLogin, requireRole('medico'), (req, res) => {
  const user = req.session.user;
  
  // Obtener los horarios existentes del médico
  const query = `
    SELECT * FROM horarios_medico 
    WHERE medico_id = ? 
    ORDER BY 
      FIELD(dia_semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'),
      hora_inicio
  `;
  
  db.query(query, [user.id], (err, horarios) => {
    if (err) {
      console.error('Error obteniendo horarios:', err);
      return res.status(500).send('Error al cargar los horarios.');
    }
    
    let horariosHtml = '';
    if (horarios.length > 0) {
      horarios.forEach(horario => {
        const dia = horario.dia_semana;
        const inicio = horario.hora_inicio.substring(0, 5);
        const fin = horario.hora_fin.substring(0, 5);
        const disponible = horario.disponible ? 'Disponible' : 'No disponible';
        const estadoColor = horario.disponible ? '#4CAF50' : '#F44336';
        
        horariosHtml += `
          <tr>
            <td>${dia}</td>
            <td>${inicio}</td>
            <td>${fin}</td>
            <td><span style="color: ${estadoColor}; font-weight: bold;">${disponible}</span></td>
            <td>
              <button onclick="eliminarHorario(${horario.id})" class="delete-btn" style="padding: 8px 15px; font-size: 14px;">
                🗑️ Eliminar
              </button>
            </td>
          </tr>
        `;
      });
    } else {
      horariosHtml = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 30px; color: #666;">
            <p>📭 No hay horarios registrados.</p>
            <p>Agrega tu primer horario para que los pacientes puedan solicitar citas.</p>
          </td>
        </tr>
      `;
    }
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Gestionar Horarios Médico</title>
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .horarios-form, .horarios-list { 
            background: white; 
            padding: 30px; 
            border-radius: 15px; 
            box-shadow: 0 5px 20px rgba(0,0,0,0.1); 
            margin-bottom: 30px; 
          }
          .form-row { 
            display: flex; 
            gap: 20px; 
            margin-bottom: 25px; 
            flex-wrap: wrap; 
            align-items: flex-end;
          }
          .form-group { flex: 1; min-width: 200px; }
          label { display: block; margin-bottom: 10px; font-weight: bold; color: #333; }
          input, select { 
            width: 100%; 
            padding: 12px 15px; 
            border: 2px solid #ddd; 
            border-radius: 8px; 
            font-size: 16px; 
            transition: border-color 0.3s;
          }
          input:focus, select:focus {
            border-color: #4CAF50;
            outline: none;
          }
          button { 
            background: #4CAF50; 
            color: white; 
            padding: 12px 25px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 16px; 
            font-weight: bold;
            transition: background 0.3s;
          }
          button:hover { background: #45a049; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px; 
          }
          th, td { 
            padding: 15px; 
            text-align: left; 
            border-bottom: 1px solid #e0e0e0; 
          }
          th { 
            background: #f5f5f5; 
            font-weight: bold; 
            color: #333;
          }
          .delete-btn { 
            background: #f44336; 
            color: white; 
            padding: 10px 18px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            font-size: 14px;
            transition: background 0.3s;
          }
          .delete-btn:hover { background: #d32f2f; }
          .message { 
            padding: 15px; 
            border-radius: 8px; 
            margin-bottom: 20px; 
            display: none; 
            font-weight: bold;
          }
          .success { background: #e6ffe6; color: #008000; border: 1px solid #b3e6b3; }
          .error { background: #ffe6e6; color: #ff0000; border: 1px solid #ffb3b3; }
          .info-box {
            background: #e3f2fd;
            border-left: 5px solid #2196F3;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 25px;
          }
          .action-buttons {
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
          }
          .action-btn {
            background: #2196F3;
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            font-size: 16px;
            display: inline-block;
          }
          .action-btn:hover {
            background: #1976D2;
          }
          .action-btn.secondary {
            background: #607D8B;
          }
          .action-btn.secondary:hover {
            background: #455A64;
          }
          @media (max-width: 768px) {
            .form-row {
              flex-direction: column;
            }
            .form-group {
              min-width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>⏰ Gestionar Horarios de Atención</h1>
          
          <div class="info-box">
            <h3 style="margin-top: 0;">📋 Información Importante</h3>
            <p>Aquí puedes configurar tus horarios de atención para que los pacientes puedan solicitar citas.</p>
            <p>• Los pacientes solo verán los horarios marcados como "Disponible".</p>
            <p>• Asegúrate de no superponer horarios en el mismo día.</p>
            <p>• Puedes tener múltiples horarios por día.</p>
          </div>
          
          <div class="action-buttons">
            <a href="/ver-citas" class="action-btn">📅 Ver Mis Citas</a>
            <a href="/ver-citas-pendientes" class="action-btn secondary">⏳ Ver Citas Pendientes</a>
          </div>
          
          <div id="message" class="message"></div>
          
          <div class="horarios-form">
            <h2>➕ Agregar Nuevo Horario</h2>
            <form id="agregarHorarioForm">
              <div class="form-row">
                <div class="form-group">
                  <label for="dia_semana">Día de la Semana</label>
                  <select id="dia_semana" name="dia_semana" required>
                    <option value="">Selecciona un día</option>
                    <option value="Lunes">Lunes</option>
                    <option value="Martes">Martes</option>
                    <option value="Miércoles">Miércoles</option>
                    <option value="Jueves">Jueves</option>
                    <option value="Viernes">Viernes</option>
                    <option value="Sábado">Sábado</option>
                    <option value="Domingo">Domingo</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="hora_inicio">Hora de Inicio</label>
                  <input type="time" id="hora_inicio" name="hora_inicio" required>
                </div>
                <div class="form-group">
                  <label for="hora_fin">Hora de Fin</label>
                  <input type="time" id="hora_fin" name="hora_fin" required>
                </div>
                <div class="form-group">
                  <label for="disponible">Disponible para Citas</label>
                  <select id="disponible" name="disponible" required>
                    <option value="1">✅ Sí, disponible</option>
                    <option value="0">❌ No disponible</option>
                  </select>
                </div>
                <div class="form-group">
                  <button type="submit">➕ Agregar Horario</button>
                </div>
              </div>
            </form>
          </div>
          
          <div class="horarios-list">
            <h2>📋 Mis Horarios de Atención</h2>
            <div style="overflow-x: auto;">
              <table>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Hora Inicio</th>
                    <th>Hora Fin</th>
                    <th>Disponibilidad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody id="horarios-table-body">
                  ${horariosHtml}
                </tbody>
              </table>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="/dashboard" class="action-btn" style="background: #2196F3;">🏠 Volver al Inicio</a>
          </div>
        </div>
        
        <script>
          fetch('/navbar')
            .then(response => response.text())
            .then(html => {
              document.getElementById('navbar-container').innerHTML = html;
            })
            .catch(error => console.error('Error cargando navbar:', error));
          
          // Manejar el envío del formulario para agregar horario
          document.getElementById('agregarHorarioForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            // Validar que la hora de fin sea posterior a la de inicio
            if (data.hora_inicio >= data.hora_fin) {
              showMessage('❌ La hora de fin debe ser posterior a la de inicio', 'error');
              return;
            }
            
            try {
              const response = await fetch('/api/horarios/agregar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              const result = await response.json();
              
              if (result.success) {
                showMessage('✅ ' + result.message, 'success');
                e.target.reset();
                // Recargar la lista de horarios después de 1.5 segundos
                setTimeout(() => location.reload(), 1500);
              } else {
                showMessage('❌ ' + result.error, 'error');
              }
            } catch (error) {
              showMessage('❌ Error de conexión: ' + error.message, 'error');
            }
          });
          
          // Función para eliminar un horario
          async function eliminarHorario(id) {
            if (!confirm('¿Estás seguro de eliminar este horario?')) return;
            
            try {
              const response = await fetch('/api/horarios/eliminar/' + id, {
                method: 'POST'
              });
              
              const result = await response.json();
              
              if (result.success) {
                showMessage('✅ ' + result.message, 'success');
                // Recargar la lista de horarios después de 1.5 segundos
                setTimeout(() => location.reload(), 1500);
              } else {
                showMessage('❌ ' + result.error, 'error');
              }
            } catch (error) {
              showMessage('❌ Error de conexión: ' + error.message, 'error');
            }
          }
          
          function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.textContent = text;
            messageDiv.className = 'message ' + type;
            messageDiv.style.display = 'block';
            
            // Ocultar el mensaje después de 5 segundos
            setTimeout(() => {
              messageDiv.style.display = 'none';
            }, 5000);
          }
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  });
});

// ========== APIs PARA HORARIOS MÉDICO ==========
app.post('/api/horarios/agregar', requireLogin, requireRole('medico'), (req, res) => {
  const user = req.session.user;
  const { dia_semana, hora_inicio, hora_fin, disponible } = req.body;
  
  if (!dia_semana || !hora_inicio || !hora_fin) {
    return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
  }
  
  // Validar que la hora de fin sea posterior a la de inicio
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ success: false, error: 'La hora de fin debe ser posterior a la de inicio' });
  }
  
  // Verificar si ya existe un horario en ese rango para el mismo día
  const checkQuery = `
    SELECT id FROM horarios_medico 
    WHERE medico_id = ? 
      AND dia_semana = ? 
      AND (
        (hora_inicio <= ? AND hora_fin >= ?) OR
        (hora_inicio <= ? AND hora_fin >= ?) OR
        (? <= hora_inicio AND ? >= hora_fin)
      )
  `;
  
  db.query(checkQuery, [user.id, dia_semana, hora_inicio, hora_inicio, hora_fin, hora_fin, hora_inicio, hora_fin], (err, results) => {
    if (err) {
      console.error('Error verificando horarios superpuestos:', err);
      return res.status(500).json({ success: false, error: 'Error al verificar horarios' });
    }
    
    if (results.length > 0) {
      return res.status(400).json({ success: false, error: 'Ya tienes un horario en ese rango de tiempo para ese día' });
    }
    
    const insertQuery = `
      INSERT INTO horarios_medico (medico_id, dia_semana, hora_inicio, hora_fin, disponible)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    db.query(insertQuery, [user.id, dia_semana, hora_inicio, hora_fin, disponible], (err, results) => {
      if (err) {
        console.error('Error agregando horario:', err);
        return res.status(500).json({ success: false, error: 'Error al guardar el horario' });
      }
      
      console.log(`✅ Horario agregado: Médico ${user.id}, ${dia_semana} ${hora_inicio}-${hora_fin}, Disponible: ${disponible}`);
      
      res.json({ 
        success: true, 
        message: 'Horario agregado correctamente',
        horarioId: results.insertId 
      });
    });
  });
});

// Eliminar horario
app.post('/api/horarios/eliminar/:id', requireLogin, requireRole('medico'), (req, res) => {
  const user = req.session.user;
  const horarioId = req.params.id;
  
  // Verificar que el horario pertenece al médico
  const query = 'DELETE FROM horarios_medico WHERE id = ? AND medico_id = ?';
  
  db.query(query, [horarioId, user.id], (err, results) => {
    if (err) {
      console.error('Error eliminando horario:', err);
      return res.status(500).json({ success: false, error: 'Error al eliminar el horario' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Horario no encontrado o no tienes permiso' });
    }
    
    console.log(`✅ Horario eliminado: ID ${horarioId}, Médico ${user.id}`);
    
    res.json({ 
      success: true, 
      message: 'Horario eliminado correctamente' 
    });
  });
});

// Ruta simplificada para ver citas pendientes
app.get('/ver-citas-pendientes', requireLogin, requireRole('medico'), (req, res) => {
  res.redirect('/ver-citas');
});

// ========== MANEJO DE ERRORES ==========
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - No encontrado</title>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <div class="container">
        <h1>404 - Página no encontrada</h1>
        <p>La página que buscas no existe.</p>
        <a href="/">Volver a la página principal</a>
      </div>
    </body>
    </html>
  `);
});

// Función para obtener IP local
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`
======================================================
   Servidor Hospitalario v2.0 - SISTEMA COMPLETO
========================================================

Accesos disponibles:
Local:          http://localhost:${PORT}
Red local:      http://${localIP}:${PORT}

HERRAMIENTAS DE DEBUG:
Estado DB:      http://localhost:${PORT}/debug/db-status

========================================================
Servidor iniciado en puerto ${PORT}
========================================================
  `);
});
