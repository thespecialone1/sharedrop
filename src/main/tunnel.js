import { spawn } from 'child_process';
import { existsSync } from 'fs';

// Find cloudflared in common locations (packaged apps don't inherit shell PATH)
const findCloudflared = () => {
    const paths = [
        '/opt/homebrew/bin/cloudflared',     // Apple Silicon Homebrew
        '/usr/local/bin/cloudflared',         // Intel Homebrew
        '/usr/bin/cloudflared',               // System install
        'cloudflared'                         // Fallback to PATH
    ];

    for (const p of paths) {
        if (p === 'cloudflared' || existsSync(p)) {
            return p;
        }
    }
    return null;
};

class Tunnel {
    constructor(port) {
        this.port = port;
        this.process = null;
        this.url = null;
    }

    start() {
        return new Promise((resolve, reject) => {
            const cloudflaredPath = findCloudflared();
            if (!cloudflaredPath) {
                reject(new Error('cloudflared not found. Install with: brew install cloudflared'));
                return;
            }

            // Spawn cloudflared quick tunnel
            this.process = spawn(cloudflaredPath, [
                'tunnel',
                '--url', `http://127.0.0.1:${this.port}`
            ]);

            let output = '';
            const timeout = setTimeout(() => {
                reject(new Error('Tunnel startup timeout'));
            }, 30000);

            this.process.stderr.on('data', (data) => {
                output += data.toString();
                // Look for the tunnel URL in output
                const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (match) {
                    clearTimeout(timeout);
                    this.url = match[0];
                    resolve(this.url);
                }
            });

            this.process.on('error', (error) => {
                clearTimeout(timeout);
                const err = error;
                if (err.code === 'ENOENT') {
                    reject(new Error('cloudflared not found. Install with: brew install cloudflared'));
                } else {
                    reject(error);
                }
            });

            this.process.on('close', (code) => {
                if (!this.url) {
                    clearTimeout(timeout);
                    reject(new Error(`Tunnel closed unexpectedly with code ${code}`));
                }
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.process) {
                const timeout = setTimeout(() => {
                    // Force kill if SIGTERM didn't work
                    try {
                        this.process.kill('SIGKILL');
                    } catch (e) {
                        // Process may already be dead
                    }
                    resolve();
                }, 3000);

                this.process.on('close', () => {
                    clearTimeout(timeout);
                    this.process = null;
                    resolve();
                });

                try {
                    this.process.kill('SIGTERM');
                } catch (e) {
                    clearTimeout(timeout);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }
}

export default Tunnel;
