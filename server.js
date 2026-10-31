const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

const KEYS_FILE = path.join(__dirname, 'keys.json');
const readKeys = () => { try { return JSON.parse(fs.readFileSync(KEYS_FILE,'utf8')); } catch(e){ return []; } };
const saveKeys = (k) => fs.writeFileSync(KEYS_FILE, JSON.stringify(k,null,2));

// HOME - Admin Panel
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'admin.html')));

// HEALTH CHECK for stores
app.get('/api/health', (req,res) => res.json({ status:'online', totalKeys: readKeys().length, server:'InriHack Booster v2' }));

// VERIFY - This is what your APP and OTHER STORES call
app.post('/api/verify', (req,res) => {
    const { key, hwid, deviceName, appId } = req.body;
    console.log(`VERIFY ATTEMPT: key=${key} hwid=${hwid} app=${appId}`);
    if(!key || !hwid) return res.json({ valid:false, reason:'Missing key or hwid', code:400 });
    
    let keys = readKeys();
    let k = keys.find(x => x.key.toLowerCase() === key.toLowerCase());
    if(!k) return res.json({ valid:false, reason:'Invalid Key - Not found', code:404 });
    if(k.suspended) return res.json({ valid:false, reason:'Key Suspended by Admin', code:403, suspended:true });
    if(k.expiresAt && new Date(k.expiresAt) < new Date()) return res.json({ valid:false, reason:'Key Expired on ' + new Date(k.expiresAt).toLocaleString(), code:410, expired:true });

    if(!k.hwid){
        k.hwid = hwid;
        k.deviceName = deviceName || 'Unknown';
        k.appId = appId || 'inri-booster';
        k.firstUsedAt = new Date().toISOString();
        k.lastVerifiedAt = new Date().toISOString();
        k.ip = req.ip;
        k.useCount = 1;
        saveKeys(keys);
        return res.json({ valid:true, reason:'Activated Successfully', code:200, expiresAt:k.expiresAt, firstTime:true });
    }

    if(k.hwid === hwid){
        k.lastVerifiedAt = new Date().toISOString();
        k.useCount = (k.useCount||0)+1;
        saveKeys(keys);
        return res.json({ valid:true, reason:'Verified', code:200, expiresAt:k.expiresAt, useCount:k.useCount });
    } else {
        return res.json({ valid:false, reason:`Key already bound to ${k.deviceName} (${k.hwid.substring(0,6)}...)`, code:409, bound:true, boundTo:k.deviceName });
    }
});

// ADMIN APIS
app.get('/api/keys', (req,res) => res.json(readKeys()));

app.post('/api/keys', (req,res) => {
    const { customKey, validityValue, validityUnit } = req.body;
    let keys = readKeys();
    let newKey = customKey || 'INRI-' + Math.random().toString(36).substring(2,6).toUpperCase() + '-' + Math.random().toString(36).substring(2,6).toUpperCase() + '-' + Math.random().toString(36).substring(2,2).toUpperCase() + Math.floor(Math.random()*99);
    
    let expiresAt = null;
    if(validityValue){
        let ms = parseInt(validityValue);
        if(validityUnit === 'seconds') ms = ms*1000;
        if(validityUnit === 'minutes') ms = ms*60*1000;
        if(validityUnit === 'hours') ms = ms*60*60*1000;
        if(validityUnit === 'days') ms = ms*24*60*60*1000;
        expiresAt = new Date(Date.now() + ms).toISOString();
    }

    let obj = { key:newKey, hwid:null, deviceName:null, appId:null, suspended:false, createdAt:new Date().toISOString(), firstUsedAt:null, lastVerifiedAt:null, expiresAt, useCount:0, ip:null };
    keys.push(obj);
    saveKeys(keys);
    res.json({ success:true, key:obj });
});

app.delete('/api/keys/:key', (req,res) => { let keys=readKeys(); keys=keys.filter(x=>x.key!==req.params.key); saveKeys(keys); res.json({success:true}); });
app.patch('/api/keys/:key', (req,res) => {
    let keys=readKeys(); let k=keys.find(x=>x.key===req.params.key); if(!k) return res.status(404).json({error:'Not found'});
    const { suspended, validityValue, validityUnit, resetHwid } = req.body;
    if(typeof suspended === 'boolean') k.suspended=suspended;
    if(validityValue !== undefined){ if(!validityValue) k.expiresAt=null; else { let ms=parseInt(validityValue); if(validityUnit==='seconds') ms*=1000; if(validityUnit==='minutes') ms*=60*1000; if(validityUnit==='hours') ms*=3600000; if(validityUnit==='days') ms*=86400000; k.expiresAt=new Date(Date.now()+ms).toISOString(); } }
    if(resetHwid){ k.hwid=null; k.deviceName=null; k.firstUsedAt=null; k.ip=null; k.useCount=0; }
    saveKeys(keys); res.json({success:true, key:k});
});

app.listen(PORT, () => console.log('🔥 Inri Booster v2 Online on port ' + PORT));
