const {test}=require('node:test');
const {assert,fs,path}=require('./fixtures.cjs');
const ts=require('typescript');
const root=path.resolve(__dirname,'../../../src/modules/production/domain');
function files(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]).filter(f=>f.endsWith('.ts')):[];}
test('domain dependencies remain local and contain no effectful runtime APIs',()=>{
  const list=files(root);assert.ok(list.length>0);
  for(const file of list){
    const content=fs.readFileSync(file,'utf8');
    assert.ok(content.split(/\r?\n/).length<=400,`${file} exceeds domain file limit`);
    const tree=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);
    function inspect(node){
      if(ts.isImportDeclaration(node)){
        const spec=node.moduleSpecifier.text;
        assert.ok(spec==='zod'||spec.startsWith('./')||spec.startsWith('../common')||
          (file.includes(path.sep+'rules'+path.sep)&&spec.startsWith('../')),`${file} imports ${spec}`);
        if(spec.startsWith('.')){
          const resolved=path.resolve(path.dirname(file),spec);
          assert.ok(resolved.startsWith(root+path.sep)||resolved===root||resolved.startsWith(path.join(path.dirname(root),'common')+path.sep),resolved);
        }
      }
      if(ts.isCallExpression(node)||ts.isNewExpression(node)){
        const name=node.expression.getText(tree);
        assert.ok(!['Date','Date.now','Math.random','fetch','require','eval'].includes(name),`${file} invokes ${name}`);
      }
      if(ts.isPropertyAccessExpression(node))assert.ok(!['process.env','console.log','console.error'].includes(node.getText(tree)));
      ts.forEachChild(node,inspect);
    }
    inspect(tree);
  }
});
