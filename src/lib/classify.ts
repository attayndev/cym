import type { Contact, ContactKind, DB } from '@/lib/types';

/**
 * Heuristic person/business classifier for imported contacts. Address books
 * are mostly noise (restaurants, services, "Dr. Office Old") — this pre-filter
 * keeps that noise out of the evaluate deck without costing the user a card.
 * Conservative by design: only clear signals say 'business'; a normal
 * first+last name says 'person'; everything else stays 'unclear' for the
 * AI classification pass (Stage 3) or the user.
 */

// Word-boundary matched against the full name (not the company — a person
// who WORKS at "Joe's Pizza" is still a person).
const BUSINESS_WORDS = [
  'restaurant', 'pizza', 'pizzeria', 'cafe', 'coffee', 'bakery', 'deli', 'grill',
  'salon', 'barber', 'spa', 'nails', 'tattoo',
  'shop', 'store', 'market', 'outlet', 'boutique',
  'service', 'services', 'repair', 'repairs', 'plumbing', 'plumber', 'electric',
  'electrician', 'hvac', 'locksmith', 'towing', 'moving', 'movers', 'cleaners',
  'cleaning', 'landscaping', 'pest',
  'dental', 'dentist', 'clinic', 'pharmacy', 'medical', 'urgent', 'hospital',
  'veterinary', 'vet',
  'insurance', 'bank', 'mortgage', 'realty', 'rental', 'rentals', 'leasing',
  'hotel', 'motel', 'airlines', 'taxi', 'shuttle', 'limo',
  'school', 'academy', 'daycare', 'church', 'temple', 'gym', 'fitness', 'studio',
  'office', 'front desk', 'customer', 'support', 'sales', 'billing', 'delivery',
  'auto', 'motors', 'dealership', 'tire', 'tires', 'car wash',
  'llc', 'inc', 'corp', 'ltd', 'co',
] as const;

const BUSINESS_EMAIL_LOCALS = new Set([
  'info', 'support', 'sales', 'contact', 'hello', 'office', 'admin', 'billing',
  'noreply', 'no-reply', 'donotreply', 'reservations', 'booking', 'bookings',
  'appointments', 'service', 'services', 'help', 'orders', 'team', 'frontdesk',
]);

const BUSINESS_WORD_RE = new RegExp(`\\b(${BUSINESS_WORDS.join('|')})\\b`, 'i');

export function classifyContact(
  c: Pick<Contact, 'firstName' | 'lastName' | 'company' | 'email'>,
): ContactKind {
  const fullName = `${c.firstName} ${c.lastName ?? ''}`.trim();
  const emailLocal = c.email?.split('@')[0]?.toLowerCase() ?? '';

  if (BUSINESS_EMAIL_LOCALS.has(emailLocal)) return 'business';
  if (BUSINESS_WORD_RE.test(fullName)) return 'business';

  if (!c.lastName) {
    const first = c.firstName.trim();
    // "24/7 Locksmith", "1-800 Flowers" — humans rarely have digits in names.
    if (/\d/.test(first)) return 'business';
    // Name IS the company ("Acme Heating" with company "Acme Heating").
    if (c.company && first.toLowerCase() === c.company.trim().toLowerCase()) return 'business';
    // Long single-field names read as business ("Ace Plumbing And Heating").
    if (first.split(/\s+/).length >= 3) return 'business';
    // A lone "Mike" could be anyone — leave for the AI pass / the user.
    return 'unclear';
  }

  return 'person';
}

/** True when the contact participates in decks, health, and nudges. */
export function isActiveContact(c: Contact): boolean {
  return c.status !== 'archived';
}

/**
 * Normalize a graph so every contact carries kind/status. Runs on local load
 * and after every cloud pull (legacy rows have neither). Returns the same DB
 * reference when nothing needed classification, so callers can cheaply skip
 * persistence.
 */
export function ensureClassified(db: DB): DB {
  if (db.contacts.every((c) => c.kind && c.status)) return db;
  return {
    ...db,
    contacts: db.contacts.map((c) =>
      c.kind && c.status
        ? c
        : {
            ...c,
            // Deliberately-added contacts (capture, QR) are people by
            // definition; only imports need classifying.
            kind: c.kind ?? (c.source === 'import' ? classifyContact(c) : 'person'),
            status: c.status ?? 'active',
          },
    ),
  };
}
