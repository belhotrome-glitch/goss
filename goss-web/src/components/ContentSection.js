import React from 'react';

const h = React.createElement;

export default function ContentSection({ id, title, subtitle, variant, children }) {
  const className = variant ? `section ${variant}` : 'section';

  return h(
    'section',
    { id, className },
    h('h2', null, title),
    subtitle && h('p', { className: 'sub' }, subtitle),
    children,
  );
}
