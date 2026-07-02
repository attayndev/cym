import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { Body, Button, Card, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { buildVCard } from '@/lib/vcard';

/**
 * The public QR landing page (web). Anyone who scans a share QR lands here:
 * they see the sharer's card, can download it as a vCard, and can share their
 * own details back — which drops into the sharer's exchange inbox in the app.
 */

interface SharedCard {
  name: string;
  tagline?: string | null;
  role?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; card: SharedCard };

function functionUrl(): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return base ? `${base}/functions/v1/share-card` : null;
}

export default function ShareLandingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = functionUrl();
    if (!url || !token) {
      setState({ kind: 'unavailable' });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${url}?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'notFound' });
          return;
        }
        const card = (await res.json()) as SharedCard;
        if (!cancelled) setState({ kind: 'ready', card });
      } catch {
        if (!cancelled) setState({ kind: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveVCard = (card: SharedCard) => {
    if (Platform.OS !== 'web') return;
    const vcf = buildVCard({
      name: card.name,
      role: card.role ?? undefined,
      company: card.company ?? undefined,
      email: card.email ?? undefined,
      phone: card.phone ?? undefined,
    });
    const blob = new Blob([vcf], { type: 'text/vcard' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${card.name.replace(/\s+/g, '-') || 'contact'}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const submit = async () => {
    const url = functionUrl();
    if (!url || !token || !form.firstName.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) setSubmitted(true);
      else setSubmitError(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </Screen>
    );
  }

  if (state.kind !== 'ready') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Eyebrow>{t('share.brand')}</Eyebrow>
          <Body muted>
            {state.kind === 'notFound' ? t('share.notFound') : t('share.unavailable')}
          </Body>
        </View>
      </Screen>
    );
  }

  const { card } = state;

  return (
    <Screen>
      <Eyebrow>{t('share.brand')}</Eyebrow>

      <View style={styles.card}>
        <Text style={styles.cardName}>{card.name}</Text>
        {(card.role || card.company) && (
          <Text style={styles.cardRole}>
            {[card.role, card.company].filter(Boolean).join(' · ')}
          </Text>
        )}
        {card.tagline ? <Text style={styles.cardTagline}>{card.tagline}</Text> : null}
        {card.email ? <Text style={styles.cardMeta}>{card.email}</Text> : null}
        {card.phone ? <Text style={styles.cardMeta}>{card.phone}</Text> : null}
      </View>

      {Platform.OS === 'web' && (
        <Button title={t('share.save', { name: card.name })} onPress={() => saveVCard(card)} />
      )}

      {submitted ? (
        <Card style={{ gap: 6 }}>
          <Eyebrow>{t('share.exchange.thanksTitle')}</Eyebrow>
          <Body muted>{t('share.exchange.thanks', { name: card.name })}</Body>
        </Card>
      ) : (
        <Card style={{ gap: 10 }}>
          <Eyebrow>{t('share.exchange.title', { name: card.name })}</Eyebrow>
          <Body muted>{t('share.exchange.body')}</Body>
          <Field
            label={t('field.firstName')}
            value={form.firstName}
            onChangeText={(firstName) => setForm((f) => ({ ...f, firstName }))}
            autoCapitalize="words"
          />
          <Field
            label={t('field.lastName')}
            value={form.lastName}
            onChangeText={(lastName) => setForm((f) => ({ ...f, lastName }))}
            autoCapitalize="words"
          />
          <Field
            label={t('field.email')}
            value={form.email}
            onChangeText={(email) => setForm((f) => ({ ...f, email }))}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label={t('field.phone')}
            value={form.phone}
            onChangeText={(phone) => setForm((f) => ({ ...f, phone }))}
            keyboardType="phone-pad"
          />
          <Field
            label={t('field.company')}
            value={form.company}
            onChangeText={(company) => setForm((f) => ({ ...f, company }))}
            autoCapitalize="words"
          />
          <Field
            label={t('field.role')}
            value={form.role}
            onChangeText={(role) => setForm((f) => ({ ...f, role }))}
            autoCapitalize="words"
          />
          <Field
            label={t('share.exchange.note')}
            value={form.note}
            onChangeText={(note) => setForm((f) => ({ ...f, note }))}
            multiline
          />
          {submitError && <Body muted>{t('share.exchange.error')}</Body>}
          <Button
            title={submitting ? t('share.exchange.sending') : t('share.exchange.submit')}
            variant="accent"
            onPress={() => void submit()}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.cardText,
    textAlign: 'center',
  },
  cardRole: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.cardMuted,
    textAlign: 'center',
  },
  cardTagline: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.cardMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  cardMeta: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.cardMuted,
  },
});
