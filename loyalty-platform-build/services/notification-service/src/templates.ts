import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import Handlebars from 'handlebars';
import type { TemplateVariables } from './types';

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateLoaderOptions {
  rootDir?: string;
  defaultLocale?: string;
}

/**
 * Filesystem-backed Handlebars template loader.
 *
 * Layout: `<rootDir>/<templateKey>/<locale>.subject.hbs`,
 * `<locale>.body.html.hbs`, `<locale>.body.text.hbs`.
 *
 * If a locale file is missing, falls back to the default locale (en-US).
 * Compiled templates are cached in memory.
 */
export class TemplateLoader {
  private readonly rootDir: string;
  private readonly defaultLocale: string;
  private readonly cache = new Map<string, HandlebarsTemplateDelegate>();

  constructor(opts: TemplateLoaderOptions = {}) {
    this.rootDir = opts.rootDir ?? resolve(__dirname, '..', 'templates');
    this.defaultLocale = opts.defaultLocale ?? 'en-US';
  }

  public listTemplates(): string[] {
    if (!existsSync(this.rootDir)) return [];
    return readdirSync(this.rootDir).filter((name) => {
      try {
        return statSync(join(this.rootDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  }

  public hasTemplate(templateKey: string): boolean {
    return existsSync(join(this.rootDir, templateKey));
  }

  public render(
    templateKey: string,
    locale: string,
    variables: TemplateVariables,
  ): RenderedTemplate {
    if (!this.hasTemplate(templateKey)) {
      throw new Error(`Template not found: ${templateKey}`);
    }
    const subject = this.renderPart(templateKey, locale, 'subject', variables).trim();
    const html = this.renderPart(templateKey, locale, 'body.html', variables);
    const text = this.renderPart(templateKey, locale, 'body.text', variables);
    return { subject, html, text };
  }

  private renderPart(
    templateKey: string,
    locale: string,
    kind: 'subject' | 'body.html' | 'body.text',
    variables: TemplateVariables,
  ): string {
    const fn = this.loadCompiled(templateKey, locale, kind);
    return fn(variables);
  }

  private loadCompiled(
    templateKey: string,
    locale: string,
    kind: 'subject' | 'body.html' | 'body.text',
  ): HandlebarsTemplateDelegate {
    const cacheKey = `${templateKey}|${locale}|${kind}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const source = this.readSource(templateKey, locale, kind);
    const compiled = Handlebars.compile(source, { noEscape: kind === 'subject' });
    this.cache.set(cacheKey, compiled);
    return compiled;
  }

  private readSource(
    templateKey: string,
    locale: string,
    kind: 'subject' | 'body.html' | 'body.text',
  ): string {
    const file = `${locale}.${kind}.hbs`;
    const primary = join(this.rootDir, templateKey, file);
    if (existsSync(primary)) return readFileSync(primary, 'utf8');

    // fallback to default locale
    const fallback = join(this.rootDir, templateKey, `${this.defaultLocale}.${kind}.hbs`);
    if (existsSync(fallback)) return readFileSync(fallback, 'utf8');

    throw new Error(
      `Template file missing: ${templateKey}/${locale}.${kind}.hbs (and no ${this.defaultLocale} fallback)`,
    );
  }
}
