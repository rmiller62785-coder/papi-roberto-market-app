import Link from "next/link";
import { utilityNavigation } from "../content";
import { DecisionFinder } from "./DecisionFinder";
import { MegaNavigation } from "./MegaNavigation";
import { MobileNav } from "./MobileNav";

export function SiteHeader() {
  const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL || "/#contact";
  const isExternalCalendar = calendarUrl.startsWith("http");

  return (
    <header className="site-header rebuild-header">
      <div className="rebuild-utility-rail">
        <div className="shell rebuild-utility-shell">
          <p>Management consulting</p>
          <nav aria-label="Utility navigation">
            {utilityNavigation.map((item) => item.external ? (
              <a href={item.href} key={item.href} target="_blank" rel="noreferrer">
                {item.label} <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <Link href={item.href} key={item.href} prefetch={false}>{item.label}</Link>
            ))}
            <a
              href={calendarUrl}
              target={isExternalCalendar ? "_blank" : undefined}
              rel={isExternalCalendar ? "noreferrer" : undefined}
            >
              Contact <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </div>
      </div>

      <div className="shell rebuild-core-shell">
        <Link className="rebuild-wordmark" href="/" aria-label="Luna Sol Group home" prefetch={false}>
          <span className="rebuild-wordmark-name">LUNA SOL</span>
          <span className="rebuild-wordmark-group">Group</span>
          <small>Operator-led transformation</small>
        </Link>

        <MegaNavigation />

        <div className="rebuild-header-actions">
          <DecisionFinder compact />
          <a
            className="rebuild-contact-link"
            href={calendarUrl}
            target={isExternalCalendar ? "_blank" : undefined}
            rel={isExternalCalendar ? "noreferrer" : undefined}
          >
            Get in touch <span aria-hidden="true">↗</span>
          </a>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
