export type Category =
  | 'family'
  | 'friend'
  | 'professional'
  | 'mentor'
  | 'client'
  | 'other';

export type Importance = 1 | 2 | 3;

export type InteractionType =
  | 'met'
  | 'call'
  | 'text'
  | 'email'
  | 'coffee'
  | 'meeting';

export type InteractionSource = 'manual' | 'capture' | 'email-sync';

export type HookType = 'birthday' | 'commitment-due' | 'reconnect-anniversary' | 'role-change';

export type NudgeKind = 'hook' | 'decay';

export type NudgeState = 'pending' | 'acted' | 'dismissed' | 'snoozed';

export type Channel = 'email' | 'text';

export type Health = 'new' | 'warm' | 'cooling' | 'at-risk' | 'cold';

export interface UserProfile {
  name: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  isPro: boolean;
  notificationsEnabled: boolean;
  defaultPersonaId: string;
  /** IANA timezone, auto-reported — drives server-side notification timing. */
  timezone?: string;
}

export interface Persona {
  id: string;
  name: string;
  tagline?: string;
  /** Card overrides; fall back to the profile's role/company when unset. */
  role?: string;
  company?: string;
  /** Card overrides; fall back to the profile's name/email/phone when unset —
   *  a new persona inherits the profile's identity until explicitly saved
   *  with its own values, so Personal and Professional cards can diverge. */
  displayName?: string;
  email?: string;
  phone?: string;
  isDefault: boolean;
  updatedAt?: string;
}

/** person = a human relationship; business = noise from the address book
 *  (restaurants, services); unclear = needs classification (AI or user). */
export type ContactKind = 'person' | 'business' | 'unclear';

export interface Contact {
  id: string;
  personaId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  city?: string;
  /** MM-DD */
  birthday?: string;
  /** Additional addresses/numbers from the device card — matching a person by
   *  their second email is the difference between "New" and a real history. */
  altEmails?: string[];
  altPhones?: string[];
  /** LinkedIn handle (not URL), e.g. "steliefti". */
  linkedin?: string;
  /** Living-card subscription: the subject's share token — their own card
   *  updates flow into this contact until they rotate it. */
  cardToken?: string;
  /** Set by the store on every mutation — sync merges keep the newest row. */
  updatedAt?: string;
  category: Category;
  importance: Importance;
  cadenceDays: number;
  source: 'manual' | 'qr' | 'import';
  createdAt: string;
  /** Undefined on legacy rows — normalized to a value by ensureClassified(). */
  kind?: ContactKind;
  /** 'archived' removes the contact from decks/health/nudges — CYM-only,
   *  never touches the device address book. Undefined = active. */
  status?: 'active' | 'archived';
  /** Set when the user gives an evaluate-deck verdict (Stage 4). */
  evaluatedAt?: string;
}

export interface ContextEntry {
  id: string;
  contactId: string;
  whereMet?: string;
  discussed?: string;
  whyMatters?: string;
  commitment?: string;
  commitmentDueAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  type: InteractionType;
  occurredAt: string;
  note?: string;
  source: InteractionSource;
}

export interface Hook {
  id: string;
  contactId: string;
  type: HookType;
  /** ISO date the hook becomes relevant */
  triggerAt: string;
  label: string;
  sourceContextId?: string;
  consumedAt?: string;
}

/** A translatable string: a dictionary key plus interpolation params (which
 *  carry user data like names and notes that should not themselves be translated). */
export interface LocalizedText {
  key: string;
  params?: Record<string, string | number>;
}

export interface Nudge {
  id: string;
  contactId: string;
  hookId?: string;
  kind: NudgeKind;
  headline: LocalizedText;
  reason: LocalizedText;
  suggestedAction: LocalizedText;
  state: NudgeState;
  snoozedUntil?: string;
  createdAt: string;
  score: number;
}

export interface ConnectedAccount {
  id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSyncAt?: string;
}

export interface DB {
  profile: UserProfile;
  personas: Persona[];
  contacts: Contact[];
  contexts: ContextEntry[];
  interactions: Interaction[];
  hooks: Hook[];
  nudges: Nudge[];
  accounts: ConnectedAccount[];
  onboarded: boolean;
  seededAt?: string;
}
