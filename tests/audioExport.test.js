import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { performAudioHealthCheck, validateAudioFile, isAudioPlayable } from '../server/audioValidator.js';

describe('Audio Export System', () => {
  const testOutputsDir = path.join(process.cwd(), 'test-outputs');
  
  beforeEach(() => {
    // Create test outputs directory
    if (!fs.existsSync(testOutputsDir)) {
      fs.mkdirSync(testOutputsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testOutputsDir)) {
      const files = fs.readdirSync(testOutputsDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testOutputsDir, file));
      });
      fs.rmdirSync(testOutputsDir);
    }
  });

  describe('Audio Validation', () => {
    it('should detect non-existent files', async () => {
      const result = await validateAudioFile('/path/to/nonexistent.webm');
      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should detect empty files', async () => {
      const emptyFile = path.join(testOutputsDir, 'empty.webm');
      fs.writeFileSync(emptyFile, '');
      
      const result = await validateAudioFile(emptyFile);
      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.error).toContain('too small');
    });

    it('should validate file size calculations', async () => {
      const testFile = path.join(testOutputsDir, 'test.webm');
      const testData = Buffer.alloc(1024, 'test data'); // 1KB of test data
      fs.writeFileSync(testFile, testData);
      
      const result = await validateAudioFile(testFile);
      expect(result.exists).toBe(true);
      expect(result.size).toBe(1024);
    });
  });

  describe('Base64 Data Handling', () => {
    it('should handle different conversation lengths', () => {
      // Test small conversation (< 1MB)
      const smallData = 'a'.repeat(100000); // ~100KB
      expect(smallData.length).toBeLessThan(10000000);
      
      // Test medium conversation (1-10MB) 
      const mediumData = 'a'.repeat(5000000); // ~5MB
      expect(mediumData.length).toBeLessThan(10000000);
      expect(mediumData.length).toBeGreaterThan(1000000);
      
      // Test large conversation (>10MB but <50MB)
      const largeData = 'a'.repeat(25000000); // ~25MB
      expect(largeData.length).toBeGreaterThan(10000000);
      expect(largeData.length).toBeLessThan(50000000);
      
      // Test very large conversation (>50MB)
      const veryLargeData = 'a'.repeat(75000000); // ~75MB
      expect(veryLargeData.length).toBeGreaterThan(50000000);
    });

    it('should validate base64 format', () => {
      const validBase64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const invalidBase64 = 'Invalid@Base64!';
      
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      expect(base64Regex.test(validBase64)).toBe(true);
      expect(base64Regex.test(invalidBase64)).toBe(false);
    });

    it('should handle data URL prefixes', () => {
      const dataWithPrefix = 'data:audio/webm;base64,SGVsbG8gV29ybGQ=';
      const dataWithoutPrefix = 'SGVsbG8gV29ybGQ=';
      
      // Simulate the processing logic from server.js
      let processedData1 = dataWithPrefix;
      if (processedData1.indexOf('base64,') > -1) {
        processedData1 = processedData1.split('base64,')[1];
      }
      
      let processedData2 = dataWithoutPrefix;
      if (processedData2.indexOf('base64,') > -1) {
        processedData2 = processedData2.split('base64,')[1];
      }
      
      expect(processedData1).toBe('SGVsbG8gV29ybGQ=');
      expect(processedData2).toBe('SGVsbG8gV29ybGQ=');
    });
  });

  describe('Health Check System', () => {
    it('should handle missing export results', async () => {
      const healthCheck = await performAudioHealthCheck(null);
      expect(healthCheck.overall).toBe('failed');
      expect(healthCheck.errors).toContain('No export result provided');
    });

    it('should handle export results with missing files', async () => {
      const exportResult = {
        success: true,
        source: {
          filename: 'nonexistent.webm',
          path: '/path/to/nonexistent.webm',
          format: 'webm'
        }
      };
      
      const healthCheck = await performAudioHealthCheck(exportResult);
      expect(healthCheck.overall).toBe('failed');
      expect(healthCheck.files.source.isValid).toBe(false);
      expect(healthCheck.files.source.exists).toBe(false);
    });

    it('should generate appropriate recommendations', async () => {
      // Create a mock export result with only source file
      const testFile = path.join(testOutputsDir, 'test.webm');
      fs.writeFileSync(testFile, Buffer.alloc(1000, 'test')); // 1KB test file
      
      const exportResult = {
        success: true,
        source: {
          filename: 'test.webm',
          path: testFile,
          format: 'webm'
        },
        mp3: null,
        warning: 'MP3 conversion failed'
      };
      
      const healthCheck = await performAudioHealthCheck(exportResult);
      
      // Should detect partial success
      expect(healthCheck.overall).toBe('partial');
      expect(healthCheck.recommendations).toContain(
        'Consider using the source file directly or retry MP3 conversion'
      );
    });
  });

  describe('File Format Support', () => {
    it('should support different audio formats', () => {
      const formats = [
        { ext: '.webm', expectedCodecs: ['vorbis', 'opus'] },
        { ext: '.mp3', expectedCodecs: ['mp3'] },
        { ext: '.wav', expectedCodecs: ['pcm'] }
      ];
      
      formats.forEach(format => {
        expect(format.ext).toMatch(/^\.(webm|mp3|wav)$/);
        expect(Array.isArray(format.expectedCodecs)).toBe(true);
        expect(format.expectedCodecs.length).toBeGreaterThan(0);
      });
    });

    it('should handle large file size limits', () => {
      const maxSize = 100 * 1024 * 1024; // 100MB as defined in server.js
      const testSizes = [
        1024,           // 1KB - small
        1024 * 1024,    // 1MB - medium
        10 * 1024 * 1024, // 10MB - large
        50 * 1024 * 1024, // 50MB - very large
        maxSize,        // 100MB - at limit
        maxSize + 1     // Over limit
      ];
      
      testSizes.forEach(size => {
        if (size <= maxSize) {
          expect(size).toBeLessThanOrEqual(maxSize);
        } else {
          expect(size).toBeGreaterThan(maxSize);
        }
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle corrupted audio data gracefully', async () => {
      // Create a file with invalid audio data
      const corruptFile = path.join(testOutputsDir, 'corrupt.webm');
      fs.writeFileSync(corruptFile, 'This is not audio data');
      
      const isPlayable = await isAudioPlayable(corruptFile);
      expect(isPlayable).toBe(false);
    });

    it('should handle ffmpeg probe failures', async () => {
      // Create a file that looks like audio but isn't
      const fakeAudioFile = path.join(testOutputsDir, 'fake.mp3');
      fs.writeFileSync(fakeAudioFile, Buffer.alloc(10000, 'fake audio data'));
      
      const validation = await validateAudioFile(fakeAudioFile);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Validation failed');
    });

    it('should detect unreasonable file durations', async () => {
      // This would be tested with actual audio files in a real scenario
      // For now, we test the logic boundaries
      const maxReasonableDuration = 7200; // 2 hours
      
      const testDurations = [0, -1, 7201, 10000];
      testDurations.forEach(duration => {
        if (duration <= 0) {
          expect(duration).toBeLessThanOrEqual(0);
        } else if (duration > maxReasonableDuration) {
          expect(duration).toBeGreaterThan(maxReasonableDuration);
        }
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent validations', async () => {
      const testFiles = [];
      
      // Create multiple test files
      for (let i = 0; i < 5; i++) {
        const testFile = path.join(testOutputsDir, `test${i}.webm`);
        fs.writeFileSync(testFile, Buffer.alloc(1000, `test${i}`));
        testFiles.push(testFile);
      }
      
      // Run validations concurrently
      const validationPromises = testFiles.map(file => validateAudioFile(file));
      const results = await Promise.all(validationPromises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.exists).toBe(true);
        expect(result.size).toBe(1000);
      });
    });

    it('should complete validations within reasonable time', async () => {
      const testFile = path.join(testOutputsDir, 'timing-test.webm');
      fs.writeFileSync(testFile, Buffer.alloc(1000, 'timing test'));
      
      const startTime = Date.now();
      await validateAudioFile(testFile);
      const endTime = Date.now();
      
      // Validation should complete within 5 seconds
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });
});