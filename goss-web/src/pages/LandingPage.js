import React from 'react';
import ContentSection from '../components/ContentSection.js';
import InfoCard from '../components/InfoCard.js';
import SiteHeader from '../components/SiteHeader.js';

const h = React.createElement;

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
  return h('div', { className: `grid ${className}`.trim() }, children);
}

function GuidanceResources() {
  return h(
    React.Fragment,
    null,
    h(
      CardGrid,
      null,
      h(InfoCard, { icon: '🎓', title: 'Academic Guidance' },
        'Study planning, course load advice and academic probation support.'),
      h(InfoCard, { icon: '📖', title: 'Study Resources' },
        'Time-management and study-skill techniques, available at the Guidance Office or by asking a counselor.'),
      h(InfoCard, { icon: '📋', title: 'School Policies' },
        'Check the student handbook for attendance, conduct and academic policies, and ask a counselor if you need help understanding them.'),
    ),
    h(
      'aside',
      { className: 'alert' },
      h('strong', null, 'In an emergency'),
      h(
        'p',
        null,
        `For a life-threatening emergency, contact local emergency services immediately. For urgent concerns that aren't emergencies, submit a concern marked "Urgent" or contact the Guidance Office directly. Online wellbeing resources are not a substitute for medical or mental-health diagnosis or treatment.`,
      ),
    ),
  );
}

export default function LandingPage() {
  return h(
    React.Fragment,
    null,
    h(SiteHeader),
    h(
      'main',
      { id: 'top' },
      h(
        'section',
        { className: 'hero' },
        h('p', { className: 'eyebrow' }, 'Tangub City Global College'),
        h('h1', null, 'The Guidance Office is here to listen and to help.'),
        h(
          'p',
          { className: 'lead' },
          "Whether it's your studies, your future career, or something personal, you can reach a guidance counselor online. Send a concern, chat privately with your counselor, and book an appointment.",
        ),
        h(
          'div',
          { className: 'actions' },
          h('a', { className: 'btn', href: 'login/student.html' }, 'Student Sign In'),
          h('a', { className: 'btn ghost', href: '#services' }, 'What We Help With'),
        ),
      ),
      h(
        ContentSection,
        {
          id: 'services',
          title: 'What We Help With',
          subtitle: 'You can send a concern to the Guidance Office under any of these categories.',
        },
        h(
          CardGrid,
          null,
          ...services.map(({ icon, title, description }) =>
            h(InfoCard, { key: title, icon, title }, description)),
        ),
      ),
      h(
        ContentSection,
        { id: 'how', title: 'How It Works', variant: 'alt' },
        h(
          'ol',
          { className: 'steps' },
          ...steps.map(([title, description]) =>
            h(
              'li',
              { key: title },
              h('strong', null, title),
              h('span', null, description),
            )),
        ),
      ),
      h(
        ContentSection,
        { title: 'Why Use the Online Portal' },
        h(
          CardGrid,
          null,
          h(InfoCard, { title: 'Private conversations' },
            'Messages on a case can be read only by you and the counselor handling it, plus system administrators.'),
          h(InfoCard, { title: 'Easy appointments' },
            'Request, track and cancel appointments from one place, in person or virtual.'),
          h(InfoCard, { title: 'Stay informed' },
            'Get notifications about replies and appointment updates, and see office announcements on your dashboard.'),
        ),
      ),
      h(
        ContentSection,
        { id: 'resources', title: 'Guidance Resources', variant: 'alt' },
        h(GuidanceResources),
      ),
      h(
        ContentSection,
        {
          id: 'portal',
          title: 'Sign In to GOSS',
          subtitle: 'The Guidance Office Support System. Choose your portal.',
        },
        h(
          CardGrid,
          { className: 'portal-grid' },
          ...portalOptions.map((option) =>
            h(InfoCard, {
              key: option.title,
              ...option,
              className: 'portal-card',
            }, option.description)),
        ),
      ),
      h(
        ContentSection,
        { id: 'contact', title: 'Find Us', variant: 'alt' },
        h(
          'ul',
          { className: 'contact' },
          h('li', null,
            h('strong', null, 'College address:'),
            ' Juan Luna St., Maloro, Tangub City, Misamis Occidental, Philippines'),
          h('li', null,
            h('strong', null, 'College phone:'),
            ' (088) 545-2793'),
          h('li', null,
            h('strong', null, 'College website:'),
            ' ',
            h('a', { href: 'http://www.gadtc.edu.ph/' }, 'www.gadtc.edu.ph')),
        ),
      ),
    ),
    h(
      'footer',
      null,
      h(
        'p',
        null,
        `© ${new Date().getFullYear()} Guidance Office, Tangub City Global College. All rights reserved.`,
      ),
    ),
  );
}
