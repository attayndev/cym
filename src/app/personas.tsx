import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { Body, Button, Card, Eyebrow, Heading, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { Persona } from '@/lib/types';
import { useApp } from '@/state/app-context';

interface Draft {
  name: string;
  tagline: string;
  role: string;
  company: string;
  displayName: string;
  email: string;
  phone: string;
}

const emptyDraft: Draft = {
  name: '',
  tagline: '',
  role: '',
  company: '',
  displayName: '',
  email: '',
  phone: '',
};

function draftFrom(p: Persona): Draft {
  return {
    name: p.name,
    tagline: p.tagline ?? '',
    role: p.role ?? '',
    company: p.company ?? '',
    displayName: p.displayName ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
  };
}

export default function PersonasScreen() {
  const {
    db,
    activePersonaId,
    setActivePersona,
    addPersona,
    updatePersona,
    deletePersona,
    setDefaultPersona,
  } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  const startCreate = () => {
    // Multiple personas are the paid tier's core lever (brief §6.7).
    if (!db.profile.isPro) {
      router.push('/paywall');
      return;
    }
    setEditingId(null);
    setDraft(emptyDraft);
    setCreating(true);
  };

  const startEdit = (p: Persona) => {
    setCreating(false);
    setConfirmDeleteId(null);
    setEditingId(p.id);
    setDraft(draftFrom(p));
  };

  const saveDraft = () => {
    if (!draft.name.trim()) return;
    if (creating) {
      addPersona(draft);
      setCreating(false);
    } else if (editingId) {
      updatePersona(editingId, draft);
      setEditingId(null);
    }
    setDraft(emptyDraft);
  };

  const contactCount = (personaId: string) =>
    db.contacts.filter((c) => c.personaId === personaId).length;

  const form = (
    <View style={styles.form}>
      <Field
        label={t('field.name')}
        value={draft.name}
        onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
        autoCapitalize="words"
      />
      <Field
        label={t('field.tagline')}
        value={draft.tagline}
        onChangeText={(tagline) => setDraft((d) => ({ ...d, tagline }))}
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
        label={t('persona.displayName')}
        value={draft.displayName}
        onChangeText={(displayName) => setDraft((d) => ({ ...d, displayName }))}
        autoCapitalize="words"
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
      <View style={styles.formActions}>
        <Button
          title={t('persona.cancel')}
          variant="ghost"
          onPress={() => {
            setCreating(false);
            setEditingId(null);
            setDraft(emptyDraft);
          }}
        />
        <Button title={t('persona.save')} onPress={saveDraft} />
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.topRow}>
        <Heading>{t('persona.title')}</Heading>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <Body muted>{t('persona.subtitle')}</Body>

      {db.personas.map((p) => (
        <Card key={p.id} style={{ gap: 8 }}>
          <Pressable onPress={() => startEdit(p)} style={styles.personaHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                <Text style={styles.personaName}>{p.name}</Text>
                {p.isDefault && <Text style={styles.badge}>{t('persona.default')}</Text>}
                {p.id === activePersonaId && (
                  <Text style={[styles.badge, styles.badgeActive]}>{t('persona.active')}</Text>
                )}
              </View>
              {p.tagline ? <Text style={styles.tagline}>{p.tagline}</Text> : null}
              <Text style={styles.count}>
                {t('persona.contactCount', { n: contactCount(p.id) })}
              </Text>
            </View>
            <Feather name="edit-2" size={15} color={colors.muted} />
          </Pressable>

          {editingId === p.id && form}

          <View style={styles.actionsRow}>
            {p.id !== activePersonaId && (
              <Pressable onPress={() => setActivePersona(p.id)} style={styles.action}>
                <Text style={styles.actionText}>{t('persona.use')}</Text>
              </Pressable>
            )}
            {!p.isDefault && (
              <Pressable onPress={() => setDefaultPersona(p.id)} style={styles.action}>
                <Text style={styles.actionText}>{t('persona.setDefault')}</Text>
              </Pressable>
            )}
            {!p.isDefault &&
              db.personas.length > 1 &&
              (confirmDeleteId === p.id ? (
                <Pressable
                  onPress={() => {
                    deletePersona(p.id);
                    setConfirmDeleteId(null);
                  }}
                  style={styles.action}>
                  <Text style={[styles.actionText, styles.danger]}>
                    {t('persona.deleteConfirm')}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setConfirmDeleteId(p.id)} style={styles.action}>
                  <Text style={[styles.actionText, styles.danger]}>{t('persona.delete')}</Text>
                </Pressable>
              ))}
          </View>
          {confirmDeleteId === p.id && <Body muted>{t('persona.deleteBody')}</Body>}
        </Card>
      ))}

      {creating ? (
        <Card style={{ gap: 8 }}>
          <Eyebrow>{t('persona.new')}</Eyebrow>
          {form}
        </Card>
      ) : (
        <Button title={t('persona.new')} variant="accent" onPress={startCreate} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  personaName: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.ink,
  },
  badge: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    backgroundColor: colors.cream,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeActive: {
    color: colors.cream,
    backgroundColor: colors.accent,
  },
  tagline: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkSoft,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  action: {
    paddingVertical: 2,
  },
  actionText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.inkSoft,
  },
  danger: {
    color: colors.danger,
  },
  form: {
    gap: 10,
    paddingTop: 4,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
