import archiver from 'archiver';
import path from 'path';
import fs from 'fs';

export const generateZip = async (sharedPath, relPaths, res) => {
    if (relPaths.length === 1) {
        const fullPath = path.join(sharedPath, relPaths[0]);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            return res.download(fullPath);
        }
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('shareddrop-selection.zip');

    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    for (const relPath of relPaths) {
        const fullPath = path.join(sharedPath, relPath);
        if (fs.existsSync(fullPath)) {
            if (fs.statSync(fullPath).isDirectory()) {
                archive.directory(fullPath, path.basename(relPath));
            } else {
                archive.file(fullPath, { name: path.basename(relPath) });
            }
        }
    }

    await archive.finalize();
};
