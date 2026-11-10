import { normalizeAcceptLanguage } from '../accept-language';

describe('normalizeAcceptLanguage', () => {
  it('returns undefined for undefined input', () => {
    expect(normalizeAcceptLanguage(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeAcceptLanguage('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(normalizeAcceptLanguage('   ')).toBeUndefined();
  });

  it('maps pt-BR with q-values to pt (highest-q supported wins)', () => {
    expect(normalizeAcceptLanguage('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt');
  });

  it('maps en-US,en;q=0.9 to en', () => {
    expect(normalizeAcceptLanguage('en-US,en;q=0.9')).toBe('en');
  });

  it('maps bare "pt" to pt', () => {
    expect(normalizeAcceptLanguage('pt')).toBe('pt');
  });

  it('maps bare "en" to en', () => {
    expect(normalizeAcceptLanguage('en')).toBe('en');
  });

  it('maps Spanish language and regional tags to es', () => {
    expect(normalizeAcceptLanguage('es')).toBe('es');
    expect(normalizeAcceptLanguage('es-MX,es;q=0.9,en;q=0.8')).toBe('es');
    expect(normalizeAcceptLanguage('ES-419')).toBe('es');
  });

  it('returns undefined for unsupported "ar"', () => {
    expect(normalizeAcceptLanguage('ar')).toBeUndefined();
  });

  it('returns undefined for unsupported "ar-SA"', () => {
    expect(normalizeAcceptLanguage('ar-SA')).toBeUndefined();
  });

  it('returns undefined when no supported language present', () => {
    expect(normalizeAcceptLanguage('fr-FR,ar;q=0.9')).toBeUndefined();
  });

  it('skips unsupported and picks highest-q supported', () => {
    expect(normalizeAcceptLanguage('fr,en;q=0.5,pt;q=0.9')).toBe('pt');
  });

  it('defaults missing q to 1.0 and breaks ties by appearance order', () => {
    // en has explicit q=0.9, pt has implicit q=1.0 -> pt wins
    expect(normalizeAcceptLanguage('en;q=0.9,pt')).toBe('pt');
  });

  it('on equal q keeps first by appearance order', () => {
    // both implicit q=1.0 -> first (en) wins
    expect(normalizeAcceptLanguage('en,pt')).toBe('en');
    expect(normalizeAcceptLanguage('pt,en')).toBe('pt');
  });

  it('handles uppercase tags', () => {
    expect(normalizeAcceptLanguage('PT-BR')).toBe('pt');
    expect(normalizeAcceptLanguage('EN-US')).toBe('en');
  });

  it('treats malformed q as q=0', () => {
    // en has malformed q (treated as 0), pt implicit 1.0 -> pt wins
    expect(normalizeAcceptLanguage('en;q=abc,pt;q=0.1')).toBe('pt');
  });
});
