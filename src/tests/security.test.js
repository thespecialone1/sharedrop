
import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { validatePath } from '../main/utils/security.js';

describe('Security Utils: validatePath', () => {
    // Mock shared path
    const sharedPath = path.resolve('/tmp/shared');

    test('validatePath returns absolute path for valid relative paths', () => {
        const input = 'folder/file.txt';
        const expected = path.join(sharedPath, input);
        assert.strictEqual(validatePath(input, sharedPath), expected);
    });

    test('validatePath returns shared root for empty path', () => {
        assert.strictEqual(validatePath('', sharedPath), sharedPath);
        assert.strictEqual(validatePath(null, sharedPath), sharedPath);
        assert.strictEqual(validatePath(undefined, sharedPath), sharedPath);
    });

    test('validatePath returns null for path traversal attempts', () => {
        assert.strictEqual(validatePath('../secret.txt', sharedPath), null);
        assert.strictEqual(validatePath('folder/../../secret.txt', sharedPath), null);
        assert.strictEqual(validatePath('..', sharedPath), null);
    });

    test('validatePath returns null for absolute paths outside shared root', () => {
        // This simulates a malicious input trying to access /etc/passwd
        assert.strictEqual(validatePath('/etc/passwd', sharedPath), null);
    });

    test('validatePath normalizes input', () => {
        const input = 'folder/./file.txt';
        const expected = path.join(sharedPath, 'folder/file.txt');
        assert.strictEqual(validatePath(input, sharedPath), expected);
    });
});
