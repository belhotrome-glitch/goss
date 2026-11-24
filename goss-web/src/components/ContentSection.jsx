export default function ContentSection({ id, title, subtitle, variant, children }) {
  const className = variant ? `section ${variant}` : 'section';

  return (
    <section id={id} className={className}>
      <h2>{title}</h2>
      {subtitle && <p className="sub">{subtitle}</p>}
      {children}
    </section>
  );
}
