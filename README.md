# 🏥 Sistema de Gestión Hospitalaria – Proyecto Final

Sistema web para la gestión de **pacientes**, **medicamentos**, **dispositivos médicos**, **archivos biomédicos** y **usuarios**.  
Desarrollado con **Node.js**, **Express**, **MySQL** y tecnologías web estándar.

---

## 🚀 Características Principales

### 👥 Gestión de Usuarios y Roles
- Usuarios del sistema:
  - **Médicos** Codigo: `MED1231`
  - **Enfermeros** Codigo: `ENF456`
  - **Pacientes** Codigo: `PAC789`
- Registro mediante códigos de acceso:
  - Médicos y enfermeros → código especial
  - Pacientes → código único: `PAC789`
- Permisos y rutas protegidas según rol

---

## 🏥 Módulos del Sistema

### 📌 Pacientes
- CRUD completo  
- Búsqueda en tiempo real  
- Asociación con el usuario que lo registró  

### 💊 Medicamentos
- Registro de medicamentos  
- Funciones y descripciones  

### 🏥 Dispositivos Médicos
- Control de equipos médicos  
- Estados disponibles:
  - `Disponible`
  - `En uso`
  - `En mantenimiento`
  - `Descompuesto`

### 📁 Archivos
- Subida y descarga de archivos
- Tipos permitidos: PDF, Excel, imágenes
- Registro de metadatos

### 📝 Comentarios de Pacientes
- Observaciones médicas
- Seguimientos
- Notas clínicas

---

## 🔐 Seguridad

- Autenticación mediante **sesiones**
- Contraseñas cifradas con **bcrypt**
- Validación de archivos con **multer**
- Protección de rutas según el rol
- Manejo seguro de variables con **dotenv**

---

## 🛠️ Tecnologías Utilizadas

### Backend
- Node.js  
- Express  
- MySQL + mysql2  
- express-session  
- bcrypt  
- multer  
- jszip  
- xlsx  
- mime-types  
- dotenv  

### Frontend
- HTML5  
- CSS3  
- JavaScript Vanilla  
- Fetch API  

---

## 📂 Estructura del Proyecto
```
Proyecto-Final/
├── server.js
├── package.json
├── .env
├── public/
│ ├── index.html
│ ├── login.html
│ ├── registrar.html
│ ├── welcome.html
│ └── styles.css
├── uploads/
├── logs/
└── backups/
```

---

## 💾 Creación de la Base de Datos

```sql
-- archivo: sistema_hospitalario.sql

-- 1. Crear base de datos
CREATE DATABASE IF NOT EXISTS sistema_hospitalario;
USE sistema_hospitalario;

-- 2. Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    tipo_usuario ENUM('medico', 'enfermero', 'paciente') NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de códigos de acceso
CREATE TABLE IF NOT EXISTS codigos_acceso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    tipo_usuario ENUM('medico', 'enfermero', 'paciente') NOT NULL,
    usado BOOLEAN DEFAULT FALSE
);

-- 4. Tabla de pacientes
CREATE TABLE IF NOT EXISTS pacientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    causa VARCHAR(200) NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT UNIQUE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 5. Tabla de medicamentos
CREATE TABLE IF NOT EXISTS medicamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    funcion TEXT NOT NULL
);

-- 6. Tabla de dispositivos médicos
CREATE TABLE IF NOT EXISTS maquinas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    estado ENUM('Disponible', 'En uso', 'En mantenimiento', 'Descompuesto', 'Reservado') DEFAULT 'Disponible'
);

-- 7. Tabla de archivos
CREATE TABLE IF NOT EXISTS archivos_subidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo VARCHAR(100) NOT NULL,
    usuario VARCHAR(100) NOT NULL,
    ruta VARCHAR(500) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de mensajes
CREATE TABLE IF NOT EXISTS mensajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    remitente_id INT NOT NULL,
    destinatario_id INT NOT NULL,
    asunto VARCHAR(200),
    mensaje TEXT NOT NULL,
    fecha_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leido BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (remitente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 9. Tabla de citas
CREATE TABLE IF NOT EXISTS citas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    medico_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo_cita VARCHAR(50) NOT NULL,
    motivo TEXT NOT NULL,
    notas TEXT,
    estado ENUM('pendiente', 'confirmada', 'completada', 'cancelada') DEFAULT 'pendiente',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
    FOREIGN KEY (medico_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY idx_cita_unica (medico_id, fecha, hora, estado)
);

-- 10. Tabla de horarios médicos
CREATE TABLE IF NOT EXISTS horarios_medicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    medico_id INT NOT NULL,
    dia_semana INT NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    duracion_cita INT DEFAULT 30,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (medico_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 11. Insertar códigos de acceso
INSERT IGNORE INTO codigos_acceso (codigo, tipo_usuario) VALUES
('MED123', 'medico'),
('ENF456', 'enfermero'),
('PAC789', 'paciente');

-- 12. Insertar medicamentos de ejemplo
INSERT IGNORE INTO medicamentos (nombre, funcion) VALUES
('Paracetamol', 'Analgésico y antipirético'),
('Ibuprofeno', 'Antiinflamatorio'),
('Amoxicilina', 'Antibiótico');

-- 13. Insertar dispositivos de ejemplo
INSERT IGNORE INTO maquinas (nombre, tipo, estado) VALUES
('Monitor de Signos', 'Monitorización', 'Disponible'),
('Ventilador', 'Terapéutico', 'Disponible'),
('Electrocardiógrafo', 'Diagnóstico', 'En uso');

-- 14. Crear índices para mejor rendimiento
CREATE INDEX idx_usuarios_tipo ON usuarios(tipo_usuario);
CREATE INDEX idx_citas_estado ON citas(estado);
CREATE INDEX idx_citas_medico ON citas(medico_id);
CREATE INDEX idx_citas_paciente ON citas(paciente_id);
CREATE INDEX idx_mensajes_destinatario ON mensajes(destinatario_id, leido);
CREATE INDEX idx_maquinas_estado ON maquinas(estado);

```

## Dependencias

```
npm install express mysql2 bcrypt express-session multer jszip xlsx mime-types dotenv
```

## .env

```
Configurar archivo .env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_contraseña
DB_NAME=inventario_hospital
SESSION_SECRET=clave_super_secreta

```
## nodemon.js

```
{ "watch": ["server.js", "public"], "exec": "node server.js" }

```

Copyright (c) 2025 [24210601]

Se concede permiso, libre de cargos, a cualquier persona que obtenga una copia
de este software y de los archivos de documentación asociados (el "Software"),
a utilizar el Software sin restricción, incluyendo sin limitación los derechos
a usar, copiar, modificar, fusionar, publicar, distribuir, sublicenciar y/o
vender copias del Software, y a permitir a las personas a las que se les
proporcione el Software a hacer lo mismo, sujeto a las siguientes condiciones:
