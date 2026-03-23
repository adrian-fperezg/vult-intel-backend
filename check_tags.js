const fs = require('fs');
const content = fs.readFileSync('src/pages/GlobalBrandStrategy.tsx', 'utf8');

const lines = content.split('\n');
let divStack = [];
for (let i = 1058; i <= 1149; i++) {
    const line = lines[i];
    // count `<div ` and `<div\n` and `<div\r` and `<div>`
    // also count `</div>`
    const opens = (line.match(/<div[\s>]/g) || []).length;
    const closes = (line.match(/<\/div>/g) || []).length;
    for (let j = 0; j < opens; j++) divStack.push(i + 1);
    for (let j = 0; j < closes; j++) {
        if (divStack.length > 0) divStack.pop();
        else console.log("Extra </div> at line", i + 1);
    }
}
console.log("Remaining stack size:", divStack.length, "Lines opened:", divStack);

