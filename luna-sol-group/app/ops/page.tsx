import type { Metadata } from "next";
import { chatGPTSignOutPath } from "../chatgpt-auth";
import { FirmOS } from "../components/FirmOS";
import { requireOperator } from "../operator-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Luna Sol Firm OS",
  description: "Private operating console for Luna Sol Group.",
  robots: { index: false, follow: false },
};

async function PrivateFirmOS() {
  const operator = await requireOperator("/ops");
  if (!operator) return <main className="ops-access-denied"><div><span>Private Luna Sol workspace</span><h1>This account is not authorized.</h1><p>Firm OS is restricted to the Luna Sol operator account. Sign out and use the authorized ChatGPT identity.</p><a href={chatGPTSignOutPath("/ops")}>Sign out and try another account</a></div></main>;
  return <FirmOS operatorName={operator.displayName} operatorEmail={operator.email} signOutHref={chatGPTSignOutPath("/")} />;
}

export default function OpsPage() {
  return <PrivateFirmOS />;
}
