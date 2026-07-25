import { getChatGPTUser, requireChatGPTUser } from "./chatgpt-auth";

export function operatorEmail() {
  return (process.env.LUNA_SOL_OPERATOR_EMAIL || "Rmiller62785@gmail.com").trim().toLowerCase();
}

export async function getOperator() {
  const user = await getChatGPTUser();
  return user && user.email.trim().toLowerCase() === operatorEmail() ? user : null;
}

export async function requireOperator(returnTo: string) {
  const user = await requireChatGPTUser(returnTo);
  return user.email.trim().toLowerCase() === operatorEmail() ? user : null;
}
