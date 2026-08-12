export type EvidenceBasis = "completed advisory work" | "prior operating experience" | "firm method";

export type RelatedItem = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  evidenceBasis: EvidenceBasis;
};

export type Capability = {
  slug: string;
  index: string;
  title: string;
  promise: string;
  overview: string;
  questions: string[];
  modules: Array<{ title: string; description: string; outputs: string[] }>;
  decisions: string[];
  evidenceNote: string;
  related: RelatedItem[];
};

export type Industry = {
  slug: string;
  index: string;
  title: string;
  promise: string;
  overview: string;
  pressures: Array<{ title: string; description: string }>;
  relevantWork: string[];
  boundary: string;
  related: RelatedItem[];
};

export const capabilities: Capability[] = [
  {
    slug: "performance-transformation",
    index: "01",
    title: "Performance transformation",
    promise: "Resolve the operating mechanism behind unstable service, cost, quality, or throughput.",
    overview: "Luna Sol separates the visible symptom from the binding constraint, then connects the fact base to a sequenced recovery system. The work is designed for leaders who need an intervention that operators can run, not another list of initiatives.",
    questions: [
      "Which mechanism is actually limiting flow or service?",
      "What is the economic cost of delay, rework, and queue growth?",
      "Which countermeasure can be tested without destabilizing the operation?",
      "What controls show whether recovery is durable?",
    ],
    modules: [
      { title: "Operating truth", description: "Reconcile reported performance with workflow, queue, quality, and frontline evidence.", outputs: ["Current-state fact base", "Metric reconciliation", "Evidence gaps"] },
      { title: "Constraint and economics", description: "Form a falsifiable constraint hypothesis and quantify the consequence of leaving it unresolved.", outputs: ["Constraint tree", "Value-at-stake model", "Test plan"] },
      { title: "Recovery architecture", description: "Sequence countermeasures, capacity decisions, owners, and governance into an executable path.", outputs: ["Recovery roadmap", "Capacity and flow model", "Control cadence"] },
    ],
    decisions: ["What changes first", "What capacity is truly required", "Which risks must be controlled", "How leadership will verify recovery"],
    evidenceNote: "The PSA case demonstrates this problem class through completed advisory work and separately labeled public operating evidence. Public outcomes are not presented as solely attributable to Luna Sol.",
    related: [
      { eyebrow: "Case study", title: "PSA backlog stabilization", description: "A recovery operating system built during a record grading backlog.", href: "/work/psa", evidenceBasis: "completed advisory work" },
      { eyebrow: "Decision product", title: "Backlog Recovery Model", description: "Model the capacity, variability, and timing behind a recovery commitment.", href: "/tools/backlog-recovery-calculator", evidenceBasis: "firm method" },
      { eyebrow: "Operating brief", title: "Validate constraints before staffing", description: "A practical sequence for testing the mechanism before adding resources.", href: "/insights/validate-constraints-before-staffing", evidenceBasis: "firm method" },
    ],
  },
  {
    slug: "operating-model-and-scale",
    index: "02",
    title: "Operating model and scale",
    promise: "Build the workflows, accountabilities, and controls required to carry growth safely.",
    overview: "Growth exposes ambiguity. Luna Sol converts that ambiguity into a target operating model: how work moves, where decisions sit, how risk is controlled, and which technical requirements enable the model without hiding accountability.",
    questions: [
      "Where do handoffs and decision rights break under scale?",
      "Which controls must be designed into the workflow?",
      "How should dispatch, compliance, service, and leadership interact?",
      "What must technology support, automate, or make visible?",
    ],
    modules: [
      { title: "Current-state architecture", description: "Map work, decisions, interfaces, risk points, and management routines as they operate today.", outputs: ["Operating assessment", "Workflow map", "Control-gap register"] },
      { title: "Target operating model", description: "Design accountable workflows, governance, roles, and escalation paths for the next stage.", outputs: ["Target model", "Decision-rights matrix", "SOP architecture"] },
      { title: "Requirements and transition", description: "Translate the model into technical requirements, implementation waves, and knowledge transfer.", outputs: ["Requirements backlog", "Implementation roadmap", "Transition plan"] },
    ],
    decisions: ["What the future operating model must do", "Who owns each consequential decision", "Which controls are mandatory", "How the organization transitions without service loss"],
    evidenceNote: "The HopSkipDrive case describes completed consulting scope. Company announcements provide industry context and are labeled separately from Ryan Miller's contribution.",
    related: [
      { eyebrow: "Case study", title: "HopSkipDrive operating foundation", description: "Dispatch, compliance, governance, SOP, and technical architecture for multi-market scale.", href: "/work/hopskipdrive", evidenceBasis: "completed advisory work" },
      { eyebrow: "Capability", title: "Digital operations", description: "Convert operating requirements into practical workflows and decision products.", href: "/capabilities/digital-operations", evidenceBasis: "firm method" },
      { eyebrow: "Decision product", title: "Implementation Workbench", description: "Structure readiness, ownership, risk, and launch control.", href: "/tools/implementation-workbench", evidenceBasis: "firm method" },
    ],
  },
  {
    slug: "transformation-execution",
    index: "03",
    title: "Transformation execution",
    promise: "Turn an approved strategy into sequenced work, accountable decisions, and verified operating value.",
    overview: "Luna Sol installs a transformation control system that distinguishes activity from movement. It connects workstreams, dependencies, decision gates, risk, and benefits so executives can intervene before milestones become misses.",
    questions: [
      "Which initiatives actually move the operating outcome?",
      "Where are dependencies and decision bottlenecks accumulating?",
      "What evidence is required to pass each readiness gate?",
      "How will benefits be measured without double counting?",
    ],
    modules: [
      { title: "Portfolio architecture", description: "Convert the strategy into a coherent portfolio with outcomes, owners, dependencies, and decision gates.", outputs: ["Transformation charter", "Integrated roadmap", "Dependency map"] },
      { title: "Control office", description: "Create the cadence, escalation logic, and decision materials required to keep the portfolio moving.", outputs: ["WBR system", "Decision log", "Risk and issue control"] },
      { title: "Benefits and adoption", description: "Tie operating evidence and adoption signals to the value the transformation was approved to create.", outputs: ["Benefits register", "Adoption measures", "Sustainment plan"] },
    ],
    decisions: ["What belongs in the transformation", "Where executive intervention is required", "Whether a gate is genuinely ready", "Whether operating value has been realized"],
    evidenceNote: "This capability reflects Luna Sol's firm method and Ryan Miller's prior transformation operating experience. Prior-employer outcomes are not represented as Luna Sol client results.",
    related: [
      { eyebrow: "Decision product", title: "Executive Operations Studio", description: "Bring portfolio health, decisions, capacity, and cadence into one control surface.", href: "/tools/executive-operations-studio", evidenceBasis: "firm method" },
      { eyebrow: "Prior experience", title: "Amazon operating retrospective", description: "Selected prior operating experience, clearly separated from Luna Sol client work.", href: "/experience/amazon", evidenceBasis: "prior operating experience" },
      { eyebrow: "Approach", title: "The Luna Sol decision system", description: "How operating truth moves through architecture, adoption, and control.", href: "/approach", evidenceBasis: "firm method" },
    ],
  },
  {
    slug: "digital-operations",
    index: "04",
    title: "Digital operations",
    promise: "Translate operating mechanisms into technology-enabled workflows and decision products.",
    overview: "Technology creates leverage when it clarifies the decision, reduces preventable effort, and strengthens control. Luna Sol begins with the operating requirement, exposes assumptions, and keeps human accountability visible in every design.",
    questions: [
      "Which decision or workflow should the product improve?",
      "What data, timing, and control conditions must be trustworthy?",
      "Where is automation appropriate, and where must a human remain accountable?",
      "How will the organization know whether the product changed operating behavior?",
    ],
    modules: [
      { title: "Decision and workflow design", description: "Define the user, decision, evidence, handoff, and failure state before selecting a technical solution.", outputs: ["Decision architecture", "Service blueprint", "Control requirements"] },
      { title: "Product requirements", description: "Translate operating needs into testable data, product, integration, and governance requirements.", outputs: ["Requirements specification", "Prioritized backlog", "Acceptance criteria"] },
      { title: "Adoption and control", description: "Instrument the workflow, define human overrides, and establish the operating cadence around the product.", outputs: ["Adoption plan", "Control model", "Performance measures"] },
    ],
    decisions: ["What to digitize", "What not to automate", "Which data is decision-grade", "How product value will be verified"],
    evidenceNote: "The Operations Lab demonstrates Luna Sol methods in transparent browser-based products. These tools structure decisions; they do not replace direct observation, client data, or executive judgment.",
    related: [
      { eyebrow: "Operations Lab", title: "Explore the decision products", description: "Transparent instruments for constraint, recovery, implementation, and executive control.", href: "/tools", evidenceBasis: "firm method" },
      { eyebrow: "Case study", title: "Maid of the Mist planning capability", description: "An operational assessment connected to a bounded, publicly corroborated planning enhancement.", href: "/work/maid-of-the-mist", evidenceBasis: "completed advisory work" },
      { eyebrow: "Capability", title: "Operating model and scale", description: "Start with the work, controls, and decision rights the technology must support.", href: "/capabilities/operating-model-and-scale", evidenceBasis: "firm method" },
    ],
  },
];

export const industries: Industry[] = [
  {
    slug: "logistics-and-last-mile",
    index: "01",
    title: "Logistics and last mile",
    promise: "Control service, capacity, and economics across a network that never stands still.",
    overview: "Logistics performance is produced by a system of demand, capacity, routing, partner behavior, quality, and local execution. Luna Sol works at the interfaces where those mechanisms stop agreeing.",
    pressures: [
      { title: "Demand and capacity mismatch", description: "Queues, backlogs, and service misses can reflect multiple constraints. The first task is to identify the binding one." },
      { title: "Network variability", description: "Local conditions, partner capacity, and operating exceptions require a management system that distinguishes signal from noise." },
      { title: "Unit economics", description: "Recovery is incomplete when service improves by adding uncontrolled cost or shifting loss elsewhere in the network." },
      { title: "Frontline adoption", description: "A network design holds only when its decision rights, mechanisms, and escalation paths work at the operating edge." },
    ],
    relevantWork: ["Backlog and capacity recovery", "Network operating model", "Delivery-partner architecture", "Service and cost control"],
    boundary: "This focus area is supported by completed PSA advisory work and Ryan Miller's prior Amazon operating experience. Those evidence bases are labeled separately throughout the site.",
    related: [
      { eyebrow: "Case study", title: "PSA backlog stabilization", description: "Constraint, countermeasure, capacity, and governance work during a public recovery arc.", href: "/work/psa", evidenceBasis: "completed advisory work" },
      { eyebrow: "Prior experience", title: "Amazon last-mile retrospective", description: "Selected prior operating experience, not a Luna Sol engagement.", href: "/experience/amazon", evidenceBasis: "prior operating experience" },
      { eyebrow: "Decision product", title: "Backlog Recovery Model", description: "Test demand, capacity, quality loss, timing, and recovery margin.", href: "/tools/backlog-recovery-calculator", evidenceBasis: "firm method" },
    ],
  },
  {
    slug: "mobility-and-transportation",
    index: "02",
    title: "Mobility and transportation",
    promise: "Scale a regulated service without separating dispatch, safety, compliance, and customer promise.",
    overview: "Transportation operating models coordinate people, time, geography, regulation, and exceptions. When those systems are designed independently, the failure appears at the rider, driver, dispatcher, or customer interface.",
    pressures: [
      { title: "Dispatch complexity", description: "Coverage, reliability, exceptions, and communication must operate through one accountable workflow." },
      { title: "Compliance by design", description: "Controls are strongest when embedded into ordinary work rather than inspected after the fact." },
      { title: "Incident response", description: "Escalation, evidence, ownership, and learning require a system that can function under pressure." },
      { title: "Multi-market scale", description: "The model must preserve required controls while accommodating meaningful local differences." },
    ],
    relevantWork: ["Dispatch workflows", "Compliance and incident controls", "SOP and governance architecture", "Technical requirements"],
    boundary: "This focus area is supported by completed HopSkipDrive consulting scope. Public company announcements are used only as labeled industry context, not proof of Luna Sol's contribution.",
    related: [
      { eyebrow: "Case study", title: "HopSkipDrive operating foundation", description: "An operating architecture for regulated, multi-market transportation.", href: "/work/hopskipdrive", evidenceBasis: "completed advisory work" },
      { eyebrow: "Capability", title: "Operating model and scale", description: "Design workflows, decisions, controls, and transition for the next stage.", href: "/capabilities/operating-model-and-scale", evidenceBasis: "firm method" },
      { eyebrow: "Decision product", title: "Implementation Workbench", description: "Structure launch gates, accountability, process readiness, and risk.", href: "/tools/implementation-workbench", evidenceBasis: "firm method" },
    ],
  },
  {
    slug: "consumer-and-retail",
    index: "03",
    title: "Consumer and retail",
    promise: "Improve the physical flow where labor, demand, inventory, and customer experience converge.",
    overview: "Consumer operations turn internal mechanisms into visible promises. Luna Sol focuses on the flow of people, work, information, and decisions behind the experience—not on experience language detached from operating reality.",
    pressures: [
      { title: "Demand-driven flow", description: "Variability in arrivals, mix, and dwell time requires usable planning signals and clear frontline mechanisms." },
      { title: "Labor and service", description: "Staffing decisions must connect to demand shape, productive capacity, and the service standard being protected." },
      { title: "Operational visibility", description: "Leaders need measures that reveal the mechanism, while customers need information that helps them plan." },
      { title: "Adoption at the edge", description: "Changes must fit the cadence and conditions of frontline work to produce a durable result." },
    ],
    relevantWork: ["Guest and customer flow", "Labor and capacity planning", "Operating cadence", "Experience-enabling requirements"],
    boundary: "This focus area is supported by completed Maid of the Mist advisory work and Ryan Miller's prior Walmart operating experience. Public feature announcements and prior employment are labeled separately.",
    related: [
      { eyebrow: "Case study", title: "Maid of the Mist guest-flow assessment", description: "Guest-flow evidence translated into practical operating and planning recommendations.", href: "/work/maid-of-the-mist", evidenceBasis: "completed advisory work" },
      { eyebrow: "Capability", title: "Performance transformation", description: "Diagnose the mechanism behind unstable flow, service, quality, or cost.", href: "/capabilities/performance-transformation", evidenceBasis: "firm method" },
      { eyebrow: "Approach", title: "How Luna Sol works", description: "Move from operating truth to a control the team can sustain.", href: "/approach", evidenceBasis: "firm method" },
    ],
  },
  {
    slug: "investor-backed-businesses",
    index: "04",
    title: "Investor-backed businesses",
    promise: "Translate the value-creation thesis into an operating architecture management can execute.",
    overview: "Value-creation plans often fail in the gap between the board-level ambition and the operating system available to deliver it. Luna Sol helps size that gap, sequence the intervention, and build the management control required to verify movement.",
    pressures: [
      { title: "Thesis-to-mechanism gap", description: "A financial objective must be translated into the operational changes that can credibly produce it." },
      { title: "Management bandwidth", description: "The plan must account for the organization's ability to absorb, lead, and sustain concurrent change." },
      { title: "Transformation risk", description: "Dependencies, operating disruption, and benefits uncertainty require explicit gates and controls." },
      { title: "Value verification", description: "Reported activity and booked benefit need evidence rules that withstand executive and investor scrutiny." },
    ],
    relevantWork: ["Operational assessment", "Value-creation architecture", "Transformation control", "Benefits and risk verification"],
    boundary: "This is a Luna Sol focus area and method proposition. The site does not claim a completed private-equity engagement, fund relationship, or investment outcome unless a future case is published and labeled accordingly.",
    related: [
      { eyebrow: "Capability", title: "Transformation execution", description: "Create one system for portfolio movement, risk, readiness, and realized value.", href: "/capabilities/transformation-execution", evidenceBasis: "firm method" },
      { eyebrow: "Decision product", title: "Executive Operations Studio", description: "A practical control surface for executive portfolio decisions.", href: "/tools/executive-operations-studio", evidenceBasis: "firm method" },
      { eyebrow: "About", title: "Meet the principal", description: "Understand the operating record behind Luna Sol's approach.", href: "/about/ryan-miller", evidenceBasis: "prior operating experience" },
    ],
  },
];

export function getCapability(slug: string) {
  return capabilities.find((item) => item.slug === slug);
}

export function getIndustry(slug: string) {
  return industries.find((item) => item.slug === slug);
}
