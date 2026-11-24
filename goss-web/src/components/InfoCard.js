import React from 'react';

const h = React.createElement;

export default function InfoCard({ icon, title, children, href, linkLabel, className = '' }) {
  const content = [
    icon && h('span', { className: 'picon', 'aria-hidden': 'true' }, icon),
    h('h3', null, title),
    h('p', null, children),
    linkLabel && h('span', { className: 'more' }, linkLabel),
  ];

  if (href) {
    return h(
      'a',
      { className: `card link-card ${className}`.trim(), href },
      ...content,
    );
  }

  return h('article', { className: `card ${className}`.trim() }, ...content);
}
