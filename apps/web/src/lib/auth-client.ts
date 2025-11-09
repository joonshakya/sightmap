import { SERVER_URL } from "@/utils/constnats";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
});
