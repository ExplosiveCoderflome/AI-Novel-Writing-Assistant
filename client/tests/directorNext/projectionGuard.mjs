import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const presenters=new Set(['components/directorNext/DirectorBadge.tsx','components/directorNext/DirectorPanel.tsx']);
const displayFields=new Set(['mode','headline','progress','availableActions','sourceTrace','chapterProgress','nextLaunchRange','nextActionGuidance']);
const rawControlFields=new Set(['cursorStepId','failureReason','pauseKind','controlStatus']);

/** Feature rendering boundaries are independent of local variable names. */
export function presentationViolations(filename,source,checker,parsedSource) {
 if(presenters.has(filename.replaceAll('\\','/')))return [];
 const parsed=parsedSource??ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const violations=[];
 const dashboardType=(type,field)=>Boolean(type.flags&ts.TypeFlags.Any)
   ||type.getSymbol()?.getName()==='DashboardView'
   ||Boolean(type.isUnionOrIntersection?.()&&type.types.some(part=>dashboardType(part,field)))
   ||Boolean(type.getProperty(field)?.declarations?.some(declaration=>ts.isInterfaceDeclaration(declaration.parent)&&declaration.parent.name.text==='DashboardView'));
 const inspect=(field,receiver)=>{
  if(rawControlFields.has(field))violations.push(field);
  else if(displayFields.has(field)&&(!checker||dashboardType(checker.getTypeAtLocation(receiver),field)))violations.push(field);
 };
 const visit=node=>{
  if(ts.isPropertyAccessExpression(node))inspect(node.name.text,node.expression);
  else if(ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression))inspect(node.argumentExpression.text,node.expression);
  else if(ts.isBindingElement(node)&&ts.isObjectBindingPattern(node.parent)) {
   const field=node.propertyName??node.name;
   if(ts.isIdentifier(field)||ts.isStringLiteralLike(field))inspect(field.text,node.parent);
  }
  ts.forEachChild(node,visit);
 };
 visit(parsed);
 return violations;
}

export function inspectDirectorProjectionSources(sourceRoot) {
 const violations=[];
 const files=[];
 for(const root of ['components/directorNext','pages/directorNext']) {
  for(const file of fs.readdirSync(path.join(sourceRoot,root),{recursive:true})) {
   if(!file.endsWith('.tsx'))continue;
   const relative=path.join(root,file).replaceAll('\\','/');
   files.push({relative,absolute:path.join(sourceRoot,relative)});
  }
 }
 const configPath=fileURLToPath(new URL('../../tsconfig.json',import.meta.url));
 const config=ts.readConfigFile(configPath,ts.sys.readFile);
 if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
 const parsedConfig=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(configPath));
 const program=ts.createProgram(files.map(file=>file.absolute),parsedConfig.options);
 const checker=program.getTypeChecker();
 for(const {relative,absolute} of files) {
  const source=program.getSourceFile(absolute);
  if(!source)throw Error('Projection guard cannot read '+relative);
  for(const field of presentationViolations(relative,source.text,checker,source))violations.push({file:relative,field});
 }
 return violations;
}
