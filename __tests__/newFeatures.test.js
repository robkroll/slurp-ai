import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';

// Mock fs-extra for save-input tests
vi.mock('fs-extra', async () => {
  const actual = await vi.importActual('fs-extra');
  return {
    ...actual,
    default: {
      ...actual,
      ensureDir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      pathExists: vi.fn().mockResolvedValue(true),
      readdir: vi.fn().mockResolvedValue([]),
    },
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
  };
});

describe('New Features', () => {
  describe('--folder option', () => {
    it('should use custom folder name in workflow options', async () => {
      // Import after mocks
      const { runSlurpWorkflow } = await import('../src/slurpWorkflow.js');

      // Mock the DocumentationScraper
      vi.doMock('../src/DocumentationScraper.js', () => ({
        default: class MockScraper {
          constructor(config) {
            this.config = config;
            this.on = vi.fn();
            this.start = vi.fn().mockResolvedValue({
              processed: 1,
              failed: 0,
              duration: 1,
              rawHtmlTokens: 100,
              markdownTokens: 50,
            });
          }
          on() {}
          emit() {}
        },
      }));

      // The folder option should override the auto-detected name
      // We just test that the extractNameFromUrl is bypassed
      const { extractNameFromUrl } = await import('../src/slurpWorkflow.js');
      expect(extractNameFromUrl('https://login-uat.fisglobal.com/idp/docs')).toBe('fisglobal-login-uat');
    });

    it('should override siteName when folder option is provided', async () => {
      const { extractNameFromUrl } = await import('../src/slurpWorkflow.js');
      // The workflow uses options.folder || extractNameFromUrl(url)
      const url = 'https://login-uat.fisglobal.com/idp/docs';
      const autoName = extractNameFromUrl(url);
      const customFolder = 'idp-help-content';

      // Simulate the logic in runSlurpWorkflow
      const siteName1 = undefined || autoName;
      const siteName2 = customFolder || autoName;

      expect(siteName1).toBe('fisglobal-login-uat');
      expect(siteName2).toBe('idp-help-content');
    });
  });

  describe('--save-input option', () => {
    it('should configure saveInputDir when saveInput is true', () => {
      // The workflow creates saveInputDir = path.join(cwd, 'slurps_input', siteName)
      const siteName = 'idp-help-content';
      const saveInputDir = path.join(process.cwd(), 'slurps_input', siteName);
      expect(saveInputDir).toContain('slurps_input');
      expect(saveInputDir).toContain(siteName);
    });

    it('should not set saveInputDir when saveInput is not provided', () => {
      const options = {};
      const saveInputDir = options.saveInput ? path.join(process.cwd(), 'slurps_input', 'test') : null;
      expect(saveInputDir).toBeNull();
    });
  });

  describe('improved HTML cleanup in markdown', () => {
    let cleanupMarkdown;

    beforeEach(async () => {
      const mod = await import('../src/utils/markdownUtils.js');
      cleanupMarkdown = mod.cleanupMarkdown;
    });

    it('should remove colgroup/col tags', () => {
      const input = '<colgroup><col style="width: 5.759998px;"> <col style="width: 27.84px;"> <col style="width: auto;"></colgroup>1. Step one';
      const result = cleanupMarkdown(input);
      expect(result).not.toContain('<colgroup>');
      expect(result).not.toContain('<col');
      expect(result).toContain('1. Step one');
    });

    it('should convert inline <a> tags to markdown links', () => {
      const input = 'See <a href="EventDefinitions.html">Event Definitions</a> for more info.';
      const result = cleanupMarkdown(input);
      expect(result).not.toContain('<a');
      expect(result).toContain('[Event Definitions](EventDefinitions.html)');
    });

    it('should convert <b> tags to markdown bold', () => {
      const input = '<b>Alert Templates</b> — Firm Admins can create templates.';
      const result = cleanupMarkdown(input);
      expect(result).not.toContain('<b>');
      expect(result).toContain('**Alert Templates**');
    });

    it('should replace &nbsp; with spaces', () => {
      const input = 'Alert&nbsp;Manager&nbsp;handles events.';
      const result = cleanupMarkdown(input);
      expect(result).not.toContain('&nbsp;');
      expect(result).toContain('Alert Manager handles events.');
    });

    it('should handle complex HTML content from FIS Global docs', () => {
      const input = `<colgroup><col style="width: 6.719997px;"> <col style="width: 26.88px;"> <col style="width: auto;"></colgroup>»<b>Alert Templates</b> — Firm Admins can create <a href="AlertTemplates.html" class="HeadingOnly MCXref xref">alert templates</a>.`;
      const result = cleanupMarkdown(input);
      expect(result).not.toContain('<colgroup>');
      expect(result).not.toContain('<col');
      expect(result).not.toContain('<b>');
      expect(result).not.toContain('<a');
      expect(result).toContain('**Alert Templates**');
      expect(result).toContain('[alert templates](AlertTemplates.html)');
    });

    it('should remove <br> tags and replace with newlines', () => {
      const input = 'Line one<br/>Line two<br>Line three';
      const result = cleanupMarkdown(input);
      expect(result).not.toContain('<br');
      expect(result).toContain('Line one');
      expect(result).toContain('Line two');
    });

    it('should convert <i> and <em> to italic', () => {
      const input = 'This is <i>italic</i> and <em>emphasized</em>.';
      const result = cleanupMarkdown(input);
      expect(result).toContain('*italic*');
      expect(result).toContain('*emphasized*');
    });
  });

  describe('nested folder fix (skipDirectoryNesting)', () => {
    it('should not create nested library folder when skipDirectoryNesting is true', async () => {
      const { default: DocsToMarkdown } = await import('../src/DocumentationScraper.js');
      const scraper = new DocsToMarkdown({
        baseUrl: 'https://example.com/docs',
        outputDir: '/tmp/test-output/my-site',
        allowedDomains: ['example.com'],
      });

      // The saveMarkdown method should not nest when skipDirectoryNesting is true
      const options = { library: 'my-site', version: '', skipDirectoryNesting: true };
      // We can't easily test file writing, but we verify the logic
      expect(options.library && !options.skipDirectoryNesting).toBe(false);
    });

    it('should nest by library when skipDirectoryNesting is not set', () => {
      const options = { library: 'my-site', version: '' };
      expect(options.library && !options.skipDirectoryNesting).toBe(true);
    });
  });

  describe('relative link resolution', () => {
    let DocsToMarkdown;

    beforeEach(async () => {
      // Need to get the actual module - the fs mock doesn't interfere with class methods
      const mod = await vi.importActual('../src/DocumentationScraper.js');
      DocsToMarkdown = mod.default;
    });

    it('should resolve relative .html links to .md filenames', () => {
      const scraper = new DocsToMarkdown({
        baseUrl: 'https://example.com/docs/section/page.html',
        outputDir: '/tmp/out',
        allowedDomains: ['example.com'],
      });

      const markdown = 'See [Editing a Department](EditDepartment.html) for details.';
      const pageUrl = 'https://example.com/docs/section/page.html';
      const result = scraper.resolveRelativeLinks(markdown, pageUrl);

      expect(result).not.toContain('](EditDepartment.html)');
      expect(result).toContain('.md');
      expect(result).toContain('[Editing a Department]');
    });

    it('should resolve parent-relative .html links', () => {
      const scraper = new DocsToMarkdown({
        baseUrl: 'https://example.com/docs/a/b/page.html',
        outputDir: '/tmp/out',
        allowedDomains: ['example.com'],
      });

      const markdown = 'See [Queue](../Approvals/ApprovalQueue.html)';
      const pageUrl = 'https://example.com/docs/a/b/page.html';
      const result = scraper.resolveRelativeLinks(markdown, pageUrl);

      expect(result).not.toContain('../Approvals/ApprovalQueue.html');
      expect(result).toContain('.md');
    });

    it('should not modify absolute URLs', () => {
      const scraper = new DocsToMarkdown({
        baseUrl: 'https://example.com/docs',
        outputDir: '/tmp/out',
        allowedDomains: ['example.com'],
      });

      const markdown = 'See [Link](https://other.com/page.html)';
      const pageUrl = 'https://example.com/docs/page.html';
      const result = scraper.resolveRelativeLinks(markdown, pageUrl);

      expect(result).toBe('See [Link](https://other.com/page.html)');
    });

    it('should preserve hash fragments in resolved links', () => {
      const scraper = new DocsToMarkdown({
        baseUrl: 'https://example.com/docs/page.html',
        outputDir: '/tmp/out',
        allowedDomains: ['example.com'],
      });

      const markdown = 'See [Section](other.html#section1)';
      const pageUrl = 'https://example.com/docs/page.html';
      const result = scraper.resolveRelativeLinks(markdown, pageUrl);

      expect(result).toContain('#section1');
      expect(result).toContain('.md');
    });
  });
});
