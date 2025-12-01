const fs = require('fs');
const { createCanvas } = require('canvas');

const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');

// Black background
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, 1024, 1024);

// Draw emoji (simplified - will use text)
ctx.font = '700px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#4A90E2';
ctx.fillText('💦', 512, 512);

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('./icon.png', buffer);
console.log('Icon created');
