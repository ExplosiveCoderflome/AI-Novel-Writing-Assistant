const {PrismaClient}=require('@prisma/client');
const {PrismaBetterSqlite3}=require('@prisma/adapter-better-sqlite3');
const {createKernelChapterBudget}=require('../../../dist/app/director/productionKernel');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const file=path.resolve(process.argv[2]),directory=path.dirname(file);
assert.equal(path.dirname(directory),os.tmpdir());
assert.ok(path.basename(directory).startsWith('kernel-consumers-'));
assert.equal(path.basename(file),'isolated.sqlite');
const {context,unit}=JSON.parse(fs.readFileSync(0,'utf8'));
const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:'file:'+file.replaceAll('\\','/')})});
(async()=>{try{process.stdout.write(JSON.stringify(await createKernelChapterBudget(db,context).read(unit)));}
 finally{await db.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
