const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const {randomBytes} = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = path.join(__dirname, 'uploads');
const DB = path.join(__dirname, 'db.json');
const DEFAULT_USER = 'Rachell';
const DEFAULT_PASS = '24681012';

// S3 configuration (optional). If env vars present we'll upload files to S3 and remove local copy.
const S3_BUCKET = process.env.S3_BUCKET || null;
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || null;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || null;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || null;
let s3Client = null;
if(S3_BUCKET && S3_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY){
  try{
    s3Client = new S3Client({ region: S3_REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
    console.log('S3 client configured for bucket', S3_BUCKET, 'region', S3_REGION);
  }catch(err){
    console.warn('Failed to configure S3 client:', err);
    s3Client = null;
  }
}

// Ensure uploads directory exists (prevents multer write errors on fresh deploys)
try{
  if(!fs.existsSync(UPLOADS)){
    fs.mkdirSync(UPLOADS, { recursive: true });
    console.log('Created uploads directory at', UPLOADS);
  }
}catch(err){
  console.error('Could not create uploads directory:', err);
}

// CORS: allow origin from env (Netlify) or all for testing
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(__dirname)); // serve admin.html and Index.html

// ensure DB file
if(!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({users:[],sessions:{},images:[],galleries:{}}, null, 2));

function readDB(){ return JSON.parse(fs.readFileSync(DB)); }
function writeDB(data){ fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }

// Ensure default admin user exists (will write hashed password into db.json on startup)
try{
  const dbInit = readDB();
  dbInit.users = dbInit.users || [];
  dbInit.galleries = dbInit.galleries || {};
  if(!dbInit.users.find(u => u.username === DEFAULT_USER)){
    const hash = bcrypt.hashSync(DEFAULT_PASS, 10);
    dbInit.users.push({username: DEFAULT_USER, hash});
    // create empty gallery for default user
    dbInit.galleries[DEFAULT_USER] = dbInit.galleries[DEFAULT_USER] || [];
    writeDB(dbInit);
    console.log('Default admin user created:', DEFAULT_USER);
  }
}catch(err){
  console.error('Error ensuring default admin user:', err);
}

// multer setup
const storage = multer.diskStorage({
  destination: function(req, file, cb){ cb(null, UPLOADS); },
  filename: function(req, file, cb){ const ext = path.extname(file.originalname); const name = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8) + ext; cb(null, name); }
});
const upload = multer({ storage });

// register
app.post('/api/register', (req, res) => {
  const {username, password} = req.body || {};
  if(!username || !password) return res.status(400).json({message:'Faltan campos'});
  const db = readDB();
  if(db.users.find(u => u.username === username)) return res.status(409).json({message:'Usuario ya existe'});
  const hash = bcrypt.hashSync(password, 10);
  db.users.push({username, hash});
  writeDB(db);
  res.json({ok:true});
});

// login -> returns simple token
app.post('/api/login', (req, res) => {
  const {username, password} = req.body || {};
  if(!username || !password) return res.status(400).json({message:'Faltan campos'});
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  // If user doesn't exist, allow auto-creation only for the DEFAULT_USER using DEFAULT_PASS
  if(!user){
    if(username === DEFAULT_USER){
      // create default user with DEFAULT_PASS so the admin can login with the known password
      const hash = bcrypt.hashSync(DEFAULT_PASS, 10);
      db.users.push({username: DEFAULT_USER, hash});
      db.galleries = db.galleries || {};
      db.galleries[DEFAULT_USER] = db.galleries[DEFAULT_USER] || [];
      writeDB(db);
      console.log('Auto-created default user at login:', DEFAULT_USER);
    } else {
      return res.status(401).json({message:'Credenciales inválidas'});
    }
  }
  const theUser = db.users.find(u => u.username === username);
  if(!bcrypt.compareSync(password, theUser.hash)) return res.status(401).json({message:'Credenciales inválidas'});
  // create token
  const token = randomBytes(24).toString('hex');
  db.sessions = db.sessions || {};
  db.sessions[token] = {username, created: Date.now()};
  writeDB(db);
  res.json({token});
});

// middleware auth
function requireAuth(req, res, next){
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i,'');
  if(!token) return res.status(401).json({message:'No autorizado'});
  const db = readDB();
  if(!db.sessions || !db.sessions[token]) return res.status(401).json({message:'Token inválido'});
  req.user = db.sessions[token].username;
  next();
}

// upload image (admin only)
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if(!req.file) return res.status(400).json({message:'No file'});
  const db = readDB();
  db.images = db.images || [];
  const meta = {filename: req.file.filename, originalname: req.file.originalname, uploadedBy: req.user, uploadedAt: Date.now()};

  // If S3 is configured, upload the file there and set meta.url
  if(s3Client){
    const localPath = path.join(UPLOADS, req.file.filename);
    const key = req.file.filename;
    try{
      const fileStream = fs.createReadStream(localPath);
      const put = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: fileStream, ContentType: req.file.mimetype, ACL: 'public-read' });
      await s3Client.send(put);
      // construct public URL (virtual-hosted style)
      const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
      meta.url = url;
      // push metadata and remove local file
      db.images.push(meta);
      db.galleries = db.galleries || {};
      db.galleries[req.user] = db.galleries[req.user] || [];
      db.galleries[req.user].push(meta);
      writeDB(db);
      try{ if(fs.existsSync(localPath)) fs.unlinkSync(localPath); }catch(e){ console.warn('Could not remove local file after S3 upload', e); }
      return res.json({ok:true, file: meta});
    }catch(err){
      console.error('S3 upload failed', err);
      // fallback: keep local file and save metadata without url
      db.images.push(meta);
      db.galleries = db.galleries || {};
      db.galleries[req.user] = db.galleries[req.user] || [];
      db.galleries[req.user].push(meta);
      writeDB(db);
      return res.status(500).json({message:'Error uploading to S3'});
    }
  }

  // fallback: keep local file and store metadata
  db.images.push(meta);
  // also store per-user gallery (separate storage)
  db.galleries = db.galleries || {};
  db.galleries[req.user] = db.galleries[req.user] || [];
  db.galleries[req.user].push(meta);
  writeDB(db);
  res.json({ok:true, file: meta});
});

// list gallery for a user (public)
app.get('/api/gallery/:username', (req, res) => {
  const db = readDB();
  const user = req.params.username;
  db.galleries = db.galleries || {};
  res.json(db.galleries[user] || []);
});

// list images (public)
app.get('/api/images', (req, res) => {
  const db = readDB();
  const images = (db.images || []).map(img => {
    // if we have an explicit url (S3), keep it; otherwise build a local uploads URL
    if(img.url) return img;
    const host = req.protocol + '://' + req.get('host');
    return Object.assign({}, img, { url: host + '/uploads/' + img.filename });
  });
  res.json(images);
});

// list files physically present in uploads/ (useful when files are added to uploads via repo)
app.get('/api/uploads-list', (req, res) => {
  try{
    const files = fs.readdirSync(UPLOADS || '.');
    const imageExt = ['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg'];
    const host = req.protocol + '://' + req.get('host');
    const list = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return imageExt.includes(ext);
    }).map(f => ({ filename: f, url: host + '/uploads/' + encodeURIComponent(f) }));
    res.json(list);
  }catch(err){
    console.error('Error reading uploads dir', err);
    res.status(500).json({ message: 'Error reading uploads directory' });
  }
});

// simple info / health endpoint for debugging
app.get('/api/info', (req, res) => {
  try{
    const db = readDB();
    const hasDefault = Array.isArray(db.users) && db.users.some(u => u.username === DEFAULT_USER);
    const images = db.images || [];
    const galleries = db.galleries || {};
    res.json({ ok: true, env: process.env.NODE_ENV || 'development', port: PORT, defaultUser: DEFAULT_USER, hasDefault, imagesCount: images.length, galleriesCount: Object.keys(galleries).length });
  }catch(err){
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// whoami - validate token and return username
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user });
});

// optional: remove admin button (not needed server-side, UI removes it) -- route for session invalidation
app.post('/api/logout', (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i,'');
  if(!token) return res.json({ok:true});
  const db = readDB();
  if(db.sessions && db.sessions[token]) delete db.sessions[token];
  writeDB(db);
  res.json({ok:true});
});

// delete image (admin only)
app.delete('/api/images/:filename', requireAuth, (req, res) => {
  const filename = req.params.filename;
  if(!filename) return res.status(400).json({message:'Falta filename'});
  const db = readDB();
  db.images = db.images || [];
  const idx = db.images.findIndex(i => i.filename === filename);
  if(idx === -1) return res.status(404).json({message:'Imagen no encontrada'});
  const meta = db.images[idx];
  // only allow uploader or admin (DEFAULT_USER)
  if(meta.uploadedBy !== req.user && req.user !== DEFAULT_USER) return res.status(403).json({message:'No autorizado a borrar esta imagen'});
  // remove from images
  db.images.splice(idx,1);
  // remove from galleries
  db.galleries = db.galleries || {};
  Object.keys(db.galleries).forEach(u => {
    db.galleries[u] = (db.galleries[u] || []).filter(m => m.filename !== filename);
  });
  writeDB(db);
  // remove file from S3 if configured and url present
  try{
    if(s3Client && meta.url){
      const del = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: filename });
      s3Client.send(del).catch(e => console.warn('Failed to delete from S3', e));
    }
  }catch(err){ console.warn('Error removing file from S3:', err); }
  // also attempt to remove local file (best-effort)
  try{ const p = path.join(UPLOADS, filename); if(fs.existsSync(p)) fs.unlinkSync(p); }catch(err){ console.warn('Error removing local file:', err); }
  res.json({ok:true});
});

app.listen(PORT, () => console.log('Server listening on port', PORT));
console.log('Server base:', { port: PORT, uploadsDir: UPLOADS, dbFile: DB });
