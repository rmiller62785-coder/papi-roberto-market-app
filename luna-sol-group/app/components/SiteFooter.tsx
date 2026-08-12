import Link from "next/link";
import { footerNavigation } from "../content";

export function SiteFooter() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";
  const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL || "/#contact";
  const isExternalCalendar = calendarUrl.startsWith("http");

  return (
    <footer className="site-footer rebuild-footer">
      <div className="shell rebuild-footer-invitation">
        <div>
          <span><i aria-hidden="true" /> Start with the operating decision</span>
          <h2>Make the next move <em>inspectable.</em></h2>
        </div>
        <p>Bring the commitment, the evidence you trust, and the consequence of getting it wrong. Luna Sol will help determine whether there is a useful path forward.</p>
        <a
          className="button button-light"
          href={calendarUrl}
          target={isExternalCalendar ? "_blank" : undefined}
          rel={isExternalCalendar ? "noreferrer" : undefined}
        >
          Start a conversation <span aria-hidden="true">↗</span>
        </a>
      </div>

      <div className="shell rebuild-footer-grid">
        <div className="rebuild-footer-firm">
          <Link className="rebuild-footer-wordmark" href="/" prefetch={false}>
            <span>Luna Sol</span> <i>Group</i>
          </Link>
          <p>Founder-led management consulting for complex logistics, retail, mobility, and investor-backed businesses.</p>
          <small>Operator-led · Confidentiality-first · Evidence-aware</small>
        </div>

        <nav aria-label="Explore">
          <span className="rebuild-footer-label">Explore</span>
          {footerNavigation.explore.map((item) => <Link href={item.href} key={item.href} prefetch={false}>{item.label}</Link>)}
        </nav>

        <nav aria-label="Operations Lab">
          <span className="rebuild-footer-label">Operations Lab</span>
          {footerNavigation.lab.map((item) => <Link href={item.href} key={item.href} prefetch={false}>{item.label}</Link>)}
        </nav>

        <nav aria-label="Trust and standards">
          <span className="rebuild-footer-label">Trust & standards</span>
          {footerNavigation.trust.map((item) => <Link href={item.href} key={item.href} prefetch={false}>{item.label}</Link>)}
        </nav>

        <div className="rebuild-footer-connect">
          <span className="rebuild-footer-label">Connect</span>
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          <a href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
          <Link href="/#contact" prefetch={false}>Contact form</Link>
        </div>
      </div>

      <div className="shell rebuild-footer-base">
        <span>© 2026 Luna Sol Group LLC</span>
        <span>Founded 2023 · Full-time advisory since January 2026</span>
        <span>All client and company marks belong to their respective owners.</span>
      </div>
    </footer>
  );
}
