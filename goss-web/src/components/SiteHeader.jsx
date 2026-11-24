import logo from '../../assets/img/logo.png';

export default function SiteHeader() {
  return (
    <header className="nav">
      <a className="brand" href="#top">
        <img className="logo-img" src={logo} alt="Tangub City Global College logo" />
        <span className="brand-text">Guidance Office &middot; TCGC</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="#services">Services</a>
        <a href="#how">How It Works</a>
        <a href="#resources">Resources</a>
        <a href="#contact">Contact</a>
        <a className="btn small" href="#portal">Sign In</a>
      </nav>
    </header>
  );
}
