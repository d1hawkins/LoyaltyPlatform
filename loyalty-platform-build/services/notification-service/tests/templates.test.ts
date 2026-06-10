import { TemplateLoader } from '../src/templates';

describe('TemplateLoader', () => {
  const loader = new TemplateLoader();

  it('lists all templates on disk', () => {
    const keys = loader.listTemplates().sort();
    expect(keys).toEqual([
      'gdpr_deletion_confirmed',
      'points_earned_digest',
      'points_expiry_reminder_30d',
      'points_expiry_reminder_7d',
      'tier_downgraded',
      'tier_upgraded',
      'welcome',
    ]);
  });

  it('renders welcome with variables', () => {
    const r = loader.render('welcome', 'en-US', {
      memberName: 'Alice',
      programName: 'HawkPoints',
      tenantName: 'HawkCo',
      supportEmail: 'help@hawkco.test',
      unsubscribeUrl: 'https://ex.test/u?m=1',
    });
    expect(r.subject).toContain('Welcome to HawkPoints, Alice');
    expect(r.html).toContain('<strong>HawkPoints</strong>');
    expect(r.text).toContain('Hi Alice');
  });

  it('renders tier_upgraded with previous/new tier', () => {
    const r = loader.render('tier_upgraded', 'en-US', {
      memberName: 'Bob',
      programName: 'HP',
      previousTier: 'Silver',
      newTier: 'Gold',
      supportEmail: 's@t',
      unsubscribeUrl: 'u',
    });
    expect(r.subject).toContain('Gold');
    expect(r.text).toContain('Silver to Gold');
  });

  it('falls back to en-US when locale file missing', () => {
    const r = loader.render('welcome', 'fr-FR', {
      memberName: 'Claire',
      programName: 'HP',
      tenantName: 'X',
      supportEmail: 's@t',
      unsubscribeUrl: 'u',
    });
    expect(r.subject).toContain('Welcome to HP, Claire');
  });

  it('throws on unknown template', () => {
    expect(() => loader.render('nope', 'en-US', {})).toThrow(/not found/);
  });

  it('escapes HTML entities in body.html', () => {
    const r = loader.render('welcome', 'en-US', {
      memberName: '<script>x</script>',
      programName: 'HP',
      tenantName: 'X',
      supportEmail: 's@t',
      unsubscribeUrl: 'u',
    });
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).not.toContain('<script>');
  });
});
