import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Field } from '@/components/field';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Body, Button, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { personaCardFields } from '@/lib/personas';
import { buildShareUrl, getOrCreateShareToken, rotateShareToken, shareBaseUrl } from '@/lib/share';
import { buildVCard } from '@/lib/vcard';
import { useApp } from '@/state/app-context';
import { useAuth } from '@/state/auth-context';

export default function CardScreen() {
  const { db, activePersonaId, updateProfile, updatePersona } = useApp();
  const { session } = useAuth();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    role: '',
    company: '',
    tagline: '',
    email: '',
    phone: '',
  });
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // Signed in with a share host configured → the QR carries a token URL to the
  // landing page. Until the token arrives (or offline) it stays the vCard QR.
  const userId = session?.user?.id;
  useEffect(() => {
    let cancelled = false;
    setShareUrl(null);
    setConfirmRotate(false);
    if (!userId || !shareBaseUrl() || !activePersonaId) return;
    (async () => {
      try {
        const token = await getOrCreateShareToken(activePersonaId);
        if (!cancelled && token) setShareUrl(buildShareUrl(token));
      } catch {
        // Offline: the vCard QR still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, activePersonaId]);

  const rotate = async () => {
    if (!confirmRotate) {
      setConfirmRotate(true);
      return;
    }
    setConfirmRotate(false);
    try {
      const token = await rotateShareToken(activePersonaId);
      if (token) setShareUrl(buildShareUrl(token));
    } catch {
      // keep the current link
    }
  };

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  const { profile } = db;
  const activePersona = db.personas.find((p) => p.id === activePersonaId);
  const card = personaCardFields(activePersona, profile);

  const startEditing = () => {
    setDraft({
      name: card.name,
      role: card.role ?? '',
      company: card.company ?? '',
      tagline: card.tagline ?? '',
      email: card.email ?? '',
      phone: card.phone ?? '',
    });
    setEditing(true);
  };

  const save = () => {
    // Identity lives on the profile; the card's role/company/tagline belong to
    // the active persona so each persona can present differently.
    updateProfile({
      name: draft.name.trim() || profile.name,
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
    });
    if (activePersona) {
      updatePersona(activePersona.id, {
        role: draft.role,
        company: draft.company,
        tagline: draft.tagline,
      });
    } else {
      updateProfile({
        role: draft.role.trim() || undefined,
        company: draft.company.trim() || undefined,
      });
    }
    setEditing(false);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Display>{t('card.title')}</Display>
        <PersonaSwitcher />
      </View>
      <Body muted>{shareUrl ? t('card.share.subtitle') : t('card.subtitle')}</Body>

      <View style={styles.card}>
        <Text style={styles.cardName}>{card.name}</Text>
        {(card.role || card.company) && (
          <Text style={styles.cardRole}>
            {[card.role, card.company].filter(Boolean).join(' · ')}
          </Text>
        )}
        {card.tagline && <Text style={styles.cardTagline}>{card.tagline}</Text>}
        <View style={styles.qrWrap}>
          <QRCode
            value={shareUrl ?? buildVCard(card)}
            size={168}
            backgroundColor={colors.white}
            color={colors.ink}
          />
        </View>
        {card.email && <Text style={styles.cardMeta}>{card.email}</Text>}
        {card.phone && <Text style={styles.cardMeta}>{card.phone}</Text>}
      </View>

      {shareUrl && !editing && (
        <Button
          title={confirmRotate ? t('card.share.rotateConfirm') : t('card.share.rotate')}
          variant="ghost"
          onPress={() => void rotate()}
        />
      )}

      {editing ? (
        <View style={styles.form}>
          <Eyebrow>{t('card.editHeading')}</Eyebrow>
          <Field
            label={t('field.name')}
            value={draft.name}
            onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
            autoCapitalize="words"
          />
          <Field
            label={t('field.role')}
            value={draft.role}
            onChangeText={(role) => setDraft((d) => ({ ...d, role }))}
            autoCapitalize="words"
          />
          <Field
            label={t('field.company')}
            value={draft.company}
            onChangeText={(company) => setDraft((d) => ({ ...d, company }))}
            autoCapitalize="words"
          />
          <Field
            label={t('field.tagline')}
            value={draft.tagline}
            onChangeText={(tagline) => setDraft((d) => ({ ...d, tagline }))}
          />
          <Field
            label={t('field.email')}
            value={draft.email}
            onChangeText={(email) => setDraft((d) => ({ ...d, email }))}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label={t('field.phone')}
            value={draft.phone}
            onChangeText={(phone) => setDraft((d) => ({ ...d, phone }))}
            keyboardType="phone-pad"
          />
          <Button title={t('card.save')} onPress={save} />
        </View>
      ) : (
        <Button title={t('card.edit')} variant="ghost" onPress={startEditing} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTagline: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.cardMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(8, colors.cherry),
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
  qrWrap: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginVertical: 14,
  },
  cardMeta: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.cardMuted,
  },
  form: {
    gap: 12,
  },
});
