La Abuela — Admin backend (local)

Qué hay aquí
- `admin.html` — interfaz administrativa independiente (login, subir fotos, ver galería).
- `server.js` — servidor Express minimal con endpoints:
  - POST /api/register {username,password}
  - POST /api/login {username,password} -> {token}
  - POST /api/upload (multipart/form-data, field `image`) (requiere Authorization: Bearer <token>)
  - GET /api/images -> lista de imágenes (público)
  - /uploads/<filename> sirve los archivos subidos
- `db.json` — base simple en JSON para usuarios, sesiones e imágenes (no es para producción).
- `uploads/` — carpeta donde se guardan las imágenes subidas.

Instalar y ejecutar (PowerShell en Windows)

# instalar dependencias
npm install

# ejecutar servidor
npm start

Por defecto el servidor escucha en http://localhost:3000

Abrir admin: http://localhost:3000/admin.html

Notas de seguridad
- Actualmente la "base de datos" es un archivo JSON y la autenticación devuelve un token simple guardado en `db.json`.
- Para producción usa una base de datos real, HTTPS, tokens JWT con expiración, y almacenamiento seguro (S3 o similar).
- No subas `db.json` ni `uploads/` a repositorios públicos.
