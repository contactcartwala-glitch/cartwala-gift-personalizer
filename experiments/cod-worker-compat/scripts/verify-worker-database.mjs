import assert from 'node:assert/strict';
import {build} from 'esbuild';
const clients=[];
globalThis.__databaseClients=clients;
const result=await build({entryPoints:['workers/database.mts'],bundle:true,platform:'node',format:'esm',write:false,resolveExtensions:['.mts','.ts','.js'],
 plugins:[{name:'fake-pg',setup(api){api.onResolve({filter:/^pg$/},()=>({path:'pg',namespace:'fixture'}));
 api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export default {Client:class {constructor(config){this.config=config;this.connected=0;this.ended=0;globalThis.__databaseClients.push(this)} async connect(){this.connected++} async query(sql,params){return {rows:[{sql,params}]}} async end(){this.ended++}}};`}));}}]});
try {
 const {openDatabase}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const direct=openDatabase('postgres://u:p@database.example/db');
 await Promise.all([direct.database.query('SELECT 1',[]),direct.database.query('SELECT 2',[])]);
 assert.equal(clients.length,1);assert.equal(clients[0].connected,1);
 assert.deepEqual(clients[0].config.ssl,{rejectUnauthorized:true});
 await direct.close();assert.equal(clients[0].ended,1);
 const pooled=openDatabase('postgres://unused:unused@origin.example/db',{connectionString:'postgres://binding:ephemeral@binding.local/db'});
 await pooled.database.query('SELECT 3',[]);
 assert.equal(clients.length,2);assert.equal(clients[1].config.connectionString,'postgres://binding:ephemeral@binding.local/db');
 assert.equal(Object.hasOwn(clients[1].config,'ssl'),false);
 await pooled.close();assert.equal(clients[1].ended,1);
 await assert.rejects(openDatabase('postgres://u:p@database.example/db?sslmode=disable').database.query('SELECT 1',[]));
 await assert.rejects(openDatabase().database.query('SELECT 1',[]));
 assert.equal(clients.length,2);
 console.log('Database adapter: direct TLS verification retained, runtime-only binding, lazy request-local connection, close and invalid-config guards passed. No network calls.');
} finally {delete globalThis.__databaseClients;}
