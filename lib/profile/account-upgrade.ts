import type { SupabaseClient, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '../supabase';

const MIN_PASSWORD_LENGTH = 6;

type VerificationInput =
  | {
      kind: 'otp';
      value: string;
    }
  | {
      kind: 'token_hash';
      value: string;
    };

function assertSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('Enter an email address to secure this guest account.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.');
  }

  return normalizedEmail;
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  return password;
}

function normalizeVerificationInput(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function parseVerificationInput(
  value: string | null | undefined,
): VerificationInput | null {
  const normalizedValue = normalizeVerificationInput(value);

  if (!normalizedValue) {
    return null;
  }

  if (/^\d{6}$/.test(normalizedValue)) {
    return {
      kind: 'otp',
      value: normalizedValue,
    };
  }

  if (/^[a-f0-9]{32,}$/i.test(normalizedValue)) {
    return {
      kind: 'token_hash',
      value: normalizedValue,
    };
  }

  try {
    const url = new URL(normalizedValue);
    const tokenHash =
      url.searchParams.get('token') ??
      url.searchParams.get('token_hash') ??
      new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash).get(
        'token_hash',
      );

    if (tokenHash) {
      return {
        kind: 'token_hash',
        value: tokenHash,
      };
    }
  } catch {
    // Fall through to the explicit validation error below.
  }

  throw new Error(
    'Paste the 6-digit code, the raw token hash, or the full confirmation link from your email.',
  );
}

function isSameRegisteredUser(user: User | null | undefined, email: string) {
  return Boolean(
    user &&
      !user.is_anonymous &&
      user.email &&
      normalizeEmail(user.email) === normalizeEmail(email),
  );
}

function hasPendingEmailChange(user: User | null | undefined) {
  return Boolean(user?.new_email || user?.email_change_sent_at);
}

async function requireAuthenticatedUser(): Promise<{
  client: SupabaseClient;
  user: User;
}> {
  const client = assertSupabase();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    throw new Error('Sign in is required before securing this account.');
  }

  return {
    client,
    user: session.user,
  };
}

async function getLiveUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

async function refreshCurrentUser(client: SupabaseClient) {
  const { data, error } = await client.auth.refreshSession();

  if (error) {
    return null;
  }

  return data.session?.user ?? null;
}

export function hasPendingGuestUpgrade(user: User | null | undefined) {
  return hasPendingEmailChange(user);
}

export async function requestAnonymousAccountUpgrade(email: string) {
  const normalizedEmail = validateEmail(email);
  const { client, user } = await requireAuthenticatedUser();

  if (!user.is_anonymous) {
    if (isSameRegisteredUser(user, normalizedEmail)) {
      throw new Error('This account is already secured with that email.');
    }

    throw new Error('Only guest accounts can start this upgrade flow.');
  }

  const { data, error } = await client.auth.updateUser({
    email: normalizedEmail,
  });

  if (error) {
    throw error;
  }

  return {
    email: normalizedEmail,
    user: data.user ?? user,
  };
}

export async function resendAnonymousAccountUpgrade(email: string) {
  const normalizedEmail = validateEmail(email);
  const { client, user } = await requireAuthenticatedUser();

  if (!user.is_anonymous && !hasPendingEmailChange(user)) {
    throw new Error('This guest upgrade is no longer pending.');
  }

  const { error } = await client.auth.resend({
    type: 'email_change',
    email: normalizedEmail,
  });

  if (error) {
    throw error;
  }
}

export async function finalizeAnonymousAccountUpgrade({
  email,
  password,
  verificationInput,
}: {
  email: string;
  password: string;
  verificationInput?: string | null;
}) {
  const normalizedEmail = validateEmail(email);
  validatePassword(password);

  const { client, user } = await requireAuthenticatedUser();
  const parsedVerification = parseVerificationInput(verificationInput);
  let nextUser: User | null = user;

  if (parsedVerification?.kind === 'otp') {
    const { data, error } = await client.auth.verifyOtp({
      email: normalizedEmail,
      token: parsedVerification.value,
      type: 'email_change',
    });

    if (error) {
      throw error;
    }

    nextUser = data.user ?? data.session?.user ?? nextUser;
  } else if (parsedVerification?.kind === 'token_hash') {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: parsedVerification.value,
      type: 'email_change',
    });

    if (error) {
      throw error;
    }

    nextUser = data.user ?? data.session?.user ?? nextUser;
  } else {
    nextUser = (await refreshCurrentUser(client)) ?? (await getLiveUser(client));
  }

  if (!isSameRegisteredUser(nextUser, normalizedEmail)) {
    throw new Error(
      'Confirm the email change first. Paste the confirmation link or code from your email, or tap the email link before trying again.',
    );
  }

  const { data, error } = await client.auth.updateUser({
    password,
  });

  if (error) {
    throw error;
  }

  return {
    email: normalizedEmail,
    user: data.user ?? nextUser,
  };
}
