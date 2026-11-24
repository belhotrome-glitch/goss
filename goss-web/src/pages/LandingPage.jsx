import ContentSection from '../components/ContentSection.jsx';
import InfoCard from '../components/InfoCard.jsx';
import SiteHeader from '../components/SiteHeader.jsx';
import '../styles/landing.css';

const services = [
  {
    icon: '📘',
    title: 'Academic Issues',
    description: 'Study planning, course load advice and support when your grades are slipping.',
  },
  {
    icon: '💼',
    title: 'Career Guidance',
    description: 'Resume reviews, internship guidance and career-path exploration.',
  },
  {
    icon: '🌱',
    title: 'Mental Health & Wellbeing',
    description: 'Someone to talk to about stress and keeping a healthy study-life balance.',
  },
  {
    icon: '🤝',
    title: 'Personal Issues',
    description: 'Family, friendships or anything else on your mind.',
  },
  {
    icon: '💰',
    title: 'Financial Concerns',
    description: 'Talk to a counselor about financial difficulties that affect your studies.',
  },
  {
    icon: '🛡️',
    title: 'Bullying & Harassment',
    description: 'Report bullying or harassment so the office can respond.',
  },
];

const steps = [
  ['Sign in', 'Use your student ID number on the student portal.'],
  ['Submit a concern', "Pick a category and describe what's going on. Mark it urgent if it can't wait."],
  ['Chat with your counselor', 'A counselor takes your case, and replies appear in your private message thread.'],
  ['Book an appointment', 'Request an in-person or virtual session at a time that suits you.'],
  ['Share feedback', 'After a completed appointment, rate your experience.'],
];

const portalOptions = [
  {
    icon: '🎓',
    title: 'Student Login',
    description: 'Submit concerns, book appointments and chat with your counselor.',
    href: 'login/student.html',
    linkLabel: 'Sign in as student →',
  },
  {
    icon: '🧑‍🏫',
    title: 'Staff Login',
    description: 'For guidance counselors and office staff to manage concerns, appointments and reports.',
    href: 'login/staff.html',
    linkLabel: 'Sign in as staff →',
  },
];

function CardGrid({ children, className = '' }) {
  return <div className={`grid ${className}`.trim()}>{children}</div>;
}

function GuidanceResources() {
  return (
    <>
      <CardGrid>
        <InfoCard icon="🎓" title="Academic Guidance">
          Study planning, course load advice and academic probation support.
        </InfoCard>
        <InfoCard icon="📖" title="Study Resources">
          Time-management and study-skill techniques, available at the Guidance Office or by asking a counselor.
        </InfoCard>
        <InfoCard icon="📋" title="School Policies">
          Check the student handbook for attendance, conduct and academic policies, and ask a counselor if you need help understanding them.
        </InfoCard>
      </CardGrid>
      <aside className="alert">
        <strong>In an emergency</strong>
        <p>
          For a life-threatening emergency, contact local emergency services immediately. For urgent concerns that aren't emergencies, submit a concern marked "Urgent" or contact the Guidance Office directly. Online wellbeing resources are not a substitute for medical or mental-health diagnosis or treatment.
        </p>
      </aside>
    </>
  );
}

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <section className="hero">
          <p className="eyebrow">Tangub City Global College</p>
          <h1>The Guidance Office is here to listen and to help.</h1>
          <p className="lead">
            Whether it's your studies, your future career, or something personal, you can reach a guidance counselor online. Send a concern, chat privately with your counselor, and book an appointment.
          </p>
          <div className="actions">
            <a className="btn" href="login/student.html">Student Sign In</a>
            <a className="btn ghost" href="#services">What We Help With</a>
          </div>
        </section>

        <ContentSection
          id="services"
          title="What We Help With"
          subtitle="You can send a concern to the Guidance Office under any of these categories."
        >
          <CardGrid>
            {services.map(({ icon, title, description }) => (
              <InfoCard key={title} icon={icon} title={title}>{description}</InfoCard>
            ))}
          </CardGrid>
        </ContentSection>

        <ContentSection id="how" title="How It Works" variant="alt">
          <ol className="steps">
            {steps.map(([title, description]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </li>
            ))}
          </ol>
        </ContentSection>

        <ContentSection title="Why Use the Online Portal">
          <CardGrid>
            <InfoCard title="Private conversations">
              Messages on a case can be read only by you and the counselor handling it, plus system administrators.
            </InfoCard>
            <InfoCard title="Easy appointments">
              Request, track and cancel appointments from one place, in person or virtual.
            </InfoCard>
            <InfoCard title="Stay informed">
              Get notifications about replies and appointment updates, and see office announcements on your dashboard.
            </InfoCard>
          </CardGrid>
        </ContentSection>

        <ContentSection id="resources" title="Guidance Resources" variant="alt">
          <GuidanceResources />
        </ContentSection>

        <ContentSection
          id="portal"
          title="Sign In to GOSS"
          subtitle="The Guidance Office Support System. Choose your portal."
        >
          <CardGrid className="portal-grid">
            {portalOptions.map((option) => (
              <InfoCard
                key={option.title}
                icon={option.icon}
                title={option.title}
                href={option.href}
                linkLabel={option.linkLabel}
                className="portal-card"
              >
                {option.description}
              </InfoCard>
            ))}
          </CardGrid>
        </ContentSection>

        <ContentSection id="contact" title="Find Us" variant="alt">
          <ul className="contact">
            <li><strong>College address:</strong> Juan Luna St., Maloro, Tangub City, Misamis Occidental, Philippines</li>
            <li><strong>College phone:</strong> (088) 545-2793</li>
            <li>
              <strong>College website:</strong>{' '}
              <a href="http://www.gadtc.edu.ph/">www.gadtc.edu.ph</a>
            </li>
          </ul>
        </ContentSection>
      </main>
      <footer>
        <p>
          &copy; {new Date().getFullYear()} Guidance Office, Tangub City Global College. All rights reserved.
        </p>
      </footer>
    </>
  );
}
