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
const mime = require('mime-types');
const os = require('os');

require('dotenv').config();
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: '-08:00'
});

// Habilitar transacciones
db.connect((err) => {
  if (err) {
    console.error('❌ Error al conectar con MySQL:', err);
    process.exit(1);
  }
  console.log('✅ Conexión a MySQL establecida');
  
  // Crear tablas necesarias si no existen
  createMensajesTable();
});

// Función para crear tabla de mensajes si no existe
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
    if (err) {
      console.error('❌ Error al crear tabla mensajes:', err.message);
    } else {
      console.log('✅ Tabla de mensajes verificada/creada correctamente');
    }
  });
}

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Función para crear un archivo Excel a partir de datos
function crearExcel(nombreArchivo, datos, columnas) {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(datos, { header: columnas });
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
  
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

// Middlewares básicos - DEBEN IR PRIMERO
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'claveSecreta123',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Debug middleware para ver todas las solicitudes
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} - Sesión: ${req.session.user ? 'SÍ' : 'NO'} - Usuario: ${req.session.user?.nombre_usuario || 'N/A'} - Tipo: ${req.session.user?.tipo_usuario || 'N/A'}`);
  next();
});

// ========== RUTAS PÚBLICAS MANUALES ==========
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/registrar', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'registrar.html'));
});

// ========== REGISTRO ESPECÍFICO PARA PACIENTES ==========
app.get('/registro-paciente', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  
  // Mostrar formulario HTML para registro de pacientes
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
          
          // Validaciones
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
          messageDiv.innerHTML = \`<div class="\${type}">\${text}</div>\`;
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

    // Validaciones
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

    // Iniciar transacción
    db.beginTransaction(async (transactionErr) => {
      if (transactionErr) {
        console.error('Error al iniciar transacción:', transactionErr);
        return res.status(500).json({ 
          success: false, 
          error: 'Error interno del servidor' 
        });
      }

      try {
        // 1. Verificar si el usuario ya existe
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

        // 2. Encriptar contraseña
        const hash = await bcrypt.hash(password, 10);

        // 3. Insertar usuario con tipo 'paciente'
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

        // 4. Insertar paciente con referencia al usuario
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

        // 5. Confirmar transacción
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
            message: `Paciente ${nombre} registrado exitosamente. Ahora puedes iniciar sesión.`,
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
    if (file.fieldname !== 'archivo') {
      return cb(new Error('Campo inesperado detectado'), false);
    }
    
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

// Middleware: requiere sesión iniciada
function requireLogin(req, res, next) {
  if (!req.session.user) {
    console.log('🔒 Acceso denegado a ruta protegida, redirigiendo a /login');
    return res.redirect('/login');
  }
  next();
}

// Middleware: verificar tipo de usuario
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    if (roles.includes(req.session.user.tipo_usuario)) {
      next();
    } else {
      console.log(`❌ Acceso denegado para ${req.session.user.tipo_usuario} a ${req.path}`);
      res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>403 - Acceso Denegado</title>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
          <div class="container">
            <h1>403 - Acceso Denegado</h1>
            <p>No tienes permiso para acceder a esta página.</p>
            <p><strong>Usuario:</strong> ${req.session.user.nombre_usuario}</p>
            <p><strong>Tipo:</strong> ${req.session.user.tipo_usuario}</p>
            <p><strong>Ruta solicitada:</strong> ${req.path}</p>
            <a href="/dashboard">Volver al inicio</a>
          </div>
        </body>
        </html>
      `);
    }
  };
}

// Middleware: solo para médicos y enfermeros (no pacientes)
function requireMedicoOrEnfermero(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  if (req.session.user.tipo_usuario === 'medico' || req.session.user.tipo_usuario === 'enfermero') {
    next();
  } else {
    console.log(`❌ Acceso denegado para paciente a mensajería: ${req.session.user.nombre_usuario}`);
    res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Acceso Restringido</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container {
            max-width: 600px;
            margin: 100px auto;
            padding: 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            text-align: center;
          }
          .icon {
            font-size: 60px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🚫</div>
          <h1>Acceso Restringido</h1>
          <p>El sistema de mensajería está disponible solo para médicos y enfermeros.</p>
          <p><strong>Usuario:</strong> ${req.session.user.nombre_usuario} (Paciente)</p>
          <p>Como paciente, puedes ver información general pero no acceder a la mensajería interna del personal médico.</p>
          <a href="/dashboard" class="menu-btn">Volver al Dashboard</a>
        </div>
      </body>
      </html>
    `);
  }
}

// ========== RUTA PARA DEBUGGING DE BASE DE DATOS ==========
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

// ========== RUTAS PROTEGIDAS ==========
app.get('/dashboard', requireLogin, async (req, res) => {
  const user = req.session.user;
  
  try {
    // Obtener ID de paciente si es paciente
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
    
    // Obtener estadísticas para el dashboard
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM pacientes) as total_pacientes,
        (SELECT COUNT(*) FROM medicamentos) as total_medicamentos,
        (SELECT COUNT(*) FROM maquinas WHERE estado = 'Disponible') as total_dispositivos,
        (SELECT COUNT(*) FROM mensajes WHERE destinatario_id = ? AND leido = FALSE) as mensajes_no_leidos,
        (SELECT COUNT(*) FROM citas WHERE estado = 'pendiente') as citas_pendientes,
        (SELECT COUNT(*) FROM citas WHERE paciente_id = ?) as mis_citas
    `;
    
    const queryParams = user.tipo_usuario === 'paciente' ? [user.id, pacienteId || 0] : [user.id, 0];
    
    const statsResults = await new Promise((resolve, reject) => {
      db.query(statsQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const stats = statsResults[0] || {};
    
    // HTML dinámico del dashboard con cuadro de mensajería
    const html = `
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
          
          .stat-card.pacientes { border-left-color: #5685c2ff; }
          .stat-card.medicamentos { border-left-color: #2196F3; }
          .stat-card.dispositivos { border-left-color: #9C27B0; }
          .stat-card.mensajes { border-left-color: #772da8ff; }
          .stat-card.citas { border-left-color: #FF9800; }
          .stat-card.mis-citas { border-left-color: #4CAF50; }
          
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
            <h1>🏥 Bienvenido, ${user.nombre_usuario} <span class="user-badge">${user.tipo_usuario.toUpperCase()}</span></h1>
            <p>Sistema de Gestión Hospitalaria - Panel de Control</p>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card pacientes">
              <div class="stat-title">Pacientes Registrados</div>
              <div class="stat-number">${stats.total_pacientes || 0}</div>
              <div>Total en el sistema</div>
            </div>
            
            ${user.tipo_usuario !== 'paciente' ? `
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
            ` : ''}
            
            ${user.tipo_usuario === 'paciente' ? `
            <div class="stat-card mis-citas">
              <div class="stat-title">Mis Citas Programadas</div>
              <div class="stat-number">${stats.mis_citas || 0}</div>
              <div>Total de mis citas</div>
            </div>
            ` : ''}
            
            ${user.tipo_usuario === 'medico' ? `
            <div class="stat-card citas">
              <div class="stat-title">Citas Pendientes</div>
              <div class="stat-number">${stats.citas_pendientes || 0}</div>
              <div>Por atender</div>
            </div>
            ` : ''}
            
            ${user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero' ? `
            <div class="stat-card mensajes">
              <div class="stat-title">Mensajes Nuevos</div>
              <div class="stat-number">${stats.mensajes_no_leidos || 0}</div>
              <div>Por leer en mensajería</div>
            </div>
            ` : ''}
          </div>
          
          <div class="modules-grid">
            <div class="module-card">
              <h3>👥 Pacientes</h3>
              <ul class="module-list">
                <li><a href="/ver-pacientes"><span class="icon">📋</span> Ver Pacientes Registrados</a></li>
                ${user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero' ? `
                <li><a href="/agregar-paciente"><span class="icon">➕</span> Agregar Nuevo Paciente</a></li>
                <li><a href="/eliminar-paciente"><span class="icon">🗑️</span> Eliminar Paciente</a></li>
                ` : ''}
              </ul>
            </div>
            
            <div class="module-card">
              <h3>📅 Citas Médicas</h3>
              <ul class="module-list">
                ${user.tipo_usuario === 'paciente' ? `
                <li><a href="/ver-mis-citas"><span class="icon">📋</span> Ver Mis Citas</a></li>
                <li><a href="/solicitar-cita"><span class="icon">➕</span> Solicitar Nueva Cita</a></li>
                ` : ''}
                ${user.tipo_usuario === 'medico' ? `
                <li><a href="/ver-citas"><span class="icon">📋</span> Ver Todas las Citas</a></li>
                <li><a href="/ver-citas-pendientes"><span class="icon">⏳</span> Ver Citas Pendientes</a></li>
                <li><a href="/horarios-medico"><span class="icon">⏰</span> Gestionar Horarios</a></li>
                ` : ''}
              </ul>
            </div>
            
            ${user.tipo_usuario !== 'paciente' ? `
            <div class="module-card">
              <h3>💊 Medicamentos</h3>
              <ul class="module-list">
                <li><a href="/ver-medicamentos"><span class="icon">📦</span> Ver Medicamentos</a></li>
                ${user.tipo_usuario === 'medico' ? `
                <li><a href="/agregar-medicamento"><span class="icon">➕</span> Agregar Medicamento</a></li>
                <li><a href="/eliminar-medicamento"><span class="icon">🗑️</span> Eliminar Medicamento</a></li>
                ` : ''}
              </ul>
            </div>
            
            <div class="module-card">
              <h3>🩺 Dispositivos Médicos</h3>
              <ul class="module-list">
                <li><a href="/ver-dispositivos"><span class="icon">⚙️</span> Ver Dispositivos</a></li>
                ${user.tipo_usuario === 'medico' ? `
                <li><a href="/agregar-dispositivo"><span class="icon">➕</span> Agregar Dispositivo</a></li>
                <li><a href="/eliminar-dispositivo"><span class="icon">🗑️</span> Eliminar Dispositivo</a></li>
                ` : ''}
              </ul>
            </div>
            ` : ''}
            
            ${user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero' ? `
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
              </ul>
            </div>
            ` : ''}
          </div>
          
          ${user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero' ? `
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
          ` : ''}
        </div>
        
        <script>
          // Cargar navbar
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
          
          ${user.tipo_usuario === 'medico' || user.tipo_usuario === 'enfermero' ? `
          // Cargar mensajes recientes
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
                    
                    html += \`
                      <div class="message-item \${msg.leido ? '' : 'unread'}">
                        <div class="message-sender">
                          \${msg.es_remitente ? '🟢 Tú' : '🔵 ' + msg.remitente_nombre}
                          <span style="float: right; font-size: 12px; font-weight: normal;">
                            \${date} \${time}
                          </span>
                        </div>
                        <div class="message-preview">
                          \${msg.mensaje.substring(0, 50)}\${msg.mensaje.length > 50 ? '...' : ''}
                        </div>
                        \${!msg.leido && !msg.es_remitente ? '<div style="font-size: 10px; color: #2196F3; margin-top: 5px;">🆕 No leído</div>' : ''}
                      </div>
                    \`;
                  });
                  
                  container.innerHTML = html;
                } else {
                  container.innerHTML = \`
                    <div style="text-align: center; padding: 30px; color: #666;">
                      <p>No tienes mensajes todavía</p>
                      <p><small>¡Envía tu primer mensaje a un colega!</small></p>
                    </div>
                  \`;
                }
              })
              .catch(error => {
                console.error('Error cargando mensajes:', error);
                document.getElementById('recent-messages').innerHTML = 
                  '<div style="text-align: center; padding: 20px; color: #ff6b6b;">Error cargando mensajes</div>';
              });
          }
          
          // Cargar mensajes al inicio
          loadRecentMessages();
          
          // Actualizar mensajes cada 30 segundos
          setInterval(loadRecentMessages, 30000);
          ` : ''}
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

// ========== RUTAS PARA CONTADORES ==========
app.get('/api/contar-pacientes', requireLogin, (req, res) => {
  db.query('SELECT COUNT(*) as total FROM pacientes', (err, results) => {
    if (err) {
      console.error('❌ Error al contar pacientes:', err);
      return res.status(500).json({ error: 'Error en la base de datos', details: err.message });
    }
    console.log(`📊 Total pacientes: ${results[0].total}`);
    res.json({ total: results[0].total });
  });
});

app.get('/api/contar-medicamentos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query('SELECT COUNT(*) as total FROM medicamentos', (err, results) => {
    if (err) {
      console.error('❌ Error al contar medicamentos:', err);
      return res.status(500).json({ error: 'Error en la base de datos', details: err.message });
    }
    console.log(`📊 Total medicamentos: ${results[0].total}`);
    res.json({ total: results[0].total });
  });
});

app.get('/api/contar-dispositivos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  db.query("SELECT COUNT(*) as total FROM maquinas WHERE estado = 'Disponible'", (err, results) => {
    if (err) {
      console.error('❌ Error al contar dispositivos:', err);
      return res.status(500).json({ error: 'Error en la base de datos', details: err.message });
    }
    console.log(`📊 Total dispositivos disponibles: ${results[0].total}`);
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

  if (!nombre_usuario || !password) {
    return res.status(400).send('Usuario y contraseña son requeridos');
  }

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

  if (!nombre_usuario || !password || !codigo_acceso) {
    return res.send('Todos los campos son requeridos');
  }

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
      
      db.query(
        'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)',
        [nombre_usuario, hash, tipo_usuario],
        (err) => {
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
  console.log(`🔗 Cargando navbar para: ${req.session.user.nombre_usuario} (${req.session.user.tipo_usuario})`);
  
  const tipo = req.session.user.tipo_usuario;
  
  // Obtener contador de mensajes no leídos (solo para médicos y enfermeros)
  if (tipo === 'medico' || tipo === 'enfermero') {
    db.query('SELECT COUNT(*) as count FROM mensajes WHERE destinatario_id = ? AND leido = FALSE', 
      [req.session.user.id], (err, countResults) => {
        if (err) {
          console.error('Error obteniendo contador de mensajes:', err);
        }
        
        const unreadCount = countResults[0]?.count || 0;
        let badge = '';
        if (unreadCount > 0) {
          badge = `<span id="message-badge" style="background: red; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; margin-left: 5px;">${unreadCount}</span>`;
        }

        let menu = `
          <nav>
            <ul>
              <li><a href="/dashboard">🏠 Inicio</a></li>
        `;

        // Solo médicos y enfermeros ven el enlace de mensajería
        if (tipo === 'medico' || tipo === 'enfermero') {
          menu += `<li><a href="/mensajeria">💬 Mensajes ${badge}</a></li>`;
        }

        if (tipo === 'medico') {
          menu += `
            <li><a href="/ver-pacientes">👥 Ver Pacientes</a></li>
            <li><a href="/ver-medicamentos">💊 Ver Medicamentos</a></li>
            <li><a href="/ver-dispositivos">🩺 Ver Dispositivos</a></li>
            <li><a href="/ver-citas">📅 Ver Citas</a></li>
            <li><a href="/horarios-medico">⏰ Horarios</a></li>
            <li><a href="/agregar-paciente">➕ Agregar Paciente</a></li>
            <li><a href="/agregar-medicamento">➕ Agregar Medicamento</a></li>
            <li><a href="/agregar-dispositivo">➕ Agregar Dispositivo</a></li>
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
            <li><a href="/agregar-paciente">➕ Agregar Paciente</a></li>
            <li><a href="/eliminar-paciente">🗑️ Eliminar Paciente</a></li>
            <li><a href="/subir-archivo">📤 Subir Archivos</a></li>
            <li><a href="/descargar-archivos">📥 Descargar archivos</a></li>
            <li><a href="/descargar-excel">📊 Descargar Excel</a></li>
          `;
        } else if (tipo === 'paciente') {
          menu += `
            <li><a href="/ver-pacientes">👥 Ver Otros Pacientes</a></li>
            <li><a href="/ver-mis-citas">📅 Ver Mis Citas</a></li>
            <li><a href="/solicitar-cita">➕ Solicitar Cita</a></li>
          `;
        }

        menu += `
              <li><a href="/logout">🚪 Cerrar Sesión</a></li>
            </ul>
          </nav>
        `;

        res.send(menu);
      });
  } else {
    // Para pacientes, no consultamos mensajes
    let menu = `
      <nav>
        <ul>
          <li><a href="/dashboard">🏠 Inicio</a></li>
    `;

    if (tipo === 'paciente') {
      menu += `
        <li><a href="/ver-pacientes">👥 Ver Otros Pacientes</a></li>
        <li><a href="/ver-mis-citas">📅 Ver Mis Citas</a></li>
        <li><a href="/solicitar-cita">➕ Solicitar Cita</a></li>
      `;
    }

    menu += `
          <li><a href="/logout">🚪 Cerrar Sesión</a></li>
        </ul>
      </nav>
    `;

    res.send(menu);
  }
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

app.get('/equipos', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'equipos.html'));
});

app.post('/upload', requireLogin, requireRole('medico', 'enfermero'), upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    const usuario = req.session.user.nombre_usuario || "admin";
    
    db.query(
      'INSERT INTO archivos_subidos (nombre_archivo, tipo, usuario, ruta) VALUES (?, ?, ?, ?)',
      [req.file.originalname, req.file.mimetype, usuario, req.file.path],
      (error, results) => {
        if (error) {
          console.error("Error al guardar en BD:", error);
          return res.status(500).json({ error: "Error en base de datos" });
        }

        const esExcel = [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ].includes(req.file.mimetype);
        
        if (esExcel) {
          try {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            console.log("Datos Excel procesados:", data.length, "registros");
          } catch (excelError) {
            console.error("Error procesando Excel:", excelError);
          }
        }

        res.json({ 
          success: true, 
          message: 'Archivo subido y registrado correctamente',
          archivo: req.file.originalname 
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      error: 'Error al subir archivo',
      details: error.message
    });
  }
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

// Ruta para descargar Excel de pacientes
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

// Ruta para descargar Excel de medicamentos
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

// Ruta para descargar Excel de dispositivos médicos
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

// Ruta para descargar Excel de citas
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

// Ruta para descargar todos los Excel en un ZIP
app.get('/descargar-todos-excel', requireLogin, requireRole('medico', 'enfermero'), async (req, res) => {
  try {
    const zip = new JSZip();
    
    // Función para agregar datos al ZIP
    const agregarAlZip = (nombreTabla, query, callback) => {
      return new Promise((resolve, reject) => {
        db.query(query, (err, results) => {
          if (err) return reject(err);
          
          callback(results);
          resolve();
        });
      });
    };
    
    // Agregar pacientes
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
    
    // Agregar medicamentos
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
    
    // Agregar dispositivos
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
    
    // Agregar citas
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
    
    // Generar el ZIP
    const zipData = await zip.generateAsync({ type: 'nodebuffer' });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=reportes_completos.zip');
    res.send(zipData);
    
  } catch (error) {
    console.error('❌ Error al generar ZIP de Excel:', error);
    res.status(500).send('Error al generar archivos ZIP');
  }
});

// Ruta para la página de descarga de Excel
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
        .download-btn.todos { 
          background: linear-gradient(135deg, #2ecc71, #3498db, #9b59b6, #FF9800);
          font-weight: bold;
          margin-top: 20px;
        }
        .download-btn.todos:hover { 
          background: linear-gradient(135deg, #27ae60, #2980b9, #8e44ad, #F57C00);
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
        // Cargar navbar
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
  console.log(`👥 Acceso a /ver-pacientes por: ${req.session.user.nombre_usuario} (${req.session.user.tipo_usuario})`);
  
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
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h1>Pacientes Registrados</h1>
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
          // Cargar navbar con manejo de errores
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
              // Mostrar navbar básico si falla
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
      console.log(`Paciente eliminado: ${paciente.nombre} (ID: ${id})`);
      res.redirect('/eliminar-paciente');
    });
  });
});

// ========== RUTAS DE MEDICAMENTOS ==========
app.get('/ver-medicamentos', requireLogin, requireRole('medico', 'enfermero'), (req, res) => {
  console.log(`💊 Acceso a /ver-medicamentos por: ${req.session.user.nombre_usuario} (${req.session.user.tipo_usuario})`);
  
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
          <h1>Medicamentos Registrados</h1>
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
  console.log(`🩺 Acceso a /ver-dispositivos por: ${req.session.user.nombre_usuario} (${req.session.user.tipo_usuario})`);
  
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
          <h1>Dispositivos Médicos Registrados</h1>
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
      html += `
              <tr>
                <td>${m.id}</td>
                <td><strong>${m.nombre}</strong></td>
                <td>${m.tipo}</td>
                <td><span style="padding: 6px 12px; border-radius: 20px; background-color: ${m.estado === 'Disponible' ? '#d4edda' : m.estado === 'En uso' ? '#fff3cd' : '#f8d7da'}; color: ${m.estado === 'Disponible' ? '#155724' : m.estado === 'En uso' ? '#856404' : '#721c24'};">${m.estado}</span></td>
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
          // Función simplificada para cargar navbar
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
                // Mostrar un navbar básico si falla
                document.getElementById('navbar-container').innerHTML = 
                  '<nav><ul><li><a href="/dashboard">🏠 Inicio</a></li><li><a href="/logout">🚪 Cerrar Sesión</a></li></ul></nav>';
              });
          }
          
          // Cargar navbar al inicio
          cargarNavbar();
          
          // Configurar búsqueda
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
        
        ${errorMessage ? `<div class="error-message">⚠️ ${errorMessage}</div>` : ''}
        
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
        // Cargar navbar
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
        
        // Validación del formulario
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
  
  // Validar campos requeridos
  if (!nombre || !tipo || !estado) {
    console.error('❌ Campos faltantes al agregar dispositivo');
    const errorMsg = encodeURIComponent('Nombre, Tipo y Estado son campos requeridos.');
    return res.redirect(`/agregar-dispositivo?error=${errorMsg}`);
  }
  
  db.query('INSERT INTO maquinas (nombre, tipo, estado) VALUES (?, ?, ?)', 
    [nombre, tipo, estado], 
    (err, results) => {
      if (err) {
        console.error('❌ Error en consulta SQL al agregar dispositivo:', err);
        const errorMsg = encodeURIComponent(`Error al guardar en la base de datos: ${err.message}`);
        return res.redirect(`/agregar-dispositivo?error=${errorMsg}`);
      }
      
      console.log(`✅ Dispositivo médico agregado: ${nombre} (ID: ${results.insertId})`);
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
      html += `
              <tr>
                <td>${m.id}</td>
                <td><strong>${m.nombre}</strong></td>
                <td>${m.tipo}</td>
                <td><span style="padding: 6px 12px; border-radius: 20px; background-color: ${m.estado === 'Disponible' ? '#d4edda' : m.estado === 'En uso' ? '#fff3cd' : '#f8d7da'}; color: ${m.estado === 'Disponible' ? '#155724' : m.estado === 'En uso' ? '#856404' : '#721c24'};">${m.estado}</span></td>
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

// ========== SISTEMA DE MENSAJERÍA (SOLO MÉDICOS Y ENFERMEROS) ==========

// Ruta principal de mensajería (solo médicos y enfermeros)
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
        let typingTimeout = null;
        
        // Cargar navbar
        fetch('/navbar')
          .then(response => response.text())
          .then(html => {
            document.getElementById('navbar-container').innerHTML = html;
          })
          .catch(error => {
            console.error('Error cargando navbar:', error);
          });
        
        // Cargar contactos iniciales
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
                    unreadBadge = \`<div class="unread-badge">\${contact.unread_count}</div>\`;
                  }
                  
                  const contactTypeClass = contact.tipo_usuario === 'medico' ? 'medico' : 'enfermero';
                  
                  contactDiv.innerHTML = \`
                    <div class="contact-info">
                      <div class="contact-name">
                        \${contact.nombre}
                        <span class="contact-type \${contactTypeClass}">\${contact.tipo_usuario}</span>
                      </div>
                      <div class="last-message">\${contact.last_message || 'No hay mensajes'}</div>
                    </div>
                    \${unreadBadge}
                  \`;
                  
                  contactsList.appendChild(contactDiv);
                });
                
                document.getElementById('online-count').textContent = \`\${data.contacts.length} colegas\`;
              } else {
                contactsList.innerHTML = \`
                  <div class="no-messages">
                    <p>No tienes conversaciones todavía</p>
                    <p><small>¡Haz clic en "Nuevo Mensaje" para comenzar!</small></p>
                  </div>
                \`;
                document.getElementById('online-count').textContent = '0 colegas';
              }
            })
            .catch(error => {
              console.error('Error cargando contactos:', error);
              document.getElementById('contacts-list').innerHTML = \`
                <div class="no-messages">
                  <p>Error cargando contactos</p>
                  <p><small>Intenta recargar la página</small></p>
                </div>
              \`;
            });
        }
        
        function loadConversation(contactId) {
          currentContactId = contactId;
          
          // Marcar como activo en la lista
          document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-contact-id') == contactId) {
              item.classList.add('active');
            }
          });
          
          // Mostrar campo de entrada
          document.getElementById('message-input-container').style.display = 'block';
          document.getElementById('current-contact-id').value = contactId;
          
          // Cargar mensajes
          fetch(\`/api/mensajes/conversacion/\${contactId}\`)
            .then(response => response.json())
            .then(data => {
              if (data.error) {
                alert(data.error);
                return;
              }
              
              // Actualizar encabezado
              document.getElementById('chat-header').innerHTML = \`
                <div class="chat-header-info">
                  <h3>\${data.contactName}</h3>
                  <small>\${data.contactType === 'medico' ? '👨‍⚕️ Médico' : '👩‍⚕️ Enfermero/a'}</small>
                </div>
                <div style="color: #666; font-size: 14px;">
                  \${data.messages && data.messages.length > 0 ? 'Última actividad reciente' : 'Sin mensajes todavía'}
                </div>
              \`;
              
              // Mostrar mensajes
              const messagesContainer = document.getElementById('messages-container');
              if (data.messages && data.messages.length > 0) {
                messagesContainer.innerHTML = '';
                
                data.messages.forEach(msg => {
                  const messageDiv = document.createElement('div');
                  messageDiv.className = \`message \${msg.sent ? 'sent' : 'received'}\`;
                  
                  const time = new Date(msg.fecha_envio).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  
                  const date = new Date(msg.fecha_envio).toLocaleDateString('es-ES');
                  
                  messageDiv.innerHTML = \`
                    \${msg.asunto ? \`<div class="message-subject">\${msg.asunto}</div>\` : ''}
                    <div class="message-content">\${msg.mensaje}</div>
                    <div class="message-time">
                      \${date} \${time}
                      \${msg.sent ? \`<span class="message-status">\${msg.leido ? '✓✓' : '✓'}</span>\` : ''}
                    </div>
                  \`;
                  
                  messagesContainer.appendChild(messageDiv);
                });
                
                // Scroll al final
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
                // Marcar mensajes como leídos
                if (data.messages.some(msg => !msg.sent && !msg.leido)) {
                  fetch(\`/api/mensajes/marcar-leidos/\${contactId}\`, { method: 'POST' });
                  
                  // Actualizar contador de no leídos
                  setTimeout(loadContacts, 100);
                }
              } else {
                messagesContainer.innerHTML = \`
                  <div class="no-messages">
                    <p>No hay mensajes todavía</p>
                    <p><small>¡Envía el primer mensaje a \${data.contactName}!</small></p>
                  </div>
                \`;
              }
            })
            .catch(error => {
              console.error('Error cargando conversación:', error);
              document.getElementById('messages-container').innerHTML = \`
                <div class="no-messages">
                  <p>Error cargando la conversación</p>
                  <p><small>Intenta nuevamente</small></p>
                </div>
              \`;
            });
        }
        
        function sendMessage(event) {
          event.preventDefault();
          
          const messageInput = document.getElementById('message-input');
          const message = messageInput.value.trim();
          const contactId = document.getElementById('current-contact-id').value;
          
          if (!message || !contactId) return;
          
          // Mostrar mensaje inmediatamente en la interfaz
          const messagesContainer = document.getElementById('messages-container');
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message sent';
          
          const now = new Date();
          const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const date = now.toLocaleDateString('es-ES');
          
          messageDiv.innerHTML = \`
            <div class="message-content">\${message}</div>
            <div class="message-time">
              \${date} \${time}
              <span class="message-status">✓</span>
            </div>
          \`;
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          
          // Limpiar input
          messageInput.value = '';
          
          // Enviar al servidor
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
              // Actualizar lista de contactos
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
                  option.textContent = \`\${icon} \${dest.nombre} (\${dest.tipo_usuario})\`;
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
              
              // Si estamos en conversación con este destinatario, recargar
              if (currentContactId == recipientId) {
                loadConversation(recipientId);
              }
              
              // Mostrar notificación de éxito
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
        
        // Actualizar mensajes cada 10 segundos
        messageInterval = setInterval(() => {
          if (currentContactId) {
            loadConversation(currentContactId);
          }
          loadContacts();
        }, 10000);
        
        // Limpiar intervalo al salir de la página
        window.addEventListener('beforeunload', () => {
          if (messageInterval) clearInterval(messageInterval);
          if (typingTimeout) clearTimeout(typingTimeout);
        });
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// ========== APIs DE MENSAJERÍA (SOLO MÉDICOS Y ENFERMEROS) ==========

// API: Obtener mensajes recientes para el dashboard
app.get('/api/mensajes/recientes', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  
  const query = `
    SELECT 
      m.*,
      u.nombre_usuario as remitente_nombre,
      u.tipo_usuario as remitente_tipo,
      CASE WHEN m.remitente_id = ? THEN true ELSE false END as es_remitente
    FROM mensajes m
    JOIN usuarios u ON m.remitente_id = u.id
    WHERE m.destinatario_id = ? OR m.remitente_id = ?
    ORDER BY m.fecha_envio DESC
    LIMIT 5
  `;
  
  db.query(query, [usuarioId, usuarioId, usuarioId], (err, results) => {
    if (err) {
      console.error('Error obteniendo mensajes recientes:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }
    
    res.json({ mensajes: results });
  });
});

// API: Obtener contactos (conversaciones existentes) - solo médicos y enfermeros
app.get('/api/mensajes/contactos', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  
  // Consulta para obtener contactos con los que hay conversación (solo médicos y enfermeros)
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

// API: Obtener destinatarios disponibles (para nuevo mensaje) - solo médicos y enfermeros
app.get('/api/mensajes/destinatarios', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  
  // SOLO médicos y enfermeros pueden ser destinatarios
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

// API: Obtener conversación con un contacto - solo entre médicos y enfermeros
app.get('/api/mensajes/conversacion/:contactoId', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  const contactoId = req.params.contactoId;
  
  // Verificar que el contacto sea médico o enfermero
  db.query('SELECT nombre_usuario, tipo_usuario FROM usuarios WHERE id = ?', [contactoId], (err, contactTypeResults) => {
    if (err || contactTypeResults.length === 0) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    
    const contact = contactTypeResults[0];
    
    // Obtener mensajes
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

// API: Enviar mensaje - solo médicos y enfermeros pueden enviar
app.post('/api/mensajes/enviar', requireLogin, requireMedicoOrEnfermero, (req, res) => {
  const usuarioId = req.session.user.id;
  const usuarioTipo = req.session.user.tipo_usuario;
  const { destinatario_id, asunto, mensaje } = req.body;
  
  if (!destinatario_id || !mensaje) {
    return res.status(400).json({ error: 'Destinatario y mensaje son requeridos' });
  }
  
  // Verificar que el remitente sea médico o enfermero
  if (usuarioTipo === 'paciente') {
    return res.status(403).json({ error: 'Los pacientes no pueden enviar mensajes' });
  }
  
  // Verificar que el destinatario exista y sea médico o enfermero
  db.query('SELECT tipo_usuario FROM usuarios WHERE id = ?', [destinatario_id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ error: 'Destinatario no encontrado' });
    }
    
    const destinatarioTipo = results[0].tipo_usuario;
    if (destinatarioTipo === 'paciente') {
      return res.status(403).json({ error: 'No se puede enviar mensajes a pacientes' });
    }
    
    // Insertar mensaje
    db.query(`
      INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_envio)
      VALUES (?, ?, ?, ?, NOW())
    `, [usuarioId, destinatario_id, asunto || null, mensaje], (err, result) => {
      if (err) {
        console.error('Error enviando mensaje:', err);
        return res.status(500).json({ error: 'Error al enviar mensaje' });
      }
      
      res.json({ 
        success: true, 
        messageId: result.insertId,
        message: 'Mensaje enviado correctamente'
      });
    });
  });
});

// API: Marcar mensajes como leídos
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

// API: Obtener contador de mensajes no leídos
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

// ========== SISTEMA DE PROGRAMACIÓN DE CITAS ==========

// Ruta para ver citas (para pacientes: sus citas, para médicos: todas las citas)
app.get('/ver-citas', requireLogin, (req, res) => {
  const user = req.session.user;
  
  if (user.tipo_usuario === 'paciente') {
    // Obtener ID del paciente
    db.query('SELECT id FROM pacientes WHERE usuario_id = ?', [user.id], (err, pacienteResults) => {
      if (err || pacienteResults.length === 0) {
        console.error('Error obteniendo ID de paciente:', err);
        return res.status(500).send('Error al obtener información del paciente.');
      }
      
      const pacienteId = pacienteResults[0].id;
      
      // Paciente: ver solo sus citas usando el ID del paciente
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
              .acciones {
                margin-top: 15px;
                display: flex;
                gap: 10px;
              }
              .accion-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
              }
              .cancelar-btn { background: #F44336; color: white; }
              .cancelar-btn:hover { background: #D32F2F; }
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
                
                ${cita.estado === 'pendiente' || cita.estado === 'confirmada' ? `
                <div class="acciones">
                  <button class="accion-btn cancelar-btn" onclick="cancelarCita(${cita.id})">
                    ❌ Cancelar Cita
                  </button>
                </div>
                ` : ''}
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
              
              function cancelarCita(citaId) {
                if (confirm('¿Estás seguro de cancelar esta cita?')) {
                  fetch('/api/citas/cancelar/' + citaId, {
                    method: 'POST'
                  })
                  .then(response => response.json())
                  .then(data => {
                    if (data.success) {
                      alert('✅ Cita cancelada correctamente');
                      location.reload();
                    } else {
                      alert('❌ Error: ' + (data.error || 'No se pudo cancelar la cita'));
                    }
                  })
                  .catch(error => {
                    alert('❌ Error de conexión');
                  });
                }
              }
            </script>
          </body>
          </html>
        `;
        
        res.send(html);
      });
    });
  } else if (user.tipo_usuario === 'medico') {
    // Médico: ver todas las citas
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
            .filtros {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 10px;
              margin-bottom: 30px;
              display: flex;
              gap: 15px;
              flex-wrap: wrap;
              align-items: center;
            }
            .filtros select, .filtros input {
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 5px;
            }
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
            .acciones {
              margin-top: 15px;
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            .accion-btn {
              padding: 8px 16px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
            }
            .confirmar-btn { background: #4CAF50; color: white; }
            .confirmar-btn:hover { background: #388E3C; }
            .completar-btn { background: #2196F3; color: white; }
            .completar-btn:hover { background: #1976D2; }
            .cancelar-btn { background: #F44336; color: white; }
            .cancelar-btn:hover { background: #D32F2F; }
            .sin-citas {
              text-align: center;
              padding: 50px;
              color: #666;
              font-size: 18px;
              grid-column: 1 / -1;
            }
            .search-box {
              flex: 1;
              min-width: 200px;
            }
            .search-box input {
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>📅 Citas Médicas Programadas</h1>
            
            <div class="filtros">
              <div class="search-box">
                <input type="text" id="buscar" placeholder="🔍 Buscar por paciente, motivo...">
              </div>
              <div>
                <select id="filtro-estado" onchange="filtrarCitas()">
                  <option value="">Todos los estados</option>
                  <option value="pendiente">⏳ Pendientes</option>
                  <option value="confirmada">✅ Confirmadas</option>
                  <option value="completada">✓ Completadas</option>
                  <option value="cancelada">❌ Canceladas</option>
                </select>
              </div>
              <div>
                <input type="date" id="filtro-fecha" onchange="filtrarCitas()">
              </div>
              <div>
                <button onclick="resetFiltros()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                  🔄 Limpiar filtros
                </button>
              </div>
            </div>
            
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
            <div class="cita-card ${cita.estado}" data-estado="${cita.estado}" data-fecha="${cita.fecha}" data-paciente="${cita.paciente_nombre.toLowerCase()}">
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
              
              <div class="acciones">
                ${cita.estado === 'pendiente' ? `
                <button class="accion-btn confirmar-btn" onclick="cambiarEstadoCita(${cita.id}, 'confirmada')">
                  ✅ Confirmar
                </button>
                ` : ''}
                
                ${cita.estado === 'confirmada' ? `
                <button class="accion-btn completar-btn" onclick="cambiarEstadoCita(${cita.id}, 'completada')">
                  ✓ Completar
                </button>
                ` : ''}
                
                ${cita.estado !== 'cancelada' && cita.estado !== 'completada' ? `
                <button class="accion-btn cancelar-btn" onclick="cambiarEstadoCita(${cita.id}, 'cancelada')">
                  ❌ Cancelar
                </button>
                ` : ''}
                
                <button class="accion-btn" onclick="editarNotasCita(${cita.id}, '${cita.notas || ''}')" style="background: #FF9800; color: white;">
                  📝 Notas
                </button>
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
            
            function filtrarCitas() {
              const busqueda = document.getElementById('buscar').value.toLowerCase();
              const estado = document.getElementById('filtro-estado').value;
              const fecha = document.getElementById('filtro-fecha').value;
              
              const citas = document.querySelectorAll('.cita-card');
              citas.forEach(cita => {
                const citaEstado = cita.getAttribute('data-estado');
                const citaFecha = cita.getAttribute('data-fecha');
                const citaPaciente = cita.getAttribute('data-paciente');
                const citaTexto = cita.textContent.toLowerCase();
                
                let mostrar = true;
                
                // Filtrar por búsqueda
                if (busqueda && !citaTexto.includes(busqueda) && !citaPaciente.includes(busqueda)) {
                  mostrar = false;
                }
                
                // Filtrar por estado
                if (estado && citaEstado !== estado) {
                  mostrar = false;
                }
                
                // Filtrar por fecha
                if (fecha && citaFecha !== fecha) {
                  mostrar = false;
                }
                
                cita.style.display = mostrar ? '' : 'none';
              });
            }
            
            function resetFiltros() {
              document.getElementById('buscar').value = '';
              document.getElementById('filtro-estado').value = '';
              document.getElementById('filtro-fecha').value = '';
              
              const citas = document.querySelectorAll('.cita-card');
              citas.forEach(cita => {
                cita.style.display = '';
              });
            }
            
            function cambiarEstadoCita(citaId, nuevoEstado) {
              const estados = {
                'confirmada': 'Confirmar',
                'completada': 'Completar',
                'cancelada': 'Cancelar'
              };
              
             if (confirm('¿Estás seguro de ' + (estados[nuevoEstado] || 'cambiar el estado de') + ' esta cita?')) {

                fetch('/api/citas/cambiar-estado/' + citaId, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ estado: nuevoEstado })
                })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    alert('✅ Estado actualizado correctamente');
                    location.reload();
                  } else {
                    alert('❌ Error: ' + (data.error || 'No se pudo actualizar el estado'));
                  }
                })
                .catch(error => {
                  alert('❌ Error de conexión');
                });
              }
            }
            
            function editarNotasCita(citaId, notasActuales) {
              const nuevasNotas = prompt('Editar notas de la cita:', notasActuales);
              if (nuevasNotas !== null) {
                fetch('/api/citas/editar-notas/' + citaId, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ notas: nuevasNotas })
                })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    alert('✅ Notas actualizadas correctamente');
                    location.reload();
                  } else {
                    alert('❌ Error: ' + (data.error || 'No se pudieron actualizar las notas'));
                  }
                })
                .catch(error => {
                  alert('❌ Error de conexión');
                });
              }
            }
            
            // Configurar búsqueda en tiempo real
            document.getElementById('buscar').addEventListener('keyup', filtrarCitas);
            document.getElementById('buscar').addEventListener('search', filtrarCitas);
            
            // Establecer fecha mínima para el filtro
            document.getElementById('filtro-fecha').min = new Date().toISOString().split('T')[0];
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

// Ruta para que pacientes soliciten citas
app.get('/solicitar-cita', requireLogin, requireRole('paciente'), (req, res) => {
  const user = req.session.user;
  
  // Obtener médicos disponibles
  db.query('SELECT id, nombre_usuario FROM usuarios WHERE tipo_usuario = "medico"', (err, medicos) => {
    if (err) {
      console.error('Error obteniendo médicos:', err);
      return res.status(500).send('Error al cargar el formulario.');
    }
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Solicitar Cita Médica</title>
        <style>
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
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
          button:hover {
            background: #45a049;
          }
          .info-text {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
          }
          .error-message {
            color: #ff0000;
            background: #ffe6e6;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .success-message {
            color: #008000;
            background: #e6ffe6;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .horario-info {
            background: #e8f4fd;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #2196F3;
          }
        </style>
      </head>
      <body>
        <div id="navbar-container"></div>
        <div class="container">
          <h2>📅 Solicitar Nueva Cita Médica</h2>
          
          <div id="message"></div>
          
          <form id="citaForm">
            <div class="form-group">
              <label for="medico_id">👨‍⚕️ Seleccionar Médico:</label>
              <select id="medico_id" name="medico_id" required>
                <option value="">-- Selecciona un médico --</option>
    `;
    
    medicos.forEach(medico => {
      html += `<option value="${medico.id}">${medico.nombre_usuario}</option>`;
    });
    
    html += `
              </select>
              <div class="info-text">Elige el médico con el que deseas la consulta</div>
            </div>
            
            <div class="form-group">
              <label for="fecha">📅 Fecha de la Cita:</label>
              <input type="date" id="fecha" name="fecha" required 
                     min="${new Date().toISOString().split('T')[0]}">
              <div class="info-text">Selecciona la fecha para tu cita</div>
            </div>
            
            <div class="form-group">
              <label for="hora">⏰ Hora de la Cita:</label>
              <input type="time" id="hora" name="hora" required 
                     min="08:00" max="18:00" step="900">
              <div class="info-text">Horario de atención: 8:00 AM - 6:00 PM (en intervalos de 15 min)</div>
            </div>
            
            <div class="form-group">
              <label for="tipo_cita">📋 Tipo de Consulta:</label>
              <select id="tipo_cita" name="tipo_cita" required>
                <option value="">-- Selecciona el tipo --</option>
                <option value="Consulta General">Consulta General</option>
                <option value="Control Rutinario">Control Rutinario</option>
                <option value="Seguimiento">Seguimiento</option>
                <option value="Urgencia">Urgencia</option>
                <option value="Especialidad">Especialidad</option>
                <option value="Otro">Otro</option>
              </select>
              <div class="info-text">Especifica el tipo de consulta que necesitas</div>
            </div>
            
            <div class="form-group">
              <label for="motivo">📝 Motivo de la Consulta:</label>
              <textarea id="motivo" name="motivo" required 
                        placeholder="Describe brevemente el motivo de tu consulta..."></textarea>
              <div class="info-text">Esta información ayudará al médico a prepararse</div>
            </div>
            
            <div class="horario-info">
              <strong>📋 Información importante:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Las citas tienen una duración de 30 minutos</li>
                <li>Recibirás confirmación por parte del médico</li>
                <li>Puedes cancelar o modificar hasta 24 horas antes</li>
                <li>Llega 10 minutos antes de tu cita</li>
              </ul>
            </div>
            
            <button type="submit">📅 Solicitar Cita</button>
          </form>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="/ver-mis-citas" style="color: #0066cc; text-decoration: none;">
              ← Ver mis citas programadas
            </a>
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
          
          document.getElementById('citaForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = Object.fromEntries(formData.entries());
            
            // Validar hora
            const hora = data.hora;
            const horaNum = parseInt(hora.split(':')[0]);
            if (horaNum < 8 || horaNum > 18) {
              showMessage('❌ La hora debe estar entre 8:00 y 18:00', 'error');
              return;
            }
            
            // Validar fecha
            const fechaSeleccionada = new Date(data.fecha);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            
            if (fechaSeleccionada < hoy) {
              showMessage('❌ No puedes solicitar citas en fechas pasadas', 'error');
              return;
            }
            
            // Calcular fecha límite (2 semanas)
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() + 14);
            
            if (fechaSeleccionada > fechaLimite) {
              showMessage('❌ Solo puedes solicitar citas con máximo 2 semanas de anticipación', 'error');
              return;
            }
            
            showMessage('⏳ Enviando solicitud de cita...', 'info');
            
            try {
              const response = await fetch('/api/citas/solicitar', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
              });
              
              if (response.ok) {
                const result = await response.json();
                if (result.success) {
                  showMessage('✅ ' + result.message, 'success');
                  // Limpiar formulario
                  document.getElementById('citaForm').reset();
                  // Redirigir después de 2 segundos
                  setTimeout(() => {
                    window.location.href = '/ver-mis-citas';
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
            messageDiv.innerHTML = \`<div class="\${type}-message">\${text}</div>\`;
          }
          
          // Establecer fecha mínima (hoy)
          const today = new Date().toISOString().split('T')[0];
          document.getElementById('fecha').min = today;
          
          // Establecer fecha máxima (2 semanas)
          const maxDate = new Date();
          maxDate.setDate(maxDate.getDate() + 14);
          document.getElementById('fecha').max = maxDate.toISOString().split('T')[0];
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  });
});

// Alias para ver-mis-citas (para pacientes)
app.get('/ver-mis-citas', requireLogin, requireRole('paciente'), (req, res) => {
  res.redirect('/ver-citas');
});

// Ruta para que médicos vean citas pendientes
app.get('/ver-citas-pendientes', requireLogin, requireRole('medico'), (req, res) => {
  const user = req.session.user;
  
  const query = `
    SELECT 
      c.*,
      p.nombre as paciente_nombre,
      u.nombre_usuario as medico_nombre
    FROM citas c
    LEFT JOIN pacientes p ON c.paciente_id = p.id
    LEFT JOIN usuarios u ON c.medico_id = u.id
    WHERE c.medico_id = ? AND c.estado = 'pendiente'
    ORDER BY c.fecha ASC, c.hora ASC
  `;
  
  db.query(query, [user.id], (err, results) => {
    if (err) {
      console.error('Error obteniendo citas pendientes:', err);
      return res.status(500).send('Error al obtener citas.');
    }
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Citas Pendientes</title>
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .cita-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 5px solid #FF9800;
          }
          .estado-badge {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            background: #FFF3E0;
            color: #FF9800;
            display: inline-block;
          }
          .acciones {
            margin-top: 15px;
            display: flex;
            gap: 10px;
          }
          .accion-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          }
          .confirmar-btn { background: #4CAF50; color: white; }
          .confirmar-btn:hover { background: #388E3C; }
          .cancelar-btn { background: #F44336; color: white; }
          .cancelar-btn:hover { background: #D32F2F; }
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
          <h1>⏳ Citas Pendientes de Confirmación</h1>
    `;
    
    if (results.length > 0) {
      results.forEach(cita => {
        const fecha = new Date(cita.fecha).toLocaleDateString('es-ES', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        
        html += `
          <div class="cita-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3 style="margin: 0;">${cita.paciente_nombre || 'Paciente'}</h3>
              <span class="estado-badge">⏳ Pendiente</span>
            </div>
            
            <div style="margin-bottom: 10px;">
              <strong>📅 Fecha:</strong> ${fecha}<br>
              <strong>⏰ Hora:</strong> ${cita.hora}<br>
              <strong>📋 Tipo:</strong> ${cita.tipo_cita}<br>
              <strong>📝 Motivo:</strong> ${cita.motivo || 'No especificado'}
            </div>
            
            ${cita.notas ? `<div style="margin-bottom: 10px;"><strong>📄 Notas:</strong> ${cita.notas}</div>` : ''}
            
            <div style="font-size: 12px; color: #666;">
              Solicitada: ${new Date(cita.fecha_creacion).toLocaleDateString('es-ES')}
            </div>
            
            <div class="acciones">
              <button class="accion-btn confirmar-btn" onclick="cambiarEstadoCita(${cita.id}, 'confirmada')">
                ✅ Confirmar Cita
              </button>
              <button class="accion-btn cancelar-btn" onclick="cambiarEstadoCita(${cita.id}, 'cancelada')">
                ❌ Rechazar Cita
              </button>
              <button class="accion-btn" onclick="editarNotasCita(${cita.id}, '${cita.notas || ''}')" style="background: #FF9800; color: white;">
                📝 Agregar Notas
              </button>
            </div>
          </div>
        `;
      });
    } else {
      html += `
        <div class="sin-citas">
          <p>🎉 No tienes citas pendientes de confirmación</p>
          <p>Todas tus citas están confirmadas o procesadas</p>
        </div>
      `;
    }
    
    html += `
          <div style="text-align: center; margin-top: 40px;">
            <a href="/ver-citas" class="menu-btn" style="display: inline-block; width: auto; padding: 12px 30px;">
              ← Ver todas las citas
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
          
          function cambiarEstadoCita(citaId, nuevoEstado) {
            const accion = nuevoEstado === 'confirmada' ? 'confirmar' : 'rechazar';
            
            if (confirm(\`¿Estás seguro de \${accion} esta cita?\`)) {
              fetch('/api/citas/cambiar-estado/' + citaId, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: nuevoEstado })
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  alert('✅ Cita ' + (nuevoEstado === 'confirmada' ? 'confirmada' : 'rechazada') + ' correctamente');
                  location.reload();
                } else {
                  alert('❌ Error: ' + (data.error || 'No se pudo actualizar el estado'));
                }
              })
              .catch(error => {
                alert('❌ Error de conexión');
              });
            }
          }
          
          function editarNotasCita(citaId, notasActuales) {
            const nuevasNotas = prompt('Agregar o editar notas para esta cita:', notasActuales);
            if (nuevasNotas !== null) {
              fetch('/api/citas/editar-notas/' + citaId, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notas: nuevasNotas })
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  alert('✅ Notas actualizadas correctamente');
                  location.reload();
                } else {
                  alert('❌ Error: ' + (data.error || 'No se pudieron actualizar las notas'));
                }
              })
              .catch(error => {
                alert('❌ Error de conexión');
              });
            }
          }
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  });
});

// Ruta para que médicos gestionen sus horarios
app.get('/horarios-medico', requireLogin, requireRole('medico'), (req, res) => {
  // Crear tabla horarios_medicos si no existe
  const createHorariosTable = `
    CREATE TABLE IF NOT EXISTS horarios_medicos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      medico_id INT NOT NULL,
      dia_semana INT NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fin TIME NOT NULL,
      duracion_cita INT DEFAULT 30,
      activo BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (medico_id) REFERENCES usuarios(id)
    )
  `;
  
  db.query(createHorariosTable, (err) => {
    if (err) {
      console.error('Error creando tabla horarios_medicos:', err);
    }
    
    const user = req.session.user;
    
    // Obtener horarios actuales del médico
    const query = `
      SELECT * FROM horarios_medicos 
      WHERE medico_id = ? 
      ORDER BY dia_semana ASC, hora_inicio ASC
    `;
    
    db.query(query, [user.id], (err, horarios) => {
      if (err) {
        console.error('Error obteniendo horarios:', err);
        return res.status(500).send('Error al cargar horarios.');
      }
      
      const diasSemana = [
        { id: 1, nombre: 'Lunes' },
        { id: 2, nombre: 'Martes' },
        { id: 3, nombre: 'Miércoles' },
        { id: 4, nombre: 'Jueves' },
        { id: 5, nombre: 'Viernes' },
        { id: 6, nombre: 'Sábado' },
        { id: 7, nombre: 'Domingo' }
      ];
      
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Gestionar Horarios</title>
          <style>
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .horarios-container {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 20px;
              margin-bottom: 40px;
            }
            .dia-card {
              background: white;
              border-radius: 10px;
              padding: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .dia-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 2px solid #f0f0f0;
            }
            .horario-item {
              background: #f8f9fa;
              padding: 10px;
              border-radius: 5px;
              margin-bottom: 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .horario-info {
              font-size: 14px;
            }
            .horario-acciones button {
              padding: 5px 10px;
              border: none;
              border-radius: 3px;
              cursor: pointer;
              font-size: 12px;
              margin-left: 5px;
            }
            .btn-eliminar {
              background: #F44336;
              color: white;
            }
            .btn-desactivar {
              background: #FF9800;
              color: white;
            }
            .btn-activar {
              background: #4CAF50;
              color: white;
            }
            .sin-horarios {
              color: #666;
              font-style: italic;
              text-align: center;
              padding: 20px;
            }
            .form-agregar {
              background: #e8f4fd;
              padding: 20px;
              border-radius: 10px;
              margin-bottom: 30px;
            }
            .form-row {
              display: flex;
              gap: 15px;
              margin-bottom: 15px;
              flex-wrap: wrap;
            }
            .form-group {
              flex: 1;
              min-width: 200px;
            }
            .form-group label {
              display: block;
              margin-bottom: 5px;
              font-weight: bold;
            }
            .form-group input, .form-group select {
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 5px;
            }
            .btn-submit {
              background: #2196F3;
              color: white;
              padding: 12px 25px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
            }
            .btn-submit:hover {
              background: #1976D2;
            }
            .info-box {
              background: #e8f5e9;
              padding: 15px;
              border-radius: 5px;
              margin-bottom: 20px;
              border-left: 4px solid #4CAF50;
            }
          </style>
        </head>
        <body>
          <div id="navbar-container"></div>
          <div class="container">
            <h1>⏰ Gestionar Horarios de Atención</h1>
            
            <div class="info-box">
              <p><strong>📋 Instrucciones:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Configura tus horarios de atención por día de la semana</li>
                <li>Los pacientes solo podrán solicitar citas en estos horarios</li>
                <li>Puedes tener múltiples franjas horarias por día</li>
                <li>La duración predeterminada de cada cita es de 30 minutos</li>
              </ul>
            </div>
            
            <div class="form-agregar">
              <h3>➕ Agregar Nuevo Horario</h3>
              <form id="formHorario">
                <div class="form-row">
                  <div class="form-group">
                    <label for="dia_semana">📅 Día de la semana:</label>
                    <select id="dia_semana" name="dia_semana" required>
                      <option value="">-- Selecciona un día --</option>
      `;
      
      diasSemana.forEach(dia => {
        html += `<option value="${dia.id}">${dia.nombre}</option>`;
      });
      
      html += `
                    </select>
                  </div>
                  
                  <div class="form-group">
                    <label for="hora_inicio">⏰ Hora de inicio:</label>
                    <input type="time" id="hora_inicio" name="hora_inicio" required 
                           min="08:00" max="20:00" step="900">
                  </div>
                  
                  <div class="form-group">
                    <label for="hora_fin">⏰ Hora de fin:</label>
                    <input type="time" id="hora_fin" name="hora_fin" required 
                           min="08:00" max="20:00" step="900">
                  </div>
                </div>
                
                <div class="form-row">
                  <div class="form-group">
                    <label for="duracion_cita">⏱️ Duración de cita (minutos):</label>
                    <input type="number" id="duracion_cita" name="duracion_cita" 
                           value="30" min="15" max="120" step="5">
                  </div>
                  
                  <div class="form-group" style="align-self: flex-end;">
                    <button type="submit" class="btn-submit">
                      💾 Guardar Horario
                    </button>
                  </div>
                </div>
              </form>
            </div>
            
            <h2>📋 Horarios Configurados</h2>
            <div class="horarios-container">
      `;
      
      // Agrupar horarios por día
      const horariosPorDia = {};
      horarios.forEach(horario => {
        if (!horariosPorDia[horario.dia_semana]) {
          horariosPorDia[horario.dia_semana] = [];
        }
        horariosPorDia[horario.dia_semana].push(horario);
      });
      
      diasSemana.forEach(dia => {
        const horariosDia = horariosPorDia[dia.id] || [];
        
        html += `
          <div class="dia-card">
            <div class="dia-header">
              <h3 style="margin: 0;">${dia.nombre}</h3>
              <span style="font-size: 12px; color: #666;">${horariosDia.length} horario(s)</span>
            </div>
        `;
        
        if (horariosDia.length > 0) {
          horariosDia.forEach(horario => {
            const estado = horario.activo ? '✅ Activo' : '⏸️ Inactivo';
            const btnEstado = horario.activo 
              ? `<button class="btn-desactivar" onclick="cambiarEstadoHorario(${horario.id}, false)">⏸️ Desactivar</button>`
              : `<button class="btn-activar" onclick="cambiarEstadoHorario(${horario.id}, true)">✅ Activar</button>`;
            
            html += `
              <div class="horario-item">
                <div class="horario-info">
                  <strong>${horario.hora_inicio} - ${horario.hora_fin}</strong><br>
                  <small>Duración: ${horario.duracion_cita} min • ${estado}</small>
                </div>
                <div class="horario-acciones">
                  ${btnEstado}
                  <button class="btn-eliminar" onclick="eliminarHorario(${horario.id})">🗑️</button>
                </div>
              </div>
            `;
          });
        } else {
          html += `
            <div class="sin-horarios">
              <p>No hay horarios configurados</p>
              <small>Agrega un horario usando el formulario</small>
            </div>
          `;
        }
        
        html += `</div>`;
      });
      
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
            
            document.getElementById('formHorario').addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const formData = new FormData(this);
              const data = Object.fromEntries(formData.entries());
              
              // Validar horas
              const horaInicio = new Date('2000-01-01T' + data.hora_inicio + ':00');
              const horaFin = new Date('2000-01-01T' + data.hora_fin + ':00');
              
              if (horaFin <= horaInicio) {
                alert('❌ La hora de fin debe ser posterior a la hora de inicio');
                return;
              }
              
              // Validar duración
              if (data.duracion_cita < 15 || data.duracion_cita > 120) {
                alert('❌ La duración debe estar entre 15 y 120 minutos');
                return;
              }
              
              try {
                const response = await fetch('/api/horarios/agregar', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(data)
                });
                
                if (response.ok) {
                  const result = await response.json();
                  if (result.success) {
                    alert('✅ Horario agregado correctamente');
                    location.reload();
                  } else {
                    alert('❌ ' + result.error);
                  }
                } else {
                  const error = await response.json();
                  alert('❌ ' + (error.error || 'Error en el servidor'));
                }
              } catch (error) {
                alert('❌ Error de conexión: ' + error.message);
              }
            });
            
            function cambiarEstadoHorario(horarioId, activo) {
              fetch('/api/horarios/cambiar-estado/' + horarioId, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activo: activo })
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  alert('✅ Estado actualizado correctamente');
                  location.reload();
                } else {
                  alert('❌ Error: ' + (data.error || 'No se pudo actualizar el estado'));
                }
              })
              .catch(error => {
                alert('❌ Error de conexión');
              });
            }
            
            function eliminarHorario(horarioId) {
              if (confirm('¿Estás seguro de eliminar este horario?')) {
                fetch('/api/horarios/eliminar/' + horarioId, {
                  method: 'DELETE'
                })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    alert('✅ Horario eliminado correctamente');
                    location.reload();
                  } else {
                    alert('❌ Error: ' + (data.error || 'No se pudo eliminar el horario'));
                  }
                })
                .catch(error => {
                  alert('❌ Error de conexión');
                });
              }
            }
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    });
  });
});

// ========== APIs PARA CITAS ==========

// API: Solicitar cita (pacientes)
app.post('/api/citas/solicitar', requireLogin, requireRole('paciente'), async (req, res) => {
  const user = req.session.user;
  const { medico_id, fecha, hora, tipo_cita, motivo, notas } = req.body;
  
  // Validaciones
  if (!medico_id || !fecha || !hora || !tipo_cita || !motivo) {
    return res.status(400).json({ 
      success: false, 
      error: 'Todos los campos requeridos' 
    });
  }
  
  // Verificar que la fecha no sea pasada
  const fechaCita = new Date(fecha);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  if (fechaCita < hoy) {
    return res.status(400).json({ 
      success: false, 
      error: 'No puedes solicitar citas en fechas pasadas' 
    });
  }
  
  try {
    // Obtener ID del paciente
    const pacienteResult = await new Promise((resolve, reject) => {
      db.query('SELECT id FROM pacientes WHERE usuario_id = ?', [user.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (pacienteResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Paciente no encontrado' 
      });
    }
    
    const paciente_id = pacienteResult[0].id;
    
    // Verificar que el médico exista
    const medicoResult = await new Promise((resolve, reject) => {
      db.query('SELECT id FROM usuarios WHERE id = ? AND tipo_usuario = "medico"', [medico_id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (medicoResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Médico no encontrado' 
      });
    }
    
    // Verificar si ya existe una cita en esa fecha y hora con ese médico
    const checkQuery = `
      SELECT id FROM citas 
      WHERE medico_id = ? 
        AND fecha = ? 
        AND hora = ? 
        AND estado IN ('pendiente', 'confirmada')
    `;
    
    const existingCitas = await new Promise((resolve, reject) => {
      db.query(checkQuery, [medico_id, fecha, hora], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (existingCitas.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El médico ya tiene una cita programada en ese horario' 
      });
    }
    
    // Crear tabla citas si no existe
    const createCitasTable = `
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
        FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
        FOREIGN KEY (medico_id) REFERENCES usuarios(id)
      )
    `;
    
    await new Promise((resolve, reject) => {
      db.query(createCitasTable, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Insertar la cita
    const insertQuery = `
      INSERT INTO citas (paciente_id, medico_id, fecha, hora, tipo_cita, motivo, notas, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')
    `;
    
    const result = await new Promise((resolve, reject) => {
      db.query(insertQuery, [paciente_id, medico_id, fecha, hora, tipo_cita, motivo, notas || null], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    console.log(`✅ Cita solicitada: ID ${result.insertId}, Paciente ${paciente_id}, Médico ${medico_id}`);
    
    res.json({ 
      success: true, 
      message: 'Cita solicitada correctamente. El médico la revisará y confirmará.',
      citaId: result.insertId
    });
    
  } catch (error) {
    console.error('Error solicitando cita:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al solicitar la cita' 
    });
  }
});

// API: Cambiar estado de cita (médicos y pacientes)
app.post('/api/citas/cambiar-estado/:id', requireLogin, async (req, res) => {
  const user = req.session.user;
  const citaId = req.params.id;
  const { estado } = req.body;
  
  if (!estado || !['confirmada', 'completada', 'cancelada'].includes(estado)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Estado inválido' 
    });
  }
  
  try {
    // Verificar que la cita exista y el usuario tenga permisos
    const checkQuery = `
      SELECT c.*, p.usuario_id as paciente_usuario_id 
      FROM citas c
      LEFT JOIN pacientes p ON c.paciente_id = p.id
      WHERE c.id = ?
    `;
    
    const citaResults = await new Promise((resolve, reject) => {
      db.query(checkQuery, [citaId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (citaResults.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cita no encontrada' 
      });
    }
    
    const cita = citaResults[0];
    
    // Verificar permisos
    const puedeModificar = user.tipo_usuario === 'medico' 
      ? cita.medico_id === user.id
      : cita.paciente_usuario_id === user.id;
    
    if (!puedeModificar) {
      return res.status(403).json({ 
        success: false, 
        error: 'No tienes permiso para modificar esta cita' 
      });
    }
    
    // Restricciones adicionales para pacientes
    if (user.tipo_usuario === 'paciente' && estado !== 'cancelada') {
      return res.status(403).json({ 
        success: false, 
        error: 'Los pacientes solo pueden cancelar citas' 
      });
    }
    
    // Verificar que no se cancele una cita completada
    if (cita.estado === 'completada' && estado === 'cancelada') {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede cancelar una cita ya completada' 
      });
    }
    
    // Actualizar estado
    const updateQuery = `
      UPDATE citas 
      SET estado = ?, 
          fecha_actualizacion = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    await new Promise((resolve, reject) => {
      db.query(updateQuery, [estado, citaId], (err, updateResult) => {
        if (err) reject(err);
        else resolve(updateResult);
      });
    });
    
    console.log(`✅ Estado de cita ${citaId} actualizado a ${estado} por ${user.nombre_usuario}`);
    
    res.json({ 
      success: true, 
      message: `Cita ${estado} correctamente`
    });
    
  } catch (error) {
    console.error('Error actualizando estado de cita:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al actualizar el estado' 
    });
  }
});

// API: Editar notas de cita (médicos)
app.post('/api/citas/editar-notas/:id', requireLogin, requireRole('medico'), async (req, res) => {
  const user = req.session.user;
  const citaId = req.params.id;
  const { notas } = req.body;
  
  try {
    // Verificar que la cita exista y pertenezca al médico
    const checkQuery = 'SELECT id FROM citas WHERE id = ? AND medico_id = ?';
    
    const citaResults = await new Promise((resolve, reject) => {
      db.query(checkQuery, [citaId, user.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (citaResults.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cita no encontrada o no tienes permiso' 
      });
    }
    
    // Actualizar notas
    const updateQuery = 'UPDATE citas SET notas = ? WHERE id = ?';
    
    await new Promise((resolve, reject) => {
      db.query(updateQuery, [notas || null, citaId], (err, updateResult) => {
        if (err) reject(err);
        else resolve(updateResult);
      });
    });
    
    console.log(`✅ Notas de cita ${citaId} actualizadas por ${user.nombre_usuario}`);
    
    res.json({ 
      success: true, 
      message: 'Notas actualizadas correctamente'
    });
    
  } catch (error) {
    console.error('Error actualizando notas de cita:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al actualizar las notas' 
    });
  }
});

// API: Cancelar cita (alias para pacientes)
app.post('/api/citas/cancelar/:id', requireLogin, requireRole('paciente'), (req, res) => {
  req.body = { estado: 'cancelada' };
  app._router.handle(req, res, () => {});
});

// ========== APIs PARA HORARIOS MÉDICOS ==========

// API: Agregar horario (médicos)
app.post('/api/horarios/agregar', requireLogin, requireRole('medico'), async (req, res) => {
  const user = req.session.user;
  const { dia_semana, hora_inicio, hora_fin, duracion_cita } = req.body;
  
  // Validaciones
  if (!dia_semana || !hora_inicio || !hora_fin) {
    return res.status(400).json({ 
      success: false, 
      error: 'Día, hora de inicio y hora de fin son requeridos' 
    });
  }
  
  // Validar que hora_fin sea posterior a hora_inicio
  if (hora_fin <= hora_inicio) {
    return res.status(400).json({ 
      success: false, 
      error: 'La hora de fin debe ser posterior a la hora de inicio' 
    });
  }
  
  try {
    // Verificar si ya existe un horario que se solape
    const checkQuery = `
      SELECT id FROM horarios_medicos 
      WHERE medico_id = ? 
        AND dia_semana = ? 
        AND (
          (hora_inicio <= ? AND hora_fin > ?) OR
          (hora_inicio < ? AND hora_fin >= ?) OR
          (hora_inicio >= ? AND hora_fin <= ?)
        )
    `;
    
    const existingHorarios = await new Promise((resolve, reject) => {
      db.query(checkQuery, [user.id, dia_semana, hora_inicio, hora_inicio, hora_fin, hora_fin, hora_inicio, hora_fin], 
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
    });
    
    if (existingHorarios.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe un horario que se solapa con este intervalo' 
      });
    }
    
    // Insertar horario
    const insertQuery = `
      INSERT INTO horarios_medicos (medico_id, dia_semana, hora_inicio, hora_fin, duracion_cita, activo)
      VALUES (?, ?, ?, ?, ?, TRUE)
    `;
    
    const result = await new Promise((resolve, reject) => {
      db.query(insertQuery, [user.id, dia_semana, hora_inicio, hora_fin, duracion_cita || 30], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    console.log(`✅ Horario agregado: Médico ${user.id}, Día ${dia_semana}, ${hora_inicio}-${hora_fin}`);
    
    res.json({ 
      success: true, 
      message: 'Horario agregado correctamente',
      horarioId: result.insertId
    });
    
  } catch (error) {
    console.error('Error insertando horario:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al guardar el horario' 
    });
  }
});

// API: Cambiar estado de horario (médicos)
app.post('/api/horarios/cambiar-estado/:id', requireLogin, requireRole('medico'), async (req, res) => {
  const user = req.session.user;
  const horarioId = req.params.id;
  const { activo } = req.body;
  
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ 
      success: false, 
      error: 'Estado inválido' 
    });
  }
  
  try {
    // Verificar que el horario exista y pertenezca al médico
    const checkQuery = 'SELECT id FROM horarios_medicos WHERE id = ? AND medico_id = ?';
    
    const horarioResults = await new Promise((resolve, reject) => {
      db.query(checkQuery, [horarioId, user.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (horarioResults.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Horario no encontrado o no tienes permiso' 
      });
    }
    
    // Actualizar estado
    const updateQuery = 'UPDATE horarios_medicos SET activo = ? WHERE id = ?';
    
    await new Promise((resolve, reject) => {
      db.query(updateQuery, [activo, horarioId], (err, updateResult) => {
        if (err) reject(err);
        else resolve(updateResult);
      });
    });
    
    console.log(`✅ Estado de horario ${horarioId} actualizado a ${activo} por ${user.nombre_usuario}`);
    
    res.json({ 
      success: true, 
      message: `Horario ${activo ? 'activado' : 'desactivado'} correctamente`
    });
    
  } catch (error) {
    console.error('Error actualizando estado de horario:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al actualizar el estado' 
    });
  }
});

// API: Eliminar horario (médicos)
app.delete('/api/horarios/eliminar/:id', requireLogin, requireRole('medico'), async (req, res) => {
  const user = req.session.user;
  const horarioId = req.params.id;
  
  try {
    // Verificar que el horario exista y pertenezca al médico
    const checkQuery = 'SELECT id FROM horarios_medicos WHERE id = ? AND medico_id = ?';
    
    const horarioResults = await new Promise((resolve, reject) => {
      db.query(checkQuery, [horarioId, user.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (horarioResults.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Horario no encontrado o no tienes permiso' 
      });
    }
    
    // Eliminar horario
    const deleteQuery = 'DELETE FROM horarios_medicos WHERE id = ?';
    
    await new Promise((resolve, reject) => {
      db.query(deleteQuery, [horarioId], (err, deleteResult) => {
        if (err) reject(err);
        else resolve(deleteResult);
      });
    });
    
    console.log(`✅ Horario ${horarioId} eliminado por ${user.nombre_usuario}`);
    
    res.json({ 
      success: true, 
      message: 'Horario eliminado correctamente'
    });
    
  } catch (error) {
    console.error('Error eliminando horario:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al eliminar el horario' 
    });
  }
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
🚀 ======================================================
   Servidor Hospitalario v2.0 - SISTEMA DE CITAS Y MENSAJERÍA
========================================================

✅ Conexión MySQL establecida
✅ Tabla de mensajes creada/verificada
✅ Sistema de mensajería para médicos y enfermeros
✅ Sistema de programación de citas completo
🌐 Accesos disponibles:
   📍 Local:          http://localhost:${PORT}
   📍 Red local:      http://${localIP}:${PORT}

🔧 HERRAMIENTAS DE DEBUG:
   📊 Estado DB:      http://localhost:${PORT}/debug/db-status

💬 SISTEMA DE MENSAJERÍA ARREGLADO:
   - ✅ Tabla de mensajes creada automáticamente
   - ✅ Médicos ↔ Enfermeros ✓
   - ✅ Médicos ↔ Médicos ✓
   - ✅ Enfermeros ↔ Enfermeros ✓
   - ❌ PACIENTES: SIN ACCESO A MENSAJERÍA
   - ✅ Widget en dashboard para personal médico ✓

📅 SISTEMA DE CITAS COMPLETO:
   👨‍⚕️ MÉDICOS:
      - ✅ Ver todas las citas ✓
      - ✅ Confirmar/Completar/Cancelar citas ✓
      - ✅ Gestionar horarios de atención ✓
      - ✅ Editar notas de citas ✓
      - ✅ Ver citas pendientes ✓
   
   🏥 PACIENTES:
      - ✅ Solicitar nuevas citas ✓
      - ✅ Ver sus citas programadas ✓
      - ✅ Cancelar sus citas ✓
      - ✅ Ver estado de citas ✓

👥 PERMISOS ACTUALIZADOS:
   👨‍⚕️ MÉDICOS: Codigo acceso (MED123)
      - ✅ Acceso completo ✓
      - ✅ Mensajería con médicos y enfermeros ✓
      - ✅ Dashboard con widget de mensajes ✓
      - ✅ Gestión completa de citas ✓
      
   👩‍⚕️ ENFERMEROS: Codigo acceso (ENF456)
      - ✅ Pacientes (Ver, Agregar, Eliminar) ✓
      - ✅ Medicamentos (Solo Ver) ✓
      - ✅ Dispositivos (Solo Ver) ✓  
      - ✅ Archivos (Subir y Descargar) ✓
      - ✅ Excel (Descargar reportes) ✓
      - ✅ Mensajería con médicos y enfermeros ✓
      - ✅ Dashboard con widget de mensajes ✓
      
   🏥 PACIENTES: Codigo acceso (PAC789)
      - ✅ Ver otros pacientes ✓
      - ✅ Solicitar citas médicas ✓
      - ✅ Ver y gestionar sus citas ✓
      - ✅ Dashboard personalizado ✓
      - ❌ SIN ACCESO a medicamentos y dispositivos

========================================================
🚀 Servidor iniciado en puerto ${PORT}
========================================================
  `);
});
