import Link from "next/link";
import { primaryNav } from "../content";
import { MobileNav } from "./MobileNav";

export function SiteHeader() {
  const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL || "/#contact";
  const isExternalCalendar = calendarUrl.startsWith("http");

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Luna Sol Group home" prefetch={false}>
          <span className="brand-mark" aria-hidden="true">LS</span>
          <span>
            <strong>Luna Sol Group</strong>
            <small>Management consulting</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {primaryNav.map((item) => <Link key={item.href} href={item.href} prefetch={false}>{item.label}</Link>)}
        </nav>
        <a
          className="button button-small header-cta"
          href={calendarUrl}
          target={isExternalCalendar ? "_blank" : undefined}
          rel={isExternalCalendar ? "noreferrer" : undefined}
        >
          Get in touch <span aria-hidden="true">↗</span>
        </a>
        <MobileNav />
      </div>
    </header>
  );
}
