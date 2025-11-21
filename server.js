const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const {randomBytes} = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = path.join(__dirname, 'uploads');
const DB = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(__dirname)); // serve admin.html and Index.html

// ensure DB file
if(!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({users:[],sessions:{},images:[]}, null, 2));

function readDB(){ return JSON.parse(fs.readFileSync(DB)); }
function writeDB(data){ fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }

// Ensure default admin user exists (will write hashed password into db.json on startup)
try{
  const DEFAULT_USER = 'Rachell';
  const DEFAULT_PASS = '24681012';
  const dbInit = readDB();
  dbInit.users = dbInit.users || [];
  if(!dbInit.users.find(u => u.username === DEFAULT_USER)){
    const hash = bcrypt.hashSync(DEFAULT_PASS, 10);
    dbInit.users.push({username: DEFAULT_USER, hash});
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
  if(!user) return res.status(401).json({message:'Credenciales inválidas'});
  if(!bcrypt.compareSync(password, user.hash)) return res.status(401).json({message:'Credenciales inválidas'});
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
app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if(!req.file) return res.status(400).json({message:'No file'});
  const db = readDB();
  db.images = db.images || [];
  const meta = {filename: req.file.filename, originalname: req.file.originalname, uploadedBy: req.user, uploadedAt: Date.now()};
  db.images.push(meta);
  writeDB(db);
  res.json({ok:true, file: meta});
});

// list images (public)
app.get('/api/images', (req, res) => {
  const db = readDB();
  res.json(db.images || []);
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

app.listen(PORT, () => console.log('Server listening on port', PORT));
