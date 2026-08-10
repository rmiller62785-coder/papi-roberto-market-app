import Link from "next/link";

export function SiteFooter() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";

  return (
    <footer className="site-footer">
      <div className="shell footer-invitation">
        <span>One decision at a time</span>
        <h2>Make the next operating decision inspectable.</h2>
        <Link className="button button-light" href="/#contact" prefetch={false}>Discuss an operating decision →</Link>
      </div>
      <div className="shell footer-grid">
        <div className="footer-firm">
          <div className="footer-brand"><i aria-hidden="true">LS</i><span>Luna Sol Group</span></div>
          <p>Operator-led transformation for complex logistics, retail, mobility, and investor-backed businesses.</p>
          <small>Founder-led · Confidential · Evidence-aware</small>
        </div>
        <div>
          <span className="footer-label">Explore</span>
          <Link href="/work" prefetch={false}>Selected work</Link>
          <Link href="/capabilities" prefetch={false}>What we solve</Link>
          <Link href="/tools" prefetch={false}>Decision products</Link>
          <Link href="/insights" prefetch={false}>Operations insights</Link>
          <Link href="/about" prefetch={false}>About Ryan</Link>
        </div>
        <div>
          <span className="footer-label">Connect</span>
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          <a href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">LinkedIn ↗</a>
          <Link href="/ops" prefetch={false}>Firm OS sign-in</Link>
        </div>
      </div>
      <div className="shell footer-base">
        <span>© 2026 Luna Sol Group LLC</span>
        <span>Founded 2023 · Full-time advisory since January 2026</span>
        <span>All client and company marks belong to their respective owners.</span>
      </div>
    </footer>
  );
}
