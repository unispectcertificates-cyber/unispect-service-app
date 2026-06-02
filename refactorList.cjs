const fs = require('fs');

function refactorFile(file, hookName, dbMethodDelete, dbMethodSave) {
  let content = fs.readFileSync(file, 'utf8');

  // Import
  content = content.replace(/import \{ db \} from '\.\.\/db';/, `import { db, ${hookName} } from '../db';`);

  // State declaration - replace useState with hook
  const stateRegex = new RegExp(`const \\[([a-zA-Z]+), set[a-zA-Z]+\\] = useState\\(db\\.get[a-zA-Z]+\\(\\)\\);`);
  content = content.replace(stateRegex, `const $1 = ${hookName}();`);

  // handleDelete
  content = content.replace(/const handleDelete = \(id\) => \{/, 'const handleDelete = async (id) => {');
  content = content.replace(new RegExp(`db\\.${dbMethodDelete}\\(id\\);`), `await db.${dbMethodDelete}(id);`);
  content = content.replace(/const updated = db\.get[a-zA-Z]+\(\);\n\s+set[a-zA-Z]+\(updated\);\n/g, '');

  // handleSubmit
  content = content.replace(/const handleSubmit = \(e\) => \{/, 'const handleSubmit = async (e) => {');
  content = content.replace(new RegExp(`db\\.${dbMethodSave}\\(\\{`), `await db.${dbMethodSave}({`);
  
  fs.writeFileSync(file, content);
  console.log(`${file} updated!`);
}

refactorFile('src/components/LocaisList.jsx', 'useLocais', 'deleteLocal', 'saveLocal');
refactorFile('src/components/ExportadoresList.jsx', 'useExportadores', 'deleteExportador', 'saveExportador');
refactorFile('src/components/InspectorsList.jsx', 'useInspectors', 'deleteInspector', 'saveInspector');
