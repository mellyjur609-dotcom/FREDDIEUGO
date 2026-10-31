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

app.get('/', (req,res) => res.sendFile(path.join(__dirname,'admin.html')));
app.get('/api/health', (req,res) => res.json({ status:'online', live_url:'https://freddieugo.onrender.com', verify_endpoint:'https://freddieugo.onrender.com/api/verify' }));

// THIS IS THE API YOUR APP + OTHER STORES WILL CALL
app.post('/api/verify', (req,res) => {
    const { key, hwid, deviceName, appId } = req.body;
    console.log(`[VERIFY] Key=${key} HWID=${hwid} App=${appId}`);
    if(!key || !hwid) return res.json({ valid:false, reason:'Missing key/hwid', api:'https://freddieugo.onrender.com/api/verify' });
    let keys = readKeys();
    let k = keys.find(x => x.key.toLowerCase() === key.toLowerCase());
    if(!k) return res.json({ valid:false, reason:'Invalid Key' });
    if(k.suspended) return res.json({ valid:false, reason:'Suspended' });
    if(k.expiresAt && new Date(k.expiresAt) < new Date()) return res.json({ valid:false, reason:'Expired' });
    if(!k.hwid){
        k.hwid = hwid; k.deviceName=deviceName; k.appId=appId; k.firstUsedAt=new Date().toISOString(); k.useCount=1; k.ip=req.ip;
        saveKeys(keys);
        return res.json({ valid:true, reason:'Activated', verify_url:'https://freddieugo.onrender.com/api/verify' });
    }
    if(k.hwid === hwid) return res.json({ valid:true, reason:'Verified' });
    return res.json({ valid:false, reason:'Already used on '+k.deviceName });
});

app.get('/api/keys', (req,res) => res.json(readKeys()));
app.post('/api/keys', (req,res) => {
    const { customKey, validityValue, validityUnit } = req.body;
    let keys = readKeys();
    let newKey = customKey || 'INRI-'+Math.random().toString(36).substring(2,6).toUpperCase()+'-'+Math.random().toString(36).substring(2,6).toUpperCase();
    let expiresAt = null;
    if(validityValue){
        let ms=parseInt(validityValue);
        if(validityUnit==='seconds') ms*=1000; if(validityUnit==='minutes') ms*=60*1000; if(validityUnit==='hours') ms*=3600000; if(validityUnit==='days') ms*=86400000;
        expiresAt=new Date(Date.now()+ms).toISOString();
    }
    let obj={ key:newKey, hwid:null, deviceName:null, suspended:false, createdAt:new Date().toISOString(), expiresAt, useCount:0 };
    keys.push(obj); saveKeys(keys); res.json({ success:true, key:obj, verify_api:'https://freddieugo.onrender.com/api/verify' });
});
app.delete('/api/keys/:key', (req,res) => { let keys=readKeys(); keys=keys.filter(x=>x.key!==req.params.key); saveKeys(keys); res.json({success:true}); });
app.patch('/api/keys/:key', (req,res) => {
    let keys=readKeys(); let k=keys.find(x=>x.key===req.params.key); if(!k) return res.status(404).json({error:'Not found'});
    const { suspended, resetHwid } = req.body; if(typeof suspended==='boolean') k.suspended=suspended; if(resetHwid){ k.hwid=null; k.deviceName=null; }
    saveKeys(keys); res.json({success:true});
});
app.listen(PORT, () => console.log('Server LIVE at https://freddieugo.onrender.com - Verify API: /api/verify'));
