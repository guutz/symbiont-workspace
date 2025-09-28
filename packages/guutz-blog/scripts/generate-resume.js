#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const resumePath = path.resolve(process.cwd(), 'content/resume');
const themeDir = path.resolve(process.cwd(), 'content/resume/theme');
const outputDir = path.resolve(process.cwd(), 'src/routes/resume');
const tempHtml = path.resolve(process.cwd(), 'resume-output.html');
const outputFile = path.join(outputDir, '+page.svelte');


try {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('🔨 Generating resume from', resumePath, 'using theme', themeDir);

  // Run resumed from the resume directory so a relative theme path works.
    // Use an explicit file:// URL to the theme's ESM entry so resumed can
    // dynamic-import it regardless of the CLI's module resolution base.
    const themeIndex = path.join(themeDir, 'index.mjs');
    const themeUrl = pathToFileURL(themeIndex).href;

    execSync(`npx resumed render -o "${tempHtml}" --theme "${themeUrl}"`, {
      stdio: 'inherit',
      cwd: resumePath,
      env: process.env
    });

  const html = fs.readFileSync(tempHtml, 'utf8');
  fs.writeFileSync(outputFile, html, 'utf8');
  try { fs.unlinkSync(tempHtml); } catch (e) {}

  console.log('✅ Resume generated at', outputFile);
  process.exit(0);
} catch (err) {
  console.error('❌ Resume generation failed:', err && err.message ? err.message : err);
  // Fail the prebuild so CI is aware. If you'd prefer a placeholder instead,
  // change this to create a placeholder + exit 0.
  process.exit(1);
}
