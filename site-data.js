window.GCGW_SITE = {
  // The brief's 20.3k projects-completed figure is withheld until the owner confirms it.
  stats: {
    years: '15+',
    workers: '150+',
    services: '8',
    locations: '7'
  },
  testimonials: [
    {
      clientName: 'Sindhe Associates',
      personName: '[ADD CONTACT NAME]',
      role: '[ADD ROLE]',
      quote: '[ADD CLIENT-APPROVED QUOTE]',
      approved: false
    },
    {
      clientName: 'URC Constructions',
      personName: '[ADD CONTACT NAME]',
      role: '[ADD ROLE]',
      quote: '[ADD CLIENT-APPROVED QUOTE]',
      approved: false
    },
    {
      clientName: 'Stalwart Projects Pvt Ltd',
      personName: '[ADD CONTACT NAME]',
      role: '[ADD ROLE]',
      quote: '[ADD CLIENT-APPROVED QUOTE]',
      approved: false
    }
  ]
};

(function hydrateStats() {
  const stats = window.GCGW_SITE.stats;
  document.querySelectorAll('[data-stat]').forEach(element => {
    const value = stats[element.dataset.stat];
    if (value != null) element.textContent = value;
  });
  document.querySelectorAll('[data-stat-suffix]').forEach(element => {
    const value = stats[element.dataset.statSuffix];
    if (value != null) element.textContent = value + (element.dataset.suffix || '');
  });
})();
