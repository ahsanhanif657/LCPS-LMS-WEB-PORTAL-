import {readFile,copyFile,mkdir,stat,rm,writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let target=process.argv[2];
if(!target){const prompt=createInterface({input:process.stdin,output:process.stdout});target=await prompt.question('Paste your EXISTING project folder path (the folder containing package.json): ');prompt.close();}
target=(target||'').trim().replace(/^"(.*)"$/,'$1');
const exists=async p=>{try{await stat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
try{
 if(!target)throw new Error('No project folder was supplied. Nothing changed.');
 target=await realpath(resolve(target));const actualSource=await realpath(source);
 if(target===actualSource||target.startsWith(actualSource+sep)||actualSource.startsWith(target+sep))throw new Error('Extract this update OUTSIDE the existing project, then run it again.');
 const pkg=JSON.parse(await readFile(resolve(target,'package.json'),'utf8'));
 if(pkg.name!=='lcps-lms-vercel')throw new Error('This does not look like the existing LCPS LMS project. Nothing changed.');
 const files=JSON.parse(await readFile(resolve(source,'UPDATED_FILES.json'),'utf8'));
 for(const file of files){if(typeof file!=='string'||isAbsolute(file)||file.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.env'))||!await exists(resolve(source,file)))throw new Error('Invalid or missing update source: '+file);}
 const backup=resolve(dirname(target),'LCPS_LMS_source_backups',new Date().toISOString().replace(/[:.]/g,'-'));
 await mkdir(backup,{recursive:true});
 const prior=[];
 // Finish all backups before replacing any source file. Database/files/env are not touched.
 for(const file of files){const hadFile=await exists(resolve(target,file));prior.push({file,hadFile});if(hadFile){await mkdir(dirname(resolve(backup,file)),{recursive:true});await copyFile(resolve(target,file),resolve(backup,file));}}
 await writeFile(resolve(backup,'restore-manifest.json'),JSON.stringify({project:target,files:prior},null,2));
 const copied=[];
 try{for(const {file} of prior){await mkdir(dirname(resolve(target,file)),{recursive:true});await copyFile(resolve(source,file),resolve(target,file));copied.push(file);}}
 catch(error){for(const file of copied.reverse()){if(prior.find(p=>p.file===file).hadFile)await copyFile(resolve(backup,file),resolve(target,file));else await rm(resolve(target,file),{force:true});}throw error;}
 console.log(`Updated ${files.length} source files. Existing environment, database, uploads and accounts were not replaced.`);
 console.log('Previous source files saved OUTSIDE your project: '+backup);
 console.log('Open your EXISTING project in VS Code, then run:');
 console.log('npm.cmd run build\nnpm.cmd run start');
 console.log('No database migration is required for this interface update. Read START_UPDATE_HERE.md.');
}catch(error){console.error('Update stopped: '+error.message);process.exitCode=1;}
