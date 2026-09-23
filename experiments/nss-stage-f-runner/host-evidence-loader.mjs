import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT=process.env.STAGE_F_EVIDENCE_EXTRACT_DIR??'/tmp/stage-f-verified';
const EXPECTED='b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8';
const DIR=path.dirname(fileURLToPath(import.meta.url));
const CHUNK_DIR=path.join(DIR,'evidence-chunks');
const parts=(await readdir(CHUNK_DIR)).filter(x=>/^part\d+\.b64$/.test(x)).sort();
if(!parts.length)throw new Error('STAGE_F_EVIDENCE_CHUNKS_MISSING');
let encoded='';for(const part of parts)encoded+=(await readFile(path.join(CHUNK_DIR,part),'utf8')).trim();
const buf=Buffer.from(encoded,'base64');
const got=createHash('sha256').update(buf).digest('hex');
if(got!==EXPECTED)throw new Error(`STAGE_F_ARCHIVE_SHA_MISMATCH:${got}`);
let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break}}
if(eocd<0)throw new Error('ZIP_EOCD_NOT_FOUND');
const count=buf.readUInt16LE(eocd+10),cdOffset=buf.readUInt32LE(eocd+16);let p=cdOffset;
await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});let extracted=0;
for(let n=0;n<count;n++){
 if(buf.readUInt32LE(p)!==0x02014b50)throw new Error(`ZIP_CENTRAL_SIGNATURE:${n}`);
 const method=buf.readUInt16LE(p+10),compSize=buf.readUInt32LE(p+20),uncompSize=buf.readUInt32LE(p+24),nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commentLen=buf.readUInt16LE(p+32),localOffset=buf.readUInt32LE(p+42);
 const name=buf.subarray(p+46,p+46+nameLen).toString('utf8');p+=46+nameLen+extraLen+commentLen;
 if(!name||name.startsWith('/')||name.includes('..')||name.includes('\\'))throw new Error(`ZIP_UNSAFE_PATH:${name}`);
 if(name.endsWith('/')){await mkdir(path.join(OUT,name),{recursive:true});continue}
 if(buf.readUInt32LE(localOffset)!==0x04034b50)throw new Error(`ZIP_LOCAL_SIGNATURE:${name}`);
 const localNameLen=buf.readUInt16LE(localOffset+26),localExtraLen=buf.readUInt16LE(localOffset+28),dataOffset=localOffset+30+localNameLen+localExtraLen;
 const compressed=buf.subarray(dataOffset,dataOffset+compSize);let data;
 if(method===0)data=compressed;else if(method===8)data=inflateRawSync(compressed);else throw new Error(`ZIP_UNSUPPORTED_METHOD:${method}:${name}`);
 if(data.length!==uncompSize)throw new Error(`ZIP_SIZE_MISMATCH:${name}:${data.length}:${uncompSize}`);
 const dest=path.join(OUT,name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,data);extracted++;
}
console.log('NSS1_STAGE_F_HOST_EVIDENCE_LOADER_COMPLETE',JSON.stringify({archive_sha256:got,chunk_count:parts.length,entries:count,files_extracted:extracted,provider_calls:0,credentials_read:false,authority_effects:'NONE'}));
