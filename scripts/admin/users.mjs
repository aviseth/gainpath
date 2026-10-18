#!/usr/bin/env node
/**
 * Account admin for an invite-only deployment (see docs/hosted.md).
 *
 *   pnpm users add <email> [--ai] [--password]
 *                                create an account; they sign in with a code, or
 *                                with the printed password if --password is given
 *   pnpm users password <email>  set a new password and print it (also resets one)
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
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [command, email, ...rest] = process.argv.slice(2);
const COMMANDS = ["add", "list", "plan", "password", "disable", "enable", "remove"];
const PLANS = { ai: true, basic: false };
if (
  !COMMANDS.includes(command) ||
  (command !== "list" && !email) ||
  (command === "plan" && !Object.hasOwn(PLANS, rest[0] ?? ""))
) {
  console.error(
    "Usage: pnpm users add <email> [--ai] [--password] | password <email> | plan <email> ai|basic | list | disable|enable|remove <email>",
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

/**
 * Easy to read out or type on a phone (no 0/o, 1/l/i), about 55 bits. Always
 * starts with a capital and has a lowercase letter, a digit and "-", so it
 * passes Supabase's strictest built-in password requirement.
 */
function newPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  for (;;) {
    const p = [group(), group(), group()].join("-");
    if (/^[a-z]/.test(p) && /[a-z]/.test(p.slice(1)) && /\d/.test(p))
      return p[0].toUpperCase() + p.slice(1);
  }
}

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
    const password = rest.includes("--password") ? newPassword() : undefined;
    const { error } = await admin.createUser({
      email: email.trim(),
      email_confirm: true,
      app_metadata: { ai },
      ...(password && { password }),
    });
    if (error) throw error;
    const plan = ai ? "AI" : "basic";
    console.log(`Added ${email} on the ${plan} plan. They sign in from Settings with their email.`);
    if (password)
      console.log(`Password: ${password}  (shown once; \`pnpm users password\` resets it)`);
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
  async password(email) {
    const user = await find(email);
    const password = newPassword();
    const { error } = await admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log(`New password for ${email}: ${password}`);
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
