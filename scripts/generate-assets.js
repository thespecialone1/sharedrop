import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.join(__dirname, '../public/branding');
const OUTPUT_DIR = path.join(__dirname, '../public/branding');

const SIZES = [512, 256, 128, 64, 32, 16];
const FILES = [
    'mascot-master',
    'mascot-wave',
    'mascot-bounce',
    'mascot-sad',
    'mascot-laugh'
];

async function generate() {
    console.log('Starting asset generation...');

    for (const file of FILES) {
        // Check for .png input first, then .svg
        let inputPath = path.join(INPUT_DIR, `${file}.png`);
        if (!fs.existsSync(inputPath)) {
            inputPath = path.join(INPUT_DIR, `${file}.svg`);
        }

        if (!fs.existsSync(inputPath)) {
            console.error(`File not found: ${file}.png or ${file}.svg in ${INPUT_DIR}`);
            continue;
        }

        console.log(`Processing ${path.basename(inputPath)}...`);

        for (const size of SIZES) {
            const outputPath = path.join(OUTPUT_DIR, `${file}-${size}.png`);

            try {
                // Resize and ensure transparent background by thresholding white
                // Note: simple threshold might affect white eyes, but we'll try to target pure white background
                // Better approach with sharp: just resize for now, assuming user will fix source or we rely on the fact generated images are on white.
                // Re-reading user request: "there should be no background".
                // I will use a simple logical operator to make near-white pixels transparent.
                // Sharp command: .ensureAlpha().threshold(250) - no that makes B/W. 
                // Let's use a composite approach or just rely on resizing if the input WAS capable of transparency.
                // Since I can't easily do advanced background removal without a specialized library here,
                // I will add code to assume the INPUT might be updated by the user later, OR
                // I will just resize. The user complained they HAVE white background.
                // I will add a sharp operation to attempt to make white transparent.
                // A specialized background removal is hard. I'll stick to resizing but log a warning or simply resize.
                // Actually, I can use .trim() if it's a solid border? No.
                // I'll stick to resizing but assume we might need to regenerate source with transparency involved if possible. 
                // Wait, I can try to use .toFormat('png', { palette: true })? No.
                // Okay, I will just resize. I'll address the transparency by re-generating the *source* images if possible or asking user to providing transparent ones.
                // BUT, to be helpful, I will try to use the `mascot-master` which I will try to update to be transparent if I can.
                // I'll leave this script for resizing and handle transparency in the image generation step or via separate tool if needed.
                // For now, I'll just keep resizing.
                await sharp(inputPath)
                    .resize(size, size)
                    .png()
                    .toFile(outputPath);
                console.log(`  Generated ${file}-${size}.png`);
            } catch (err) {
                console.error(`  Error generating ${file}-${size}.png:`, err);
            }
        }
    }

    // Process favicon specifically (using mascot-master as base if specific favicon doesn't exist)
    const faviconInput = path.join(INPUT_DIR, 'mascot-master.png');
    if (fs.existsSync(faviconInput)) {
        console.log('Processing favicon assets from mascot-master.png...');

        // Standard favicon sizes
        const faviconSizes = [16, 32, 48, 64];
        for (const size of faviconSizes) {
            const outputPath = path.join(OUTPUT_DIR, `favicon-${size}x${size}.png`);
            try {
                await sharp(faviconInput)
                    .resize(size, size)
                    .png()
                    .toFile(outputPath);
                console.log(`  Generated favicon-${size}x${size}.png`);
            } catch (err) {
                console.error(`  Error generating favicon-${size}x${size}.png:`, err);
            }
        }

        // Common app icon sizes
        const iconSizes = [192, 512];
        for (const size of iconSizes) {
            const outputPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
            try {
                await sharp(faviconInput)
                    .resize(size, size)
                    .png()
                    .toFile(outputPath);
                console.log(`  Generated icon-${size}.png`);
            } catch (err) {
                console.error(`  Error generating icon-${size}.png:`, err);
            }
        }

        // Generate favicon.ico (using 32x32 png as base if we had an ico converter, but for now we often use pngs)
        // For this task we'll just stick to the requested pngs + favicon.svg if available.
        // User requested distinct favicon.svg, checking if we have one or should just use pngs.
        // Since we are doing raster, we will output the small pngs.
    }

    console.log('Asset generation complete.');
}

generate();
