# Luna Sol Group × L.E.K. Benchmark

## Executive verdict

The published Luna Sol redesign is cleaner, but it is not yet in L.E.K.'s category.

L.E.K. presents an institutional consulting and publishing ecosystem. Luna Sol currently presents a polished founder portfolio with tools attached. The next release must not be another color-and-spacing pass. It must rebuild the site's visual system, content model, navigation, media layer, and discovery experience around a smaller but equally coherent idea: **a founder-led operating transformation firm with an evidence-backed publishing and product system.**

The goal is not to imitate L.E.K.'s scale or claim capabilities Luna Sol does not have. The goal is to match its design maturity, editorial confidence, navigation clarity, media quality, and content discoverability while making Luna Sol's actual differentiation—operator credibility, evidence rooms, and decision products—more tangible.

Measured on August 12, 2026, L.E.K.'s desktop homepage was approximately 4,594px tall versus approximately 8,866px for Luna Sol. On mobile, L.E.K. was approximately 5,689px while Luna Sol exceeded 13,900px before the footer. L.E.K. used 17 homepage images plus video; Luna used five images, including the same founder portrait twice. This is not a small styling gap. It is a difference in composition, content density, media system, and publishing architecture.

## Side-by-side benchmark

| Dimension | L.E.K. today | Luna Sol today | Required change |
|---|---|---|---|
| First impression | Immersive dark-green branded world, bold sans headline, editorial imagery, layered story cards | Light editorial page, oversized serif headline, founder image panel | Replace the beige founder-portfolio hero with a deep-green editorial hero and a featured insight/case media system |
| Brand mark | Highly recognizable full wordmark | Small LS monogram plus tiny text | Create a distinctive horizontal Luna Sol wordmark and simplified mobile mark |
| Navigation | Two-tier utility and primary navigation, dropdowns, search, Find an Expert, offices, press, careers | Single flat six-link row and CTA | Add utility rail, mega menus, site search, topic taxonomy, and clear audience paths |
| Homepage role | Dynamic magazine, brand story, capability proof, case proof, metrics, experts, careers | Long sequential sales page | Make the homepage an editorial front door with fewer, stronger modules and current content |
| Hero | 60/40 composition with statement plus featured article; supporting article rail visible in first viewport | 50/50 statement plus portrait; the production image optimizer currently corrupts the lower half of the portrait into a flat block | Use one hero statement, one current featured story, and a supporting insight rail; move the principal lower on the page; fix media delivery |
| Typography | Assertive geometric sans display paired with readable serif/body treatment | Very large traditional serif on nearly every major section | Use an ownable sans-led display system; reserve serif for selected editorial quotations or article decks |
| Photography | Frequent, high-quality, human, sector, and work-context imagery | One repeated founder image plus a few case assets | Build a disciplined image library and editorial crops; use real operating/context imagery rather than decorative UI mockups |
| Content density | Dense but organized; much more information visible per viewport | Large type, tall modules, limited information per viewport | Reduce headline scale and vertical padding; increase useful content density without creating clutter |
| Capabilities | 14 named capability destinations with individual landing pages and related experts/insights | Four capabilities contained on one page | Create individual capability pages with problems, interventions, artifacts, work, related insights, and a focused CTA |
| Industries | 14 industry destinations with individual landing pages and topic depth | Four industries contained on one page | Create focused industry pages only where evidence exists; connect each to relevant work, operator record, and insights |
| Insights | 100+ pages, filters, pagination, categories, dates, photography, recurring content | Three text-only articles in a fixed grid | Build a filterable insight library and publish a real initial corpus with strong cover imagery and topic taxonomy |
| Case studies | Image-led, categorized carousel and library integrated with insights | Three evidence-rich dossiers, but cards and layouts feel isolated | Keep the evidence advantage; adopt consistent editorial thumbnails, metadata, chapter navigation, and related-content rails |
| Expertise | Searchable leader directory and profile pages | One founder page | Position Ryan as the named expert; add expertise/topic tags, media/speaking, downloadable biography, and direct inquiry path |
| Institutional proof | Offices, partner count, transaction volume, project volume, global language/context | Prior-employer metrics and client logos | Replace borrowed scale cues with an honest operating-record register, engagement footprint, publication cadence, and verified evidence count |
| About | Purpose, values, why clients choose the firm, how impact is created | Short founder biography and principles | Add firm story, engagement model, evidence standard, client fit, values, and network/partner model |
| Motion | Carousels, dropdowns, film, progressive content, hover/focus behavior | Mostly static grids and scroll sections | Add purposeful transitions, featured-story rail, mega-menu motion, filters, and scroll state—without ornamental animation |
| Search/discovery | Global search, filters, cross-linking, categories, experts, capabilities, industries | Manual navigation and three-item lists | Create structured content objects, global search overlay, tags, filters, related content, and breadcrumbs |
| Footer/trust | Deep navigation, social, legal/privacy/accessibility, email preferences | Small three-column footer | Add a full sitemap footer plus privacy, terms, accessibility, attribution, social, and contact routes |
| Conversion | Contextual Get in touch and expert routes throughout | Repeated generic contact CTA | Use context-specific CTAs: discuss an operating decision, use a tool, read related work, contact Ryan |
| Technical system | Mature content platform with reusable listing and taxonomy patterns | 36 TSX files plus 915 CSS lines split across eight global stylesheets with overlapping legacy selectors | Introduce route-scoped templates and components; consolidate tokens/foundations; stop global CSS layering |

## Why the current redesign still looks unchanged

1. It changed the palette and information order but retained the same basic visual grammar: oversized headline, stacked sections, bordered cards, small uppercase labels, and repeated grids.
2. The first viewport is still a personal-consultant hero. L.E.K.'s first viewport behaves like a living editorial institution.
3. Luna Sol has insufficient media. L.E.K. uses photography as structure, not decoration.
4. The site has breadth in routes but not depth inside its expertise taxonomy. A single page with four sections does not feel like a real practice architecture.
5. The repeated serif display treatment reads more like a boutique portfolio or luxury brand than a modern strategy consultancy.
6. The site has no global search, no mega menus, no filterable content library, no related-content system, and no visible publishing cadence.
7. The current homepage founder portrait is technically flawed in production: the local 800×800 source is intact, but the served optimized asset renders its lower half as a gray block. The dark overlay turns that corruption into what appears to be a nearly solid navy panel. Bypass or repair the production image transformation and verify the actual deployed pixels.
8. Existing product dashboards use very small labels and dense global CSS, which makes them feel like prototypes instead of products.
9. A scroll-reveal state can leave case-study content extremely faint in a full-page capture. Reveal effects must enhance readable content, never control whether the content is visible.

## Target positioning

**Luna Sol Group is the founder-led operating transformation firm for consequential decisions in physical and technology-enabled operations.**

The brand experience should combine:

- L.E.K.'s institutional clarity and editorial energy;
- Palantir's operational specificity;
- Stripe's product precision;
- a transparent evidence standard that is Luna Sol's own.

The site should feel like a compact firm with a serious point of view, not a solo résumé expanded into marketing sections.

## Target visual system

### Art direction

- Default brand world: deep forest green, pine, off-white, and one electric chartreuse accent.
- Hero/background motif: large geometric planes derived from the L and S forms, implemented as lightweight CSS or static image assets—not model-drawn SVG illustrations.
- Display typography: bold contemporary sans serif, 64–78px desktop and 42–54px mobile.
- Editorial serif: used selectively for decks, pull quotes, and long-form insight pages.
- Card radius: 10–16px; no floating glass pills or excessive capsule buttons.
- Section padding: 72–96px desktop; 56–72px mobile.
- Media ratio system: 16:10 feature, 4:3 card, 4:5 expert portrait, 1:1 tool tile.
- Card behavior: image first, category/date metadata second, strong headline third. Avoid large empty spaces inside text cards.
- Visible text must not drop below 11px; product controls use 14px minimum.

### Proposed palette

- Forest 950 `#062D20`
- Forest 900 `#0A3B2B`
- Forest 800 `#10533B`
- Lime 400 `#B8E34A`
- Paper 50 `#FBFAF5`
- Mist 100 `#EEF1EA`
- Ink 950 `#101512`
- Slate 600 `#5C665F`
- Rule light `#D8DED7`

### Proposed homepage first viewport

1. Utility rail: Perspectives, Firm OS, LinkedIn, Contact.
2. Main header: large Luna Sol wordmark; Capabilities, Industries, Insights, About; Search; Get in touch.
3. Deep-green hero with geometric background.
4. Left: “Build the operating system behind the promise.” plus a 2–3 sentence deck.
5. Right: featured current insight or flagship case with a strong image, category, headline, and date.
6. Bottom rail: three additional current stories, partially visible to signal depth and scrolling.

The founder portrait is removed from the hero and used once in an expert/principal module later in the page.

## Target sitemap

### Primary navigation

- **Capabilities**
  - Performance Transformation
  - Operating Model & Scale
  - Transformation Execution
  - Digital Operations & AI
  - Operational Due Diligence / Value Creation
- **Industries**
  - Logistics & Last Mile
  - Mobility & Transportation
  - Consumer & Retail Operations
  - Investor-Backed Businesses
- **Insights**
  - All Insights
  - Operating Briefs
  - Case Studies
  - Decision Tools
  - Research & Trackers
- **About**
  - About Luna Sol
  - Ryan Miller
  - How We Work
  - Evidence Standard
  - News & Speaking

### Utility navigation

- Operations Lab
- Firm OS sign-in
- LinkedIn
- Contact
- Search

### New supporting routes

- `/search`
- `/contact`
- `/privacy`
- `/terms`
- `/accessibility`
- `/news`
- `/insights/[slug]` content template
- `/capabilities/[slug]` practice template
- `/industries/[slug]` industry template

Do not create offices, careers, alumni, or multiple-expert pages until they represent real firm capabilities. Design maturity does not require invented institutional scale.

## Page-by-page rebuild

### 1. Homepage

1. New two-tier header and mega menus.
2. L.E.K.-category dark brand hero with current featured story and supporting content rail.
3. Short brand film or 30–45 second motion manifesto using real operating artifacts and Ryan footage when available; until then, use an image-led statement block—not a generic animation.
4. “What we solve” narrative with three consequential client moments.
5. Featured case-study carousel with branded editorial thumbnails.
6. Capabilities explorer linked to dedicated pages.
7. Firm/operating record by the numbers with explicit attribution.
8. Featured decision products with real interface previews.
9. Expert module for Ryan with portrait, specialties, markets, and direct contact.
10. Latest insights rail populated from shared content data.
11. Contextual closing CTA and deep footer.

### 2. Capabilities index

- Full-bleed dark hero.
- Searchable or scannable capability directory.
- Each capability receives imagery, client trigger, outcomes, methods, related cases, related tools, and insight cards.
- Replace the current single ledger with practice landing pages.

### 3. Capability detail template

- Practice thesis.
- “When clients call us” problem statements.
- Four–six interventions.
- Tangible artifacts/deliverables.
- Selected client work.
- Relevant decision product.
- Related insights.
- Ryan's relevant operating record.
- Focused contact CTA.

### 4. Industries index and detail pages

- Image-led industry directory.
- Each detail page connects industry forces, common operating decisions, relevant capabilities, evidence-backed work, and insights.
- Use only defensible sectors. Explain depth honestly instead of suggesting universal coverage.

### 5. Insights library

- Shared content schema: title, slug, format, topics, industries, capabilities, published date, reading time, cover image, abstract, featured flag.
- Filters for format, industry, and problem.
- Search, sorting, pagination or load more.
- Initial launch target: 10–12 substantive pieces, not three.
- Recommended launch corpus:
  1. Backlog recovery planning.
  2. Cost of delay in operating queues.
  3. Validate the constraint before staffing.
  4. What an operating model actually controls.
  5. The WBR as a decision system.
  6. Compliance-by-design in regulated mobility.
  7. Guest-flow measurement beyond average wait time.
  8. Scaling dispatch without scaling failure demand.
  9. AI in operations: where human controls stay mandatory.
  10. Transformation value without invented savings.
  11. Operational diligence for investor-backed companies.
  12. How to build an implementation control office.

### 6. Case studies

- Preserve PSA, HopSkipDrive, and Maid of the Mist as separate one-page dossiers.
- Standardize hero, logo/company link, engagement metadata, public evidence status, chapter navigation, work performed, operating architecture, results/impact boundary, evidence room, and next-case rail.
- Create a branded cover image for each dossier.
- Add industry, capability, and format tags for discovery.
- Make evidence links direct and visible; never imply a testimonial.

### 7. Operations Lab

- Reposition as “Decision Tools” under Insights and as a utility-nav destination.
- Use a product directory with consistent thumbnails, maturity labels, inputs, output artifacts, and implementation boundaries.
- Product pages use a shared application shell.
- Flagship hierarchy: Executive Operations Studio and Implementation Workbench first; recovery model, constraint map, and PSA twin second.
- Replace 6–9px interface typography with production-scale type and touch targets.

### 8. About / Ryan

- Separate firm story from expert profile.
- About Luna Sol: purpose, why clients choose Luna Sol, operating principles, engagement model, evidence standard, client fit.
- Ryan profile: biography, expertise, experience timeline, selected work, publications, speaking/media, downloadable bio, LinkedIn, contact.
- Use the portrait in a 4:5 crop that excludes the blank lower half of the source image.

### 9. Contact

- Dedicated page, not only a homepage anchor.
- Two clear paths: discuss an operating decision; invite Ryan to speak/advise.
- Short initial form with progressive disclosure.
- Clear confidentiality and response expectations.

### 10. Footer and trust

- Full sitemap.
- Contact and social.
- Privacy, terms, accessibility, attribution.
- Clear company-mark ownership.
- No fake office footprint, careers program, awards, or client endorsements.

## Interaction specification

- Desktop mega menus for Capabilities, Industries, Insights, and About.
- A curated “Decision Finder” overlay triggered by the header and `⌘/Ctrl+K`. It searches decisions, capabilities, industries, cases, tools, and insights locally and groups results by decision path, proof, product, and insight.
- Featured-story carousel with visible progress and accessible previous/next controls.
- Filter chips/drawer for insights, with URL state and clear/reset actions.
- `aria-current` navigation and breadcrumbs.
- Case chapter navigation that tracks scroll position.
- Related-content rails generated from shared tags.
- Image and text transitions limited to opacity/transform and disabled with reduced motion.
- Mobile full-height menu dialog with focus trap, Escape close, and focus restoration.
- 44px minimum interactive targets; visible focus rings on light and dark surfaces.

The Decision Finder is not a claim of a large content library. It is a Luna-specific routing product that can launch immediately. Conventional full-site search and advanced library filters should wait until roughly 30–40 substantive indexed pages exist.

## Content and data architecture

Move duplicated arrays out of page components into typed content modules:

- `content/capabilities.ts`
- `content/industries.ts`
- `content/insights.ts`
- `content/cases.ts`
- `content/people.ts`
- `content/site-navigation.ts`

Every content object carries IDs, tags, related item IDs, metadata, evidence state, and image references. Homepage, indexes, mega menus, search, related-content rails, and sitemap must render from the same source.

## Technical rebuild plan

### Foundation

- Remove overlapping legacy global selectors and route presentation into scoped stylesheets or CSS modules.
- Keep one token file and one foundation file.
- Bundle real font files rather than relying on local fallbacks.
- Fix mojibake sequences such as `Â·`, `â†’`, and `â†—` in source content.
- Repair the production image pipeline or serve a pre-optimized portrait without the failing transformation; verify actual rendered pixels after deployment.
- Compress multi-megabyte social and editorial images to AVIF/WebP where supported.
- Establish reusable `EditorialCard`, `ContentRail`, `MegaMenu`, `SearchOverlay`, `CapabilityDirectory`, `InsightFilters`, `ExpertCard`, and `CaseStudyShell` components.

### Accessibility and performance

- Render final metric values server-side; avoid count-up zeros.
- Respect `prefers-reduced-motion` in CSS and client logic.
- Ensure all server-rendered content begins visible; unsupported scroll-timeline browsers must never receive hidden content.
- Restore form focus treatment.
- Fix low-contrast gold text on paper surfaces.
- Remove misleading focusable story cards.
- Reduce JavaScript on public editorial pages; hydrate only filters, menus, carousels, and tools.
- Target Lighthouse: Performance 90+, Accessibility 95+, Best Practices 95+, SEO 95+ on homepage and templates.
- Target LCP under 2.5 seconds on representative mobile; CLS below 0.1.

### Interaction acceptance details

- Mega-menu triggers are buttons with `aria-expanded` and `aria-controls`; Escape closes and restores focus; normal Tab order is preserved.
- The Decision Finder uses a native dialog, moves focus into its input, returns focus to its opener, supports Up/Down/Enter/Home/End, and never transmits or stores the query.
- The mobile navigation dialog exposes its state, closes on route selection, traps focus, and provides a 44px minimum target.
- Noninteractive case-story articles are removed from the Tab sequence. Any selectable sequence is rebuilt as real tabs.
- Metrics render their final values in the initial HTML; JavaScript never begins at zero or ignores reduced-motion preferences.
- HopSkipDrive's map exposes each market once in the keyboard order, with 44px mobile targets and a non-color selected state.
- Filters write state to the URL, restore correctly with Back/Forward, announce only a concise result count, and never move focus unexpectedly.

## Delivery phases

### Phase 0 — content and truth audit

- Inventory every claim, artifact, logo, source, image, and unpublished project.
- Assign evidence class: public source, client-authorized, personal operating record, reconstructed artifact, working product.
- Approve the five capabilities and four industries.

### Phase 1 — north-star system

- Build three approved frames: homepage first viewport, insights library, case-study opening.
- Finalize logo/wordmark, type, palette, grid, media ratios, buttons, cards, and motion.
- No full-site rollout until these frames look convincingly institutional.

### Phase 2 — architecture and shared components

- Implement two-tier header, mega menus, footer, search, typed content schema, shared editorial card, and route templates.

### Phase 3 — public front door

- Rebuild homepage, capabilities index/detail, industries index/detail, insights index, about, Ryan profile, and contact.

### Phase 4 — evidence and product integration

- Apply the shared case shell to all three engagements.
- Apply the shared application shell to the flagship tools.
- Add tag-based related content and evidence states.

### Phase 5 — editorial depth

- Publish 10–12 launch insights with cover imagery.
- Add news/speaking and the first recurring research/tracker format.

### Phase 6 — red-team and launch

- Side-by-side design review at 1440, 1024, 768, and 390px.
- Keyboard, contrast, reduced-motion, forms, navigation, search, filters, and error-state QA.
- Production image and font verification.
- Performance budgets and metadata review.
- Deploy only after the new first viewport is visibly and structurally distinct from the current one.

## Acceptance criteria

The redesign is not ready unless all are true:

1. A blind reviewer identifies Luna Sol as a consulting firm, not a personal portfolio, from the first viewport.
2. The first viewport contains a firm thesis and current intellectual property—not a founder portrait.
3. Capabilities, industries, insights, and about open coherent discovery systems, not single-page lists.
4. Every case study is separately navigable, evidence-bounded, and visually consistent.
5. Ryan's expertise is prominent without making the entire site a résumé.
6. The insight library can filter/search a double-digit body of useful content.
7. The Operations Lab feels like a production product family, not a set of demos.
8. Mobile navigation, filters, carousels, forms, and tool controls are keyboard and touch accessible.
9. No institutional scale, office footprint, awards, testimonials, or client claims are fabricated.
10. Side-by-side screenshots show a categorical difference from the current public design.

## Priority backlog

### P0 — immediately visible

- New wordmark and deep-green brand world.
- New editorial hero and featured story rail.
- Fix portrait/media rendering.
- Sans-led type system and denser spacing.
- Two-tier navigation, mega menus, and search.
- Homepage case-study and insights carousels with real imagery.
- Cut the desktop homepage toward 5,500–6,500px and mobile below 8,000px.
- Remove all hidden-by-default reveal states and repair the live portrait rendering.

### P1 — establishes authority

- Dedicated capability and industry templates.
- Filterable insights library with 10–12 pieces.
- Ryan expert profile and firm about page.
- Full footer and trust pages.
- Shared content model and related-content system.
- Four dedicated capability pages and four defensible industry pages.
- Split `/about` into a firm page and `/about/ryan-miller` expert profile.
- Correct the sitemap so every public canonical route, including `/industries`, is indexed.

### P2 — differentiation

- Shared decision-product shell.
- Recurring tracker/research format.
- News/speaking library.
- Optional short brand film using real footage/artifacts.

## What not to copy from L.E.K.

- Do not claim global offices, hundreds of experts, careers infrastructure, or transaction volume Luna Sol does not possess.
- Do not reproduce L.E.K.'s logo, exact geometric motif, copy, photography, or layouts.
- Do not bury Luna Sol's evidence rooms and working products beneath generic corporate language.
- Do not add content solely to simulate scale. Every page must prove expertise, help a visitor make a decision, or create a credible next action.
