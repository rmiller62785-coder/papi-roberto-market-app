import Image from "next/image";
import { testimonials } from "../content";

export function ClientValidation() {
  return (
    <section className="section client-validation" id="validation">
      <div className="shell">
        <div className="section-heading">
          <div>
            <span className="section-label">Client validation</span>
            <h2>We don&rsquo;t publish a quote we don&rsquo;t have permission to.</h2>
          </div>
          <p>
            Every figure on this site is either publicly sourced and cited, or explicitly labeled as Luna
            Sol&rsquo;s own reconstruction. Client testimonials work the same way: none is published until the
            client has explicitly signed off on it&mdash;no exceptions, no invented quotes.
          </p>
        </div>
        <div className="testimonial-grid">
          {testimonials.map((testimonial) => (
            <article className="testimonial-card" key={testimonial.key}>
              <div className="testimonial-logo">
                <Image src={testimonial.logo} width={testimonial.width} height={testimonial.height} alt={`${testimonial.company} logo`} />
              </div>
              <span className="testimonial-role">{testimonial.role}</span>
              {testimonial.quote ? (
                <>
                  <blockquote>&ldquo;{testimonial.quote}&rdquo;</blockquote>
                  <span className="testimonial-attribution">{testimonial.attributedName}</span>
                </>
              ) : (
                <div className="testimonial-pending">
                  <i aria-hidden="true">&middot;&middot;&middot;</i>
                  <strong>Testimonial pending {testimonial.company}&rsquo;s approval</strong>
                  <span>Shown here the moment it&rsquo;s given&mdash;not before.</span>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
