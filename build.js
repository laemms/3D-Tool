const fs=require('fs');const core=fs.readFileSync('src/core.js','utf8').replace(/<\/script/gi,'<\\/script');
const ifc=fs.readFileSync('src/ifc.js','utf8').replace(/<\/script/gi,'<\\/script');
const page=fs.readFileSync('src/page.html','utf8');if(!page.includes('/*CORE*/')||!page.includes('/*IFC*/'))throw new Error('Platzhalter fehlt');
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/gebaeudemodell.html',page.replace('/*CORE*/',()=>core).replace('/*IFC*/',()=>ifc));console.log('dist/gebaeudemodell.html',fs.statSync('dist/gebaeudemodell.html').size,'Bytes');
