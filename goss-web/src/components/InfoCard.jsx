export default function InfoCard({ icon, title, children, href, linkLabel, className = '' }) {
  const content = (
    <>
      {icon && <span className="picon" aria-hidden="true">{icon}</span>}
      <h3>{title}</h3>
      <p>{children}</p>
      {linkLabel && <span className="more">{linkLabel}</span>}
    </>
  );

  if (href) {
    return (
      <a className={`card link-card ${className}`.trim()} href={href}>
        {content}
      </a>
    );
  }

  return (
    <article className={`card ${className}`.trim()}>
      {content}
    </article>
  );
}
