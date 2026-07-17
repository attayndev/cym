import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Field } from '@/components/field';
import { Body, Button, Chip, Eyebrow, Heading, Row, Screen, ScreenLoading } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { Category, Contact, ContextEntry, Importance } from '@/lib/types';
import { maskBirthday, maskPhone } from '@/lib/format';
import { useApp } from '@/state/app-context';

const CATEGORIES: Category[] = [
  'professional',
  'friend',
  'family',
  'mentor',
  'client',
  'other',
];
const CADENCES = [7, 14, 30, 60, 90, 180];

export default function EditContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useApp();
  const { t } = useTranslation();

  if (!db) return <ScreenLoading />;

  const contact = db.contacts.find((c) => c.id === id);
  const context = db.contexts.find((c) => c.contactId === id);

  if (!contact) {
    return (
      <Screen>
        <Body>{t('contact.notFound')}</Body>
      </Screen>
    );
  }

  // Keyed on contact.id so the form's useState initializers re-run once the
  // real record has hydrated — on web reload/deep-link the DB arrives after
  // mount, and seeding state straight off `contact?.field` would otherwise
  // freeze every field empty and let Save blank the contact.
  return <EditContactForm key={contact.id} contact={contact} context={context} />;
}

function EditContactForm({
  contact,
  context,
}: {
  contact: Contact;
  context: ContextEntry | undefined;
}) {
  const { db, updateContact, updateContext } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  const [firstName, setFirstName] = useState(contact.firstName ?? '');
  const [lastName, setLastName] = useState(contact.lastName ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [company, setCompany] = useState(contact.company ?? '');
  const [role, setRole] = useState(contact.role ?? '');
  const [birthday, setBirthday] = useState(contact.birthday ?? '');
  const [category, setCategory] = useState<Category>(contact.category ?? 'professional');
  const [importance, setImportance] = useState<Importance>(contact.importance ?? 2);
  const [cadenceDays, setCadenceDays] = useState<number>(contact.cadenceDays ?? 60);

  const [whereMet, setWhereMet] = useState(context?.whereMet ?? '');
  const [discussed, setDiscussed] = useState(context?.discussed ?? '');
  const [whyMatters, setWhyMatters] = useState(context?.whyMatters ?? '');
  const [personaId, setPersonaId] = useState(contact.personaId ?? '');

  if (!db) return <ScreenLoading />;

  const cadenceLabel = (days: number) =>
    days < 30
      ? t('cadence.days', { n: days })
      : days === 30
        ? t('cadence.month')
        : days === 60
          ? t('cadence.2months')
          : days === 90
            ? t('cadence.quarter')
            : t('cadence.6months');

  const birthdayValid =
    birthday === '' || /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(birthday);

  const save = () => {
    if (!birthdayValid) return;
    updateContact(contact.id, {
      firstName,
      lastName,
      email,
      phone,
      company,
      role,
      birthday: /^\d{2}-\d{2}$/.test(birthday) ? birthday : undefined,
      category,
      importance,
      cadenceDays,
      personaId: personaId || undefined,
    });
    updateContext(contact.id, { whereMet, discussed, whyMatters });
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/people');
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Heading>{t('edit.title')}</Heading>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="x" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            <Eyebrow>{t('edit.section.who')}</Eyebrow>
            <Field label={t('field.firstName')} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            <Field label={t('field.lastName')} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          </View>

          <View style={{ gap: 12 }}>
            <Eyebrow>{t('edit.section.reach')}</Eyebrow>
            <Field label={t('field.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field label={t('field.phone')} value={phone} onChangeText={(v) => setPhone(maskPhone(v))} keyboardType="phone-pad" />
          </View>

          <View style={{ gap: 12 }}>
            <Eyebrow>{t('edit.section.work')}</Eyebrow>
            <Field label={t('field.company')} value={company} onChangeText={setCompany} autoCapitalize="words" />
            <Field label={t('field.role')} value={role} onChangeText={setRole} autoCapitalize="words" />
            <Field
              label={t('field.birthday')}
              value={birthday}
              onChangeText={(v) => setBirthday(maskBirthday(v))} keyboardType="number-pad"
              placeholder="06-14"
              error={birthdayValid ? undefined : t('edit.birthday.invalid')}
              hint={t('edit.birthday.hint')}
            />
          </View>

          {db.personas.length > 1 && (
            <View style={{ gap: 8 }}>
              <Eyebrow>{t('persona.title')}</Eyebrow>
              <Row>
                {db.personas.map((p) => (
                  <Chip key={p.id} label={p.name} selected={personaId === p.id} onPress={() => setPersonaId(p.id)} />
                ))}
              </Row>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Eyebrow>{t('capture.category.label')}</Eyebrow>
            <Row>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={t(`category.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </Row>
          </View>

          <View style={{ gap: 8 }}>
            <Eyebrow>{t('capture.importance.label')}</Eyebrow>
            <Row>
              {([1, 2, 3] as Importance[]).map((i) => (
                <Chip key={i} label={t(`importance.${i}`)} selected={importance === i} onPress={() => setImportance(i)} />
              ))}
            </Row>
          </View>

          <View style={{ gap: 8 }}>
            <Eyebrow>{t('capture.cadence.label')}</Eyebrow>
            <Row>
              {CADENCES.map((days) => (
                <Chip key={days} label={cadenceLabel(days)} selected={cadenceDays === days} onPress={() => setCadenceDays(days)} />
              ))}
            </Row>
          </View>

          <View style={{ gap: 8 }}>
            <Eyebrow>{t('edit.context.title')}</Eyebrow>
            <Field label={t('capture.field.whereMet')} value={whereMet} onChangeText={setWhereMet} />
            <Field label={t('capture.field.discussed')} value={discussed} onChangeText={setDiscussed} multiline />
            <Field label={t('capture.field.whyMatters')} value={whyMatters} onChangeText={setWhyMatters} multiline />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button title={t('edit.save')} onPress={save} disabled={!birthdayValid} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 16,
  },
  footer: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
  },
});
