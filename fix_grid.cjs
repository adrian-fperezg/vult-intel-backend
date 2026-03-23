const fs = require('fs');
const file = './src/pages/WebGrowthPlan.tsx';
let content = fs.readFileSync(file, 'utf8');

// The line is: <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
const target = '<div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">';
const replacement = '<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8">';

if (content.includes(target)) {
   content = content.replace(target, replacement);
   fs.writeFileSync(file, content, 'utf8');
   console.log('Fixed grid layout.');
} else {
   console.log('Target not found.');
}
