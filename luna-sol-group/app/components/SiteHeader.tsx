import Link from "next/link";
import { primaryNav } from "../content";

export function SiteHeader() {
  const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL || "/#contact";
  const isExternalCalendar = calendarUrl.startsWith("http");

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Luna Sol Group home">
          <span className="brand-mark" aria-hidden="true">LS</span>
          <span>
            <strong>Luna Sol Group</strong>
            <small>Operator-led transformation</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {primaryNav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <a
          className="button button-small header-cta"
          href={calendarUrl}
          target={isExternalCalendar ? "_blank" : undefined}
          rel={isExternalCalendar ? "noreferrer" : undefined}
        >
          Start a conversation <span aria-hidden="true">↗</span>
        </a>
        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <div>
            {primaryNav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
            <Link href="/#contact">Start a conversation</Link>
          </div>
        </details>
      </div>
    </header>
  );
}
