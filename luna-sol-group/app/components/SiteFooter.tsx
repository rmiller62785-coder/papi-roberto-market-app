import Link from "next/link";

export function SiteFooter() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <div className="footer-brand">Luna Sol Group</div>
          <p>Operator-led transformation for complex logistics, retail, mobility, and investor-backed businesses.</p>
        </div>
        <div>
          <span className="footer-label">Explore</span>
          <Link href="/#featured-work" prefetch={false}>Featured work</Link>
          <Link href="/#capabilities" prefetch={false}>Capabilities</Link>
          <Link href="/approach" prefetch={false}>Approach</Link>
          <Link href="/insights" prefetch={false}>Operations insights</Link>
        </div>
        <div>
          <span className="footer-label">Operations Products</span>
          <Link href="/tools/executive-operations-studio" prefetch={false}>Executive Operations Studio</Link>
          <Link href="/tools/implementation-workbench" prefetch={false}>Implementation Workbench</Link>
          <Link href="/tools" prefetch={false}>Products overview</Link>
          <Link href="/tools/backlog-recovery-calculator" prefetch={false}>Recovery calculator</Link>
          <Link href="/tools/constraint-diagnostic" prefetch={false}>Constraint hypothesis map</Link>
          <Link href="/diagnostic" prefetch={false}>PSA case model</Link>
        </div>
        <div>
          <span className="footer-label">Connect</span>
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          <Link href="/ops" prefetch={false}>Operator sign-in</Link>
          <a href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">LinkedIn ↗</a>
        </div>
      </div>
      <div className="shell footer-base">
        <span>© 2026 Luna Sol Group LLC</span>
        <span>Founded 2023 · Full-time advisory since January 2026</span>
        <span>Confidentiality-first · Results shown in anonymized form</span>
      </div>
    </footer>
  );
}
