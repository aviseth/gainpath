#!/usr/bin/env node
/**
 * Account admin for an invite-only deployment (see docs/hosted.md).
 *
 *   pnpm users add <email> [--ai]       create an account; they sign in with a code
 *   pnpm users plan <email> ai|basic    whether AI is included (with AI_REQUIRES_PLAN=true)
 *   pnpm users list              every account, with plan, status and last sign-in
 *   pnpm users disable <email>   block sign-in, keep their data (e.g. lapsed payment)
 *   pnpm users enable <email>    undo disable
 *   pnpm users remove <email>    delete the account and all its synced data
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (Project Settings →
 * API keys → secret). The secret key bypasses row-level security: keep it on
 * your machine, never in the app's environment.
 */
import { createClient } from "@supabase/supabase-js";

const [command, email, ...rest] = process.argv.slice(2);
const COMMANDS = ["add", "list", "plan", "disable", "enable", "remove"];
const PLANS = { ai: true, basic: false };
if (
  !COMMANDS.includes(command) ||
  (command !== "list" && !email) ||
  (command === "plan" && !Object.hasOwn(PLANS, rest[0] ?? ""))
) {
  console.error(
    "Usage: pnpm users add <email> [--ai] | plan <email> ai|basic | list | disable|enable|remove <email>",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.admin;

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function find(email) {
  const target = email.trim().toLowerCase();
  const user = (await allUsers()).find((u) => u.email?.toLowerCase() === target);
  if (!user) throw new Error(`No account for ${email}.`);
  return user;
}

const isDisabled = (u) => Boolean(u.banned_until && new Date(u.banned_until) > new Date());

const commands = {
  async add(email) {
    const ai = rest.includes("--ai");
    const { error } = await admin.createUser({
      email: email.trim(),
      email_confirm: true,
      app_metadata: { ai },
    });
    if (error) throw error;
    const plan = ai ? "AI" : "basic";
    console.log(`Added ${email} on the ${plan} plan. They sign in from Settings with their email.`);
  },
  async plan(email) {
    const user = await find(email);
    const ai = PLANS[rest[0]];
    const { error } = await admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, ai },
    });
    if (error) throw error;
    console.log(`${email} is now on the ${ai ? "AI" : "basic"} plan.`);
  },
  async list() {
    const users = await allUsers();
    for (const u of users) {
      const last = u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : "never";
      const plan = u.app_metadata?.ai === true ? "ai" : "basic";
      const state = isDisabled(u) ? "disabled" : "active";
      console.log(`${u.email}\t${plan}\t${state}\tlast sign-in ${last}`);
    }
    console.log(`${users.length} account(s).`);
  },
  async disable(email) {
    const user = await find(email);
    // About 100 years: Supabase's way to block sign-in without deleting.
    const { error } = await admin.updateUserById(user.id, { ban_duration: "876000h" });
    if (error) throw error;
    console.log(`Disabled ${email}. Their data is kept; \`enable\` restores access.`);
  },
  async enable(email) {
    const user = await find(email);
    const { error } = await admin.updateUserById(user.id, { ban_duration: "none" });
    if (error) throw error;
    console.log(`Enabled ${email}.`);
  },
  async remove(email) {
    const user = await find(email);
    const { error } = await admin.deleteUser(user.id);
    if (error) throw error;
    console.log(`Removed ${email} and their synced data.`);
  },
};

try {
  await commands[command](email);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
