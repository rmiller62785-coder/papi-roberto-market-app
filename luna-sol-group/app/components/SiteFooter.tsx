import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <div className="footer-brand">Luna Sol Group</div>
          <p>Operator-led transformation for complex logistics, retail, mobility, and investor-backed businesses.</p>
        </div>
        <div>
          <span className="footer-label">Explore</span>
          <Link href="/#featured-work">Featured work</Link>
          <Link href="/#capabilities">Capabilities</Link>
          <Link href="/approach">Approach</Link>
        </div>
        <div>
          <span className="footer-label">Operations Lab</span>
          <Link href="/tools">Operations Lab overview</Link>
          <Link href="/tools/backlog-recovery-calculator">Recovery calculator</Link>
          <Link href="/tools/constraint-diagnostic">Constraint hypothesis map</Link>
          <Link href="/diagnostic">PSA case model</Link>
        </div>
        <div>
          <span className="footer-label">Connect</span>
          <a href="mailto:Rmiller62785@gmail.com">Rmiller62785@gmail.com</a>
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
