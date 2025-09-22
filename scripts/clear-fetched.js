const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'data', 'fetched.json');

fs.writeFileSync(outputPath, '[]', 'utf8');
console.log('✅ fetched.json を空に初期化しました。');
