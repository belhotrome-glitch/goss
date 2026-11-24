import React from 'react';

const h = React.createElement;

export default function SiteHeader() {
  return h(
    'header',
    { className: 'nav' },
    h(
      'a',
      { className: 'brand', href: '#top' },
      h('img', {
        className: 'logo-img',
        src: './assets/img/logo.png',
        alt: 'Tangub City Global College logo',
      }),
      h('span', { className: 'brand-text' }, 'Guidance Office · TCGC'),
    ),
    h(
      'nav',
      { 'aria-label': 'Main navigation' },
      h('a', { href: '#services' }, 'Services'),
      h('a', { href: '#how' }, 'How It Works'),
      h('a', { href: '#resources' }, 'Resources'),
      h('a', { href: '#contact' }, 'Contact'),
      h('a', { className: 'btn small', href: '#portal' }, 'Sign In'),
    ),
  );
}
