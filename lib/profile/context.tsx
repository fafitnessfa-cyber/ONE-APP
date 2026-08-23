import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '../../types';
import { supabase, supabaseConfigError } from '../supabase';
import {
  getAuthSession,
  refreshProfileForSession,
  signOutCurrentUser,
} from './profile';

export type AuthProfileStatus =
  | 'loading'
  | 'signed_out'
  | 'profile_loading'
  | 'needs_onboarding'
  | 'ready'
  | 'error';

interface AuthProfileContextValue {
  status: AuthProfileStatus;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  error: string | null;
  isAnonymous: boolean;
  refreshProfile: () => Promise<void>;
  applyProfile: (profile: UserProfile | null) => void;
  signOut: () => Promise<void>;
}

const AuthProfileContext = createContext<AuthProfileContextValue | null>(null);

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('fetch')) {
      return 'Unable to reach Supabase right now. Please try again.';
    }

    return error.message;
  }

  return 'Something went wrong while loading your profile.';
}

function resolveStatusFromProfile(profile: UserProfile | null): AuthProfileStatus {
  return profile?.onboardingCompleted ? 'ready' : 'needs_onboarding';
}

export function AuthProfileProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<AuthProfileStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncSessionState = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setProfile(null);
      setError(null);
      setStatus('signed_out');
      return;
    }

    setStatus('profile_loading');

    try {
      const nextProfile = await refreshProfileForSession(nextSession);
      setProfile(nextProfile);
      setError(null);
      setStatus(resolveStatusFromProfile(nextProfile));
    } catch (nextError) {
      console.error('Profile bootstrap failed', nextError);
      setError(getFriendlyErrorMessage(nextError));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;

    if (!supabase) {
      setError(supabaseConfigError ?? 'Supabase is not configured.');
      setStatus('error');
      return () => {
        isDisposed = true;
      };
    }

    void (async () => {
      try {
        const currentSession = await getAuthSession();

        if (!isDisposed) {
          await syncSessionState(currentSession);
        }
      } catch (nextError) {
        if (!isDisposed) {
          console.error('Session bootstrap failed', nextError);
          setError(getFriendlyErrorMessage(nextError));
          setStatus('error');
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      startTransition(() => {
        void syncSessionState(nextSession);
      });
    });

    return () => {
      isDisposed = true;
      subscription.unsubscribe();
    };
  }, [syncSessionState]);

  const refreshProfile = useCallback(async () => {
    const currentSession = session ?? (await getAuthSession());
    await syncSessionState(currentSession);
  }, [session, syncSessionState]);

  const applyProfile = useCallback((nextProfile: UserProfile | null) => {
    setProfile(nextProfile);
    setError(null);
    setStatus(resolveStatusFromProfile(nextProfile));
  }, []);

  const signOut = useCallback(async () => {
    await signOutCurrentUser();
  }, []);

  const value = useMemo<AuthProfileContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile,
      error,
      isAnonymous: Boolean(session?.user?.is_anonymous),
      refreshProfile,
      applyProfile,
      signOut,
    }),
    [applyProfile, error, profile, refreshProfile, session, signOut, status],
  );

  return (
    <AuthProfileContext.Provider value={value}>
      {children}
    </AuthProfileContext.Provider>
  );
}

export function useAuthProfile() {
  const context = useContext(AuthProfileContext);

  if (!context) {
    throw new Error('useAuthProfile must be used inside AuthProfileProvider.');
  }

  return context;
}
