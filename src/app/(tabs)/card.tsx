import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Field } from '@/components/field';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Body, Button, Display, Eyebrow, Row, Screen } from '@/components/ui';
import { MARK_SVG } from '@/constants/mark-svg';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { personaCardFields } from '@/lib/personas';
import {
  buildShareUrl,
  buildWalletPassUrl,
  getOrCreateShareToken,
  rotateShareToken,
  shareBaseUrl,
} from '@/lib/share';
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
  const [walletBusy, setWalletBusy] = useState(false);

  // Signed in with a share host configured → the QR carries a token URL to the
  // landing page. Until the token arrives (or offline) it stays the vCard QR.
  const userId = session?.user?.id;
  // Focus-driven (not just mount): signing in elsewhere and coming back must
  // upgrade the QR from the vCard fallback to the share link.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setConfirmRotate(false);
      if (!userId || !shareBaseUrl() || !activePersonaId) {
        setShareUrl(null);
        return;
      }
      (async () => {
        try {
          const token = await getOrCreateShareToken(activePersonaId);
          if (!cancelled) setShareUrl(token ? buildShareUrl(token) : null);
        } catch (e) {
          // Offline: the vCard QR still works — but say why in dev logs.
          console.warn('share token fetch failed', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, activePersonaId]),
  );

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

  // Fetches a fresh token the same way the share link does, then hands off to
  // the OS: Safari shows the Add-to-Wallet sheet, Chrome/Android does its own.
  const openWalletPass = async (type: 'google' | 'apple') => {
    if (!activePersonaId || walletBusy) return;
    setWalletBusy(true);
    try {
      const token = await getOrCreateShareToken(activePersonaId);
      const url = token ? buildWalletPassUrl(token, type) : null;
      if (url) await Linking.openURL(url);
    } catch (e) {
      console.warn('wallet pass fetch failed', e);
    } finally {
      setWalletBusy(false);
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
    // Editing edits the card you're looking at. The DEFAULT persona is the
    // base identity: its edits write the profile — including clearing a
    // field, which really clears it — and any stale overrides on the default
    // persona are wiped so the base stays the single truth. Every other
    // persona edits only its own overrides; clearing there means "inherit".
    const isDefaultPersona = !activePersona || activePersona.id === profile.defaultPersonaId;
    if (isDefaultPersona) {
      updateProfile({
        name: draft.name.trim() || profile.name,
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        role: draft.role.trim() || undefined,
        company: draft.company.trim() || undefined,
      });
      if (activePersona) {
        updatePersona(activePersona.id, {
          displayName: '',
          email: '',
          phone: '',
          role: '',
          company: '',
          tagline: draft.tagline,
        });
      }
    } else {
      updatePersona(activePersona!.id, {
        displayName: draft.name,
        email: draft.email,
        phone: draft.phone,
        role: draft.role,
        company: draft.company,
        tagline: draft.tagline,
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
          {/* Always CYM-branded, whatever the persona or QR mode — high error
              correction leaves room for the mark even on dense vCard codes. */}
          <QRCode
            value={shareUrl ?? buildVCard(card)}
            size={168}
            backgroundColor={colors.white}
            color={colors.ink}
            ecl="H"
            logoSVG={MARK_SVG}
            logoSize={38}
            logoBackgroundColor={colors.cream}
            logoMargin={4}
            logoBorderRadius={21}
          />
        </View>
        <Text style={styles.cardBrand}>{t('card.brand')}</Text>
        <Text style={styles.modeHint}>
          {shareUrl ? t('card.mode.link') : t('card.mode.vcard')}
        </Text>
        {card.email && <Text style={styles.cardMeta}>{card.email}</Text>}
        {card.phone && <Text style={styles.cardMeta}>{card.phone}</Text>}
      </View>

      {shareUrl && !editing && (
        <Row style={styles.walletRow}>
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => void openWalletPass('apple')}
              disabled={walletBusy}
              style={[styles.walletButton, walletBusy && styles.walletButtonDisabled]}>
              <Feather name="credit-card" size={15} color={colors.ink} />
              <Text style={styles.walletButtonText}>{t('card.wallet.apple')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void openWalletPass('google')}
              disabled={walletBusy}
              style={[styles.walletButton, walletBusy && styles.walletButtonDisabled]}>
              <Feather name="credit-card" size={15} color={colors.ink} />
              <Text style={styles.walletButtonText}>{t('card.wallet.google')}</Text>
            </Pressable>
          )}
        </Row>
      )}

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
  cardBrand: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.cardMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  modeHint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.cardMuted,
    textAlign: 'center',
    marginTop: 2,
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
  walletRow: {
    justifyContent: 'center',
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.espresso,
  },
  walletButtonDisabled: {
    opacity: 0.5,
  },
  walletButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.ink,
  },
  form: {
    gap: 12,
  },
});
