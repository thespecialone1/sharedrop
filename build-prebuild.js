#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Pre-build: Compiling Go binary...');

// Determine target platform
const platform = process.env.npm_config_platform || process.platform;
const arch = process.env.npm_config_arch || process.arch;

let goos, goarch, binaryName;

switch (platform) {
    case 'darwin':
        goos = 'darwin';
        goarch = arch === 'arm64' ? 'arm64' : 'amd64';
        binaryName = 'file-share-app';
        break;
    case 'win32':
        goos = 'windows';
        goarch = 'amd64';
        binaryName = 'file-share-app.exe';
        break;
    case 'linux':
        goos = 'linux';
        goarch = 'amd64';
        binaryName = 'file-share-app';
        break;
    default:
        console.error('❌ Unsupported platform:', platform);
        process.exit(1);
}

console.log(`📦 Building for ${goos}/${goarch}...`);

try {
    // Set CGO_ENABLED=1 for SQLite support
    const env = {
        ...process.env,
        GOOS: goos,
        GOARCH: goarch,
        CGO_ENABLED: '1'
    };

    // Check if Go is installed
    try {
        execSync('go version', { stdio: 'pipe' });
    } catch (e) {
        console.error('❌ Go is not installed or not in PATH');
        console.error('Please install Go from https://golang.org/dl/');
        process.exit(1);
    }

    // Install dependencies if needed
    console.log('📥 Installing Go dependencies...');
    execSync('go mod download', { stdio: 'inherit', env });

    // Build the binary
    const buildCmd = `go build -o ${binaryName} main.go`;
    console.log(`🔨 Running: ${buildCmd}`);
    execSync(buildCmd, { stdio: 'inherit', env });

    // Verify binary exists
    if (!fs.existsSync(binaryName)) {
        console.error(`❌ Binary not found: ${binaryName}`);
        process.exit(1);
    }

    // Make it executable on Unix systems
    if (goos !== 'windows') {
        fs.chmodSync(binaryName, '755');
    }

    console.log(`✅ Binary compiled successfully: ${binaryName}`);
    console.log(`📊 Binary size: ${(fs.statSync(binaryName).size / 1024 / 1024).toFixed(2)} MB`);

} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
