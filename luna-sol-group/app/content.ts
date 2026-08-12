export const primaryNav = [
  { href: "/capabilities", label: "Capabilities" },
  { href: "/industries", label: "Industries" },
  { href: "/work", label: "Case studies" },
  { href: "/insights", label: "Insights" },
  { href: "/tools", label: "Operations Lab" },
  { href: "/about", label: "About" },
];

export const megaNavigation = [
  {
    id: "capabilities",
    label: "Capabilities",
    eyebrow: "How Luna Sol helps",
    title: "Turn an operating decision into a system that holds.",
    overview: { href: "/capabilities", label: "View all capabilities" },
    items: [
      { href: "/capabilities/performance-transformation", label: "Performance transformation", description: "Stabilize service, cost, quality, capacity, and throughput." },
      { href: "/capabilities/operating-model-and-scale", label: "Operating model and scale", description: "Align work, decision rights, governance, and control." },
      { href: "/capabilities/transformation-execution", label: "Transformation execution", description: "Move a portfolio through accountable gates to realized value." },
      { href: "/capabilities/digital-operations", label: "Digital operations", description: "Translate operating requirements into practical decision products." },
    ],
    proof: {
      eyebrow: "Featured proof",
      title: "PSA backlog stabilization",
      description: "An evidence-aware view of constraint, recovery mechanics, and operating governance.",
      href: "/work/psa",
      linkLabel: "Open the case study",
    },
  },
  {
    id: "industries",
    label: "Industries",
    eyebrow: "Where the work is grounded",
    title: "Operator depth where execution is the customer promise.",
    overview: { href: "/industries", label: "View industry experience" },
    items: [
      { href: "/industries/logistics-and-last-mile", label: "Logistics and last mile", description: "Network flow, service, capacity, and unit economics." },
      { href: "/industries/mobility-and-transportation", label: "Mobility and transportation", description: "Dispatch, compliance, safety, and multi-market control." },
      { href: "/industries/consumer-and-retail", label: "Consumer and retail", description: "Labor, inventory, physical flow, and customer experience." },
      { href: "/industries/investor-backed-businesses", label: "Investor-backed businesses", description: "Value-creation architecture, execution, and benefits control." },
    ],
    proof: {
      eyebrow: "Selected record",
      title: "Three evidence-bounded case studies",
      description: "PSA, HopSkipDrive, and Maid of the Mist—each with the personal scope separated from public context.",
      href: "/work",
      linkLabel: "Explore featured work",
    },
  },
  {
    id: "insights",
    label: "Insights",
    eyebrow: "Decision briefs",
    title: "Practical operating logic, exposed for inspection.",
    overview: { href: "/insights", label: "View all insights" },
    items: [
      { href: "/insights/backlog-recovery-planning", label: "Backlog recovery planning", description: "Model the path from a visible queue to sustainable control." },
      { href: "/insights/cost-of-delay-operating-queues", label: "The cost of delay in operating queues", description: "Make the economic consequence of waiting explicit." },
      { href: "/insights/validate-constraints-before-staffing", label: "Validate constraints before staffing", description: "Test the mechanism before committing more labor." },
      { href: "/approach", label: "The Luna OS decision system", description: "See how evidence moves from truth to control." },
    ],
    proof: {
      eyebrow: "Interactive products",
      title: "Operations Lab",
      description: "Transparent, browser-based tools for diagnosis, scenario design, and implementation planning.",
      href: "/tools",
      linkLabel: "Enter the Operations Lab",
    },
  },
] as const;

export const utilityNavigation = [
  { href: "/tools", label: "Operations Lab", external: false },
  { href: "/ops", label: "Firm OS", external: false },
  { href: "https://www.linkedin.com/in/ryan-miller-90b1181aa/", label: "LinkedIn", external: true },
] as const;

export const decisionFinderIndex = [
  { href: "/capabilities/performance-transformation", title: "Stabilize performance", description: "Resolve the constraint behind service, cost, quality, capacity, or throughput.", type: "Capability", keywords: "performance backlog capacity service quality throughput cost recovery" },
  { href: "/capabilities/operating-model-and-scale", title: "Design an operating model", description: "Align work, decision rights, SOPs, governance, and scalable control.", type: "Capability", keywords: "operating model scale governance raci sop decision rights" },
  { href: "/capabilities/transformation-execution", title: "Control a transformation", description: "Create accountable gates for portfolio movement, risk, readiness, and value.", type: "Capability", keywords: "transformation execution pmo portfolio risk implementation benefits" },
  { href: "/capabilities/digital-operations", title: "Build digital operations", description: "Turn operating requirements into decision products and enabled workflows.", type: "Capability", keywords: "digital technology ai workflow dashboard control tower requirements" },
  { href: "/industries/logistics-and-last-mile", title: "Navigate logistics and last-mile complexity", description: "Connect network flow, service, capacity, partners, and unit economics.", type: "Industry", keywords: "logistics last mile network delivery partner capacity" },
  { href: "/industries/mobility-and-transportation", title: "Scale mobility and transportation", description: "Coordinate dispatch, safety, compliance, and multi-market control.", type: "Industry", keywords: "mobility transportation dispatch safety compliance regulated" },
  { href: "/industries/consumer-and-retail", title: "Improve consumer and retail operations", description: "Align labor, demand, physical flow, inventory, and customer experience.", type: "Industry", keywords: "consumer retail labor inventory guest customer flow" },
  { href: "/industries/investor-backed-businesses", title: "Operationalize an investment thesis", description: "Translate value creation into executable mechanisms and benefits control.", type: "Industry", keywords: "investor private equity value creation diligence benefits" },
  { href: "/tools/constraint-diagnostic", title: "Find the likely constraint", description: "Rank competing operating hypotheses and identify the next test.", type: "Decision tool", keywords: "constraint root cause hypothesis diagnostic triage" },
  { href: "/tools/backlog-recovery-calculator", title: "Model backlog recovery", description: "Compare demand, capacity, quality loss, surge options, and recovery timing.", type: "Decision tool", keywords: "backlog queue capacity recovery calculator staffing demand" },
  { href: "/tools/executive-operations-studio", title: "Frame an executive operating decision", description: "Structure the decision, value at stake, evidence, and action path.", type: "Decision product", keywords: "executive decision value operations studio brief" },
  { href: "/tools/implementation-workbench", title: "Build an implementation path", description: "Turn a decision into workstreams, owners, gates, and operating controls.", type: "Decision product", keywords: "implementation roadmap owner workstream milestone governance" },
  { href: "/diagnostic", title: "Inspect the PSA recovery model", description: "Explore the public backlog arc through adjustable recovery mechanics.", type: "Case model", keywords: "psa digital twin backlog recovery public evidence" },
  { href: "/work/psa", title: "PSA case study", description: "Backlog stabilization and operating roadmap during a public surge.", type: "Case study", keywords: "psa grading backlog logistics capacity" },
  { href: "/work/hopskipdrive", title: "HopSkipDrive case study", description: "Operating architecture for regulated, multi-market transportation.", type: "Case study", keywords: "hopskipdrive mobility dispatch transportation compliance safety" },
  { href: "/work/maid-of-the-mist", title: "Maid of the Mist case study", description: "Guest-flow assessment and public planning capability context.", type: "Case study", keywords: "maid mist guest flow consumer queue tourism" },
  { href: "/experience/amazon", title: "Amazon operating experience", description: "A separate record of enterprise operations leadership experience.", type: "Experience", keywords: "amazon logistics last mile operations leadership" },
  { href: "/approach", title: "Understand the Luna OS method", description: "Follow the operating thread from truth and constraint to adoption and control.", type: "Approach", keywords: "luna os method evidence sourced governance control" },
  { href: "/about", title: "Meet the principal", description: "Review Ryan Miller's operator-led consulting perspective and record.", type: "Firm", keywords: "ryan miller principal founder bio experience" },
] as const;

export const footerNavigation = {
  explore: [
    { href: "/capabilities", label: "Capabilities" },
    { href: "/industries", label: "Industries" },
    { href: "/work", label: "Case studies" },
    { href: "/insights", label: "Insights" },
    { href: "/about", label: "Principal" },
  ],
  lab: [
    { href: "/tools/executive-operations-studio", label: "Executive Operations Studio" },
    { href: "/tools/implementation-workbench", label: "Implementation Workbench" },
    { href: "/tools/backlog-recovery-calculator", label: "Backlog Recovery Model" },
    { href: "/tools/constraint-diagnostic", label: "Constraint Hypothesis Map" },
  ],
  trust: [
    { href: "/approach", label: "Evidence standard" },
    { href: "/privacy", label: "Privacy" },
    { href: "/accessibility", label: "Accessibility" },
    { href: "/terms", label: "Terms of use" },
    { href: "/ops", label: "Firm OS sign-in" },
  ],
} as const;

export const psaSources = [
  {
    type: "Primary source",
    date: "May 28, 2026",
    title: "PSA service-level update",
    description: "The official pause notice: a 20% submission spike, 1.6 million incremental cards, and the operating threshold for reopening Value tiers.",
    href: "https://www.psacard.com/articles/articleview/15210/service-level-update-may-2026",
  },
  {
    type: "Primary source · Live",
    date: "Updated bi-weekly",
    title: "PSA backlog tracker",
    description: "PSA's management-reviewed backlog, throughput, quality, and capacity updates. The site checks this source for the latest published backlog.",
    href: "https://www.psacard.com/info/backlog-tracker",
  },
  {
    type: "Independent coverage",
    date: "May 28, 2026",
    title: "Sports Illustrated: grading pause confirmed",
    description: "Contemporaneous coverage of the Value-tier suspension and the queue approaching 10 million cards.",
    href: "https://www.si.com/collectibles/major-hobby-news-psa-confirms-extended-grading-pause",
  },
  {
    type: "Independent coverage",
    date: "July 13, 2026",
    title: "Athlon: from 14 million toward recovery",
    description: "A reconstruction of the surge from the June peak and the subsequent decline reported by the official tracker.",
    href: "https://athlonsports.com/collectibles/psa-grading-backlog-2026-current-status",
  },
  {
    type: "Market context",
    date: "Updated July 8, 2026",
    title: "CardGrade: implications of the Value-tier pause",
    description: "Independent context on tier availability, submission economics, and the collector decision created by the pause.",
    href: "https://cardgrade.io/blog/psa-value-tiers-paused-2026",
  },
  {
    type: "Independent update",
    date: "July 15, 2026",
    title: "Sports Illustrated: 11 million still backlogged",
    description: "Coverage of PSA's July 14 update, including the 11 million backlog and June output exceeding May by 10%.",
    href: "https://www.si.com/collectibles/psa-bi-weekly-update-shows-11-million-cards-still-backlogged",
  },
  {
    type: "Syndicated coverage",
    date: "July 13, 2026",
    title: "AOL: backlog drops from 14 to 12 million",
    description: "Syndicated Athlon reporting that records the earlier 12 million recovery checkpoint in the operating arc.",
    href: "https://www.aol.com/articles/psa-grading-backlog-drops-14-155205000.html",
  },
  {
    type: "External analysis",
    date: "July 4, 2026",
    title: "The Report Card: the shadow-queue risk",
    description: "An outside view of latent demand and why the visible queue alone does not determine when Value tiers can sustainably reopen.",
    href: "https://the-report-card.com/blog/psa-backlog-shadow-queue-2026",
  },
  {
    type: "Independent market data",
    date: "July 1, 2026",
    title: "GemRate: June 2026 grading recap",
    description: "Independent market reporting that PSA graded 2.50 million cards in June, up 21% month over month and 74% year over year.",
    href: "https://www.gemrate.com/june-2026-recap",
  },
];

export const psaTimeline = [
  { date: "May 14", title: "Pricing and capacity signal", detail: "PSA announced a $200 million infrastructure commitment and updated service expectations." },
  { date: "May 28", title: "Pause announced", detail: "A 20% demand spike added 1.6 million cards; Value tiers were scheduled to pause." },
  { date: "June 2", title: "Intake control activated", detail: "Four Value tiers closed to new submissions so throughput could attack the active queue." },
  { date: "Mid-June", title: "Queue peaks near 14 million", detail: "A pre-pause influx pushed the active backlog materially above the initial estimate." },
  { date: "June 30", title: "Recovery becomes visible", detail: "PSA reported approximately 12 million units and a downward trend." },
  { date: "July 14", title: "11 million checkpoint", detail: "Output accelerated while PSA reported a 99.4% operational success rate." },
];
