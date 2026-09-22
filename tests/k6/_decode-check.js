import { decodeJwtPayload } from "./common.js";

export const options = { vus: 1, iterations: 1 };

export default function () {
  const payload = decodeJwtPayload(__ENV.AUTH_TOKEN || "");
  console.log("sub :", payload?.sub);
  console.log("aud :", payload?.aud);
  console.log("use :", payload?.token_use);
  console.log("exp :", payload?.exp, "(now:", Math.floor(Date.now() / 1000), ")");
  console.log("role:", payload?.["cognito:groups"]);
}