// Local synthetic release gate. Never starts the app, migrates a DB, or deploys.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const major=Number(process.versions.node.split('.')[0]);
if(major<24){console.error('Synthetic tests require Node 24+ (native TypeScript and module hooks).');process.exit(1);}
const env={...process.env,PRINT_FILES_RECOVERY_ENABLED:'false'};
for(const key of ['DATABASE_URL','DIRECT_URL','PRINT_FILES_RECOVERY_DATABASE_URL','SHOPIFY_API_KEY','SHOPIFY_API_SECRET','NODE_OPTIONS'])delete env[key];
const results=[];
fs.writeFileSync('signature-qa-result.json',JSON.stringify({status:'running',platform:process.platform,node:process.version})+'\n');
function run(label,command,args,shell=false){
  console.log('\n'+label);
  const result=spawnSync(command,args,{stdio:'inherit',env,shell});
  results.push({check:label,passed:result.status===0});
  if(result.error||result.status!==0){fs.writeFileSync('signature-qa-result.json',JSON.stringify({status:'failed',checks:results})+'\n');console.error(label+' FAILED');process.exit(1);}
}
run('Synthetic Signature save, confirmation, loader, PDF/JPG and Polaroid checks',process.execPath,['--test',
  'tests/signature-checkout-guard.test.mjs','tests/signature-canonical-flow.test.mjs',
  'tests/print-files-recovery.test.mjs','tests/signature-loader.test.mjs','tests/signature-jpg.test.mjs','scripts/verify-polaroid-part.mjs']);
run('Polaroid layout and ZIP ordering',process.execPath,['scripts/verify-polaroid-print.mjs']);
run('Theme guard JavaScript syntax',process.execPath,['--check','shopify-theme/assets/signature-canonical-guard.js']);
run('Patch whitespace','git',['diff','--check','HEAD']);
for(const name of ['typecheck','build'])run(name,process.platform==='win32'?'npm.cmd':'npm',['run',name],process.platform==='win32');
const evidence={status:'passed',timestamp:new Date().toISOString(),platform:process.platform,node:process.version,syntheticOnly:true,checks:results};
fs.writeFileSync('signature-qa-result.json',JSON.stringify(evidence,null,2)+'\n');
console.log('PASS: all local Signature and Polaroid release gates. Linux Docker and live routing are separate gates.');
