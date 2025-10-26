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
execSync('go mod download', { stdio: 'inherit' });

try {
    // For macOS, build universal binary (both Intel and Apple Silicon)
    if (goos === 'darwin') {
        console.log('📦 Building universal binary for macOS (Intel + Apple Silicon)...');
        
        const arm64Binary = 'file-share-app-arm64';
        const amd64Binary = 'file-share-app-amd64';
        
        // Build ARM64 (Apple Silicon)
        console.log('🔨 Building ARM64 binary...');
        execSync(`GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build -o ${arm64Binary} main.go`, { 
            stdio: 'inherit',
            env: { ...process.env, GOOS: 'darwin', GOARCH: 'arm64', CGO_ENABLED: '1' }
        });
        
        // Build AMD64 (Intel)
        console.log('🔨 Building AMD64 binary...');
        execSync(`GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 go build -o ${amd64Binary} main.go`, { 
            stdio: 'inherit',
            env: { ...process.env, GOOS: 'darwin', GOARCH: 'amd64', CGO_ENABLED: '1' }
        });
        
        // Create universal binary
        console.log('🔗 Creating universal binary with lipo...');
        execSync(`lipo -create -output ${binaryName} ${arm64Binary} ${amd64Binary}`, { stdio: 'inherit' });
        
        // Clean up temporary binaries
        fs.unlinkSync(arm64Binary);
        fs.unlinkSync(amd64Binary);
        
        console.log('✅ Universal binary created successfully');
    } else {
        // For other platforms, build normally
        console.log(`📦 Building for ${goos}/${goarch}...`);
        
        const env = {
            ...process.env,
            GOOS: goos,
            GOARCH: goarch,
            CGO_ENABLED: '1'
        };
        
        const buildCmd = `go build -o ${binaryName} main.go`;
        console.log(`🔨 Running: ${buildCmd}`);
        execSync(buildCmd, { stdio: 'inherit', env });
    }

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
    
    // Verify architectures for macOS
    if (goos === 'darwin') {
        console.log('🔍 Verifying architectures...');
        const lipoOutput = execSync(`lipo -info ${binaryName}`, { encoding: 'utf-8' });
        console.log(`   ${lipoOutput.trim()}`);
    }

} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
